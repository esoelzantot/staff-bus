/**
 * Daily reset (Admin SDK). Runs automatically from .github/workflows/daily-reset.yml at ~00:10 Cairo time.
 *
 *   npm run reset-daily -- --dry-run   # show what would change, writes nothing
 *   npm run reset-daily -- --force     # run now (ignores the time window and the "already done today" check)
 *
 * New-day state of every bus:
 *   - MAIN employees      → IN for Going and Returning, and today counts as one IN day for both (tally +1)
 *   - WAITING employees   → OUT   (otherwise main + waiting could exceed the capacity), tally unchanged
 *   - daily IN record     → employees/{id}/attendance/{today} created for EVERY employee with those statuses
 *   - bus counters        → = number of employees that are IN
 *   - active direction    → Going (so the morning "وصلنا" / tracking are available)
 *   - shared location     → stopped
 * Idempotent: an employee that already has today's record is left untouched (so a re-run, or a late run after
 * somebody already toggled, can never count a day twice), and meta/dailyReset remembers the last Cairo day done.
 */
import { FieldValue, adminDb, projectId } from './lib/admin';
import { commitUnits, loadEmployeeStates, seedUnit, type Op } from './lib/attendance';
import { RESET_WINDOW_END_HOUR, cairoNow } from './lib/cairoTime';
import { planBusReset } from './lib/dailyReset';

const args = process.argv.slice(2);
const force = args.includes('--force');
const dryRun = args.includes('--dry-run');

async function main() {
  const { date: today, hour } = cairoNow();
  const metaRef = adminDb.collection('meta').doc('dailyReset');

  if (!force) {
    if (hour >= RESET_WINDOW_END_HOUR) return console.log(`Skipped: ${hour}:xx Cairo time is outside the 00:00–05:59 window.`);
    if ((await metaRef.get()).data()?.lastResetDate === today) return console.log(`Skipped: ${today} was already reset.`);
  }

  console.log(`Project ${projectId} – resetting for ${today}${dryRun ? ' (DRY RUN)' : ''}`);
  const units: Op[][] = [];
  let failed = false;
  let seeded = 0;

  for (const busDoc of (await adminDb.collection('buses').get()).docs) {
    const docs = (await adminDb.collection('employees').where('busId', '==', busDoc.id).get()).docs;
    const plan = planBusReset(busDoc.data().capacity as number, await loadEmployeeStates(docs, today));
    if ('error' in plan) {
      console.error(`Bus ${busDoc.id}: ${plan.error} – skipped.`);
      failed = true;
      continue;
    }
    const todo = plan.employees.filter((p) => p.seed);
    console.log(
      `Bus ${busDoc.id}: ${todo.length}/${plan.employees.length} employee(s) start the new day, counters → ${plan.goingCount}/${plan.returningCount}`,
    );
    seeded += todo.length;
    todo.forEach((p) => units.push(seedUnit(p, today)));

    const busOps: Op[] = [
      (b) =>
        b.update(busDoc.ref, {
          goingCount: plan.goingCount,
          returningCount: plan.returningCount,
          activeTripType: 'going',
          updatedAt: FieldValue.serverTimestamp(),
        }),
    ];
    const loc = await adminDb.collection('busLocations').doc(busDoc.id).get();
    if (loc.exists && loc.data()?.active) {
      busOps.push((b) => b.update(loc.ref, { active: false, updatedAt: FieldValue.serverTimestamp() }));
    }
    units.push(busOps);
  }

  if (dryRun) return console.log('Dry run – nothing written.');

  await commitUnits(units);
  if (failed) {
    console.error('Some buses were skipped; not marking the day as done so the next run retries.');
    process.exit(1);
  }
  await metaRef.set({ lastResetDate: today, resetAt: FieldValue.serverTimestamp(), employeesChanged: seeded });
  console.log(`Done. ${seeded} employee(s) started ${today}.`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
