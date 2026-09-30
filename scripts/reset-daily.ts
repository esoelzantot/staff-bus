/**
 * Daily reset (Admin SDK). Runs automatically from .github/workflows/daily-reset.yml at ~00:10 Cairo time.
 *
 *   npm run reset-daily -- --dry-run   # show what would change, writes nothing
 *   npm run reset-daily -- --force     # run now (ignores the time window and the "already done today" check)
 *
 * New-day state of every bus:
 *   - MAIN employees      → IN for Going and Returning
 *   - WAITING employees   → OUT   (otherwise main + waiting could exceed the capacity)
 *   - bus counters        → = number of main employees
 *   - active direction    → Going (so the morning "وصلنا" / tracking are available)
 *   - shared location     → stopped
 * The IN tallies (goingInCount / returningInCount) are NOT touched.
 * Idempotent: meta/dailyReset remembers the last Cairo day that was reset.
 */
import type { WriteBatch } from 'firebase-admin/firestore';
import { FieldValue, adminDb, projectId } from './lib/admin';
import { RESET_WINDOW_END_HOUR, cairoNow } from './lib/cairoTime';
import { planBusReset, type EmployeeState } from './lib/dailyReset';

const args = process.argv.slice(2);
const force = args.includes('--force');
const dryRun = args.includes('--dry-run');

type Op = (batch: WriteBatch) => void;

async function commit(ops: Op[]) {
  for (let i = 0; i < ops.length; i += 400) {
    const batch = adminDb.batch();
    ops.slice(i, i + 400).forEach((op) => op(batch));
    await batch.commit();
  }
}

async function main() {
  const { date: today, hour } = cairoNow();
  const metaRef = adminDb.collection('meta').doc('dailyReset');

  if (!force) {
    if (hour >= RESET_WINDOW_END_HOUR) return console.log(`Skipped: ${hour}:xx Cairo time is outside the 00:00–05:59 window.`);
    if ((await metaRef.get()).data()?.lastResetDate === today) return console.log(`Skipped: ${today} was already reset.`);
  }

  console.log(`Project ${projectId} – resetting for ${today}${dryRun ? ' (DRY RUN)' : ''}`);
  const ops: Op[] = [];
  let failed = false;
  let changed = 0;

  for (const busDoc of (await adminDb.collection('buses').get()).docs) {
    const employees = (await adminDb.collection('employees').where('busId', '==', busDoc.id).get()).docs.map(
      (d) => ({ id: d.id, ...d.data() }) as EmployeeState,
    );
    const plan = planBusReset(busDoc.data().capacity as number, employees);
    if ('error' in plan) {
      console.error(`Bus ${busDoc.id}: ${plan.error} – skipped.`);
      failed = true;
      continue;
    }
    console.log(`Bus ${busDoc.id}: ${plan.updates.length} employee(s) to reset, counters → ${plan.count}/${plan.count}`);
    changed += plan.updates.length;

    for (const u of plan.updates) {
      ops.push((b) =>
        b.update(adminDb.collection('employees').doc(u.id), {
          goingStatus: u.status,
          returningStatus: u.status,
          updatedAt: FieldValue.serverTimestamp(),
        }),
      );
    }
    ops.push((b) =>
      b.update(busDoc.ref, {
        goingCount: plan.count,
        returningCount: plan.count,
        activeTripType: 'going',
        updatedAt: FieldValue.serverTimestamp(),
      }),
    );
    const loc = await adminDb.collection('busLocations').doc(busDoc.id).get();
    if (loc.exists && loc.data()?.active) {
      ops.push((b) => b.update(loc.ref, { active: false, updatedAt: FieldValue.serverTimestamp() }));
    }
  }

  if (dryRun) return console.log('Dry run – nothing written.');

  await commit(ops);
  if (failed) {
    console.error('Some buses were skipped; not marking the day as done so the next run retries.');
    process.exit(1);
  }
  await metaRef.set({ lastResetDate: today, resetAt: FieldValue.serverTimestamp(), employeesChanged: changed });
  console.log(`Done. ${changed} employee(s) reset.`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
