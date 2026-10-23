/**
 * The daily reset itself, independent of how it is started (Vercel /api/daily-reset called by cron-job.org, the
 * GitHub Actions backup, or the CLI) and of which Firestore it talks to (production or the emulator in tests/reset).
 *
 * New-day state of every bus – the rule, without exceptions:
 *   - EVERY main employee     → IN for Going and Returning
 *   - EVERY waiting employee  → OUT for Going and Returning
 *     (also someone who already pressed IN / OUT after midnight, before the reset ran)
 *   - IN tallies              → today counted for the main employees, exactly once (see dailyReset.ts tallyDelta)
 *   - daily IN record         → employees/{id}/attendance/{today} = the start statuses, for everyone
 *   - bus counters            → = number of main employees
 *   - active direction        → Going (so the morning "وصلنا" / tracking are available)
 *   - shared location         → stopped
 *
 * Each bus is reset in ONE transaction: the employees, their records, the bus and its location are read and written
 * together, so an IN / OUT pressed at the same moment can never leave the counters out of step with the statuses
 * (Firestore retries the transaction instead).
 *
 * Once per bus per day: the bus remembers the day it was reset (buses/{id}.lastResetDate, written in the same
 * transaction). Another run the same day – a retry, a second scheduler – leaves it alone, so what people choose
 * AFTER the reset is never overwritten. Only `force` applies the reset again.
 */
import { FieldValue, type Firestore } from 'firebase-admin/firestore';
import { MAX_WRITES, loadEmployeeStates, resetUnit, type Op } from './attendance.js';
import { RESET_WINDOW_END_HOUR, cairoNow } from './cairoTime.js';
import { planBusReset } from './dailyReset.js';

export type BusResult =
  | {
      busId: string;
      status: 'done';
      /** Employees put back to the start of the day (all of the bus). */
      employees: number;
      /** Employees who had already chosen something else after midnight and were put back to the start. */
      overridden: string[];
      goingCount: number;
      returningCount: number;
    }
  | { busId: string; status: 'already-done' }
  | { busId: string; status: 'error'; error: string }
  | { busId: string; status: 'gone' };

export interface ResetResult {
  buses: BusResult[];
  /** Employees reset in this run. */
  employees: number;
  /** Employees whose bus does not exist – nobody can reset them (fix their bus in "إدارة الموظفين"). */
  unassigned: string[];
  /** At least one bus could not be reset – the day must NOT be marked as done, so the next run retries. */
  failed: boolean;
}

export const describeError = (err: unknown) => (err instanceof Error ? err.message : String(err));

export interface BusOptions {
  dryRun?: boolean;
  /** Reset again even if the bus was already reset today. */
  force?: boolean;
}

export function resetBus(db: Firestore, busId: string, today: string, options: BusOptions = {}): Promise<BusResult> {
  const busRef = db.collection('buses').doc(busId);
  const locRef = db.collection('busLocations').doc(busId);

  return db.runTransaction(async (tx): Promise<BusResult> => {
    // all reads first (a Firestore transaction requirement)
    const bus = await tx.get(busRef);
    if (!bus.exists) return { busId, status: 'gone' }; // deleted in the meantime
    if (!options.force && bus.get('lastResetDate') === today) return { busId, status: 'already-done' };
    const docs = (await tx.get(db.collection('employees').where('busId', '==', busId))).docs;
    const states = await loadEmployeeStates(db, docs, today, tx);
    const loc = await tx.get(locRef);

    const capacity = bus.get('capacity');
    if (typeof capacity !== 'number' || capacity < 1) {
      return { busId, status: 'error', error: `the bus has no valid capacity (${String(capacity)})` };
    }
    const plan = planBusReset(capacity, states);
    if ('error' in plan) return { busId, status: 'error', error: plan.error };

    const result: BusResult = {
      busId,
      status: 'done',
      employees: plan.employees.length,
      overridden: plan.employees.filter((p) => p.overridden).map((p) => p.id),
      goingCount: plan.goingCount,
      returningCount: plan.returningCount,
    };
    if (options.dryRun) return result;

    const ops: Op[] = plan.employees.flatMap((p) => resetUnit(db, p, today));
    ops.push((w) =>
      w.update(busRef, {
        goingCount: plan.goingCount,
        returningCount: plan.returningCount,
        activeTripType: 'going',
        lastResetDate: today,
        updatedAt: FieldValue.serverTimestamp(),
      }),
    );
    if (loc.exists && loc.get('active')) {
      ops.push((w) => w.update(locRef, { active: false, updatedAt: FieldValue.serverTimestamp() }));
    }
    if (ops.length > MAX_WRITES) {
      return { busId, status: 'error', error: `${ops.length} writes do not fit in one transaction (max ${MAX_WRITES})` };
    }
    ops.forEach((op) => op(tx));
    return result;
  });
}

