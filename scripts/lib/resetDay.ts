/**
 * The daily reset itself, independent of how it is started (CLI / GitHub Actions) and of which Firestore it talks
 * to (production or the emulator in tests/reset).
 *
 * New-day state of every bus:
 *   - MAIN employees      → IN for Going and Returning, and today counts as one IN day for both (tally +1)
 *   - WAITING employees   → OUT for Going and Returning, tally unchanged
 *   - daily IN record     → employees/{id}/attendance/{today} created for EVERY employee with those statuses
 *   - bus counters        → = number of employees that are IN
 *   - active direction    → Going (so the morning "وصلنا" / tracking are available)
 *   - shared location     → stopped
 *
 * Each bus is reset in ONE transaction: the employees, their records, the bus and its location are read and written
 * together, so an IN / OUT pressed at the same moment can never leave the counters out of step with the statuses
 * (Firestore retries the transaction instead).
 *
 * Main employees come first: a WAITING employee who took a seat after midnight, before the (often late) reset ran,
 * gives it back if the bus would otherwise be over capacity – the most recent first, tally and record corrected.
 *
 * Idempotent: an employee that already has today's record is left untouched – a re-run, or a late run after the
 * person already pressed IN / OUT today, can never count a day twice or overwrite what they chose.
 */
import { FieldValue, type Firestore } from 'firebase-admin/firestore';
import { MAX_WRITES, loadEmployeeStates, planUnit, type Op } from './attendance';
import { planBusReset } from './dailyReset';

export type BusResult =
  | {
      busId: string;
      status: 'done';
      seeded: number;
      /** Waiting employees who gave back a seat they took after midnight (main employees come first). */
      bumped: string[];
      total: number;
      goingCount: number;
      returningCount: number;
    }
  | { busId: string; status: 'error'; error: string }
  | { busId: string; status: 'gone' };

export interface ResetResult {
  buses: BusResult[];
  /** Employees that started the new day (statuses + record + tally) in this run. */
  seeded: number;
  /** At least one bus could not be reset – the day must NOT be marked as done, so the next run retries. */
  failed: boolean;
}

export const describeError = (err: unknown) => (err instanceof Error ? err.message : String(err));

export function resetBus(db: Firestore, busId: string, today: string, dryRun = false): Promise<BusResult> {
  const busRef = db.collection('buses').doc(busId);
  const locRef = db.collection('busLocations').doc(busId);

  return db.runTransaction(async (tx): Promise<BusResult> => {
    // all reads first (a Firestore transaction requirement)
    const bus = await tx.get(busRef);
    if (!bus.exists) return { busId, status: 'gone' }; // deleted in the meantime
    const docs = (await tx.get(db.collection('employees').where('busId', '==', busId))).docs;
    const states = await loadEmployeeStates(db, docs, today, tx);
    const loc = await tx.get(locRef);

    const capacity = bus.data()?.capacity;
    if (typeof capacity !== 'number' || capacity < 1) {
      return { busId, status: 'error', error: `the bus has no valid capacity (${String(capacity)})` };
    }
    const plan = planBusReset(capacity, states);
    if ('error' in plan) return { busId, status: 'error', error: plan.error };

    const result: BusResult = {
      busId,
      status: 'done',
      seeded: plan.employees.filter((p) => p.seed).length,
      bumped: plan.employees.filter((p) => p.bumped).map((p) => p.id),
      total: plan.employees.length,
      goingCount: plan.goingCount,
      returningCount: plan.returningCount,
    };
    if (dryRun) return result;

    const ops: Op[] = plan.employees.flatMap((p) => planUnit(db, p, today));
    ops.push((w) =>
      w.update(busRef, {
        goingCount: plan.goingCount,
        returningCount: plan.returningCount,
        activeTripType: 'going',
        updatedAt: FieldValue.serverTimestamp(),
      }),
    );
    if (loc.exists && loc.data()?.active) {
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
export async function resetAllBuses(db: Firestore, today: string, dryRun = false): Promise<ResetResult> {
  const buses: BusResult[] = [];
  for (const busDoc of (await db.collection('buses').get()).docs) {
    try {
      buses.push(await resetBus(db, busDoc.id, today, dryRun));
    } catch (err) {
      buses.push({ busId: busDoc.id, status: 'error', error: describeError(err) });
    }
  }
  return {
    buses,
    seeded: buses.reduce((n, b) => n + (b.status === 'done' ? b.seeded : 0), 0),
    failed: buses.some((b) => b.status === 'error'),
  };
}