/** Resets every bus. A bus that fails does not stop the others; the result says whether any failed. */
export async function resetAllBuses(db: Firestore, today: string, options: BusOptions = {}): Promise<ResetResult> {
  const busDocs = (await db.collection('buses').get()).docs;
  const buses: BusResult[] = [];
  for (const busDoc of busDocs) {
    try {
      buses.push(await resetBus(db, busDoc.id, today, options));
    } catch (err) {
      buses.push({ busId: busDoc.id, status: 'error', error: describeError(err) });
    }
  }
  const busIds = new Set(busDocs.map((b) => b.id));
  const unassigned = (await db.collection('employees').get()).docs
    .filter((d) => !busIds.has(String(d.get('busId'))))
    .map((d) => d.id);
  return {
    buses,
    employees: buses.reduce((n, b) => n + (b.status === 'done' ? b.employees : 0), 0),
    unassigned,
    failed: buses.some((b) => b.status === 'error'),
  };
}

export interface RunOptions {
  /** Ignore the 00:00–05:59 Cairo window and the "already done today" checks (day and bus). */
  force?: boolean;
  /** Plan only, write nothing. */
  dryRun?: boolean;
  /** Who started it – stored in meta/dailyReset, handy when looking back. */
  source?: string;
  now?: Date;
}

export type RunOutcome =
  | { status: 'skipped'; day: string; reason: 'outside-window' | 'already-done' }
  | {
      status: 'done' | 'dry-run' | 'failed';
      day: string;
      employees: number;
      unassigned: string[];
      buses: BusResult[];
    };

/**
 * One complete daily reset, safe to start any number of times (several schedulers may call it):
 *   - only between 00:00 and 05:59 Cairo, so a day in progress is never reset;
 *   - only once per Cairo day (meta/dailyReset.lastResetDate, and per bus buses/{id}.lastResetDate);
 *   - a day where a bus failed is NOT marked as done, so the next call retries that bus (the others stay done).
 */
export async function runDailyReset(db: Firestore, options: RunOptions = {}): Promise<RunOutcome> {
  const { date: day, hour } = cairoNow(options.now);
  const metaRef = db.collection('meta').doc('dailyReset');

  if (!options.force) {
    if (hour >= RESET_WINDOW_END_HOUR) return { status: 'skipped', day, reason: 'outside-window' };
    if ((await metaRef.get()).data()?.lastResetDate === day) return { status: 'skipped', day, reason: 'already-done' };
  }

  const result = await resetAllBuses(db, day, { dryRun: options.dryRun, force: options.force });
  const outcome = { day, employees: result.employees, unassigned: result.unassigned, buses: result.buses };
  if (options.dryRun) return { status: 'dry-run', ...outcome };
  if (result.failed) return { status: 'failed', ...outcome };

  await metaRef.set({
    lastResetDate: day,
    resetAt: FieldValue.serverTimestamp(),
    employeesReset: result.employees,
    source: options.source ?? 'unknown',
  });
  return { status: 'done', ...outcome };
}
