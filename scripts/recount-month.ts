/**
 * Recomputes the IN counters of every employee as THIS MONTH's IN days, from the daily records – without changing
 * anyone's statuses. The nightly reset does the same for every bus; run this after changing records by hand, or
 * once when moving from the old lifetime counters to monthly ones.
 *
 *   npm run recount-month -- --dry-run   # show the new numbers, write nothing
 *   npm run recount-month                # write them
 *
 * Today counts with the CURRENT statuses; an employee without today's record gets one (from those statuses).
 * Safe to run again: the numbers are recomputed, never added up.
 */
import { adminDb, projectId } from './lib/admin';
import { loadEmployeeStates, MAX_WRITES, resetUnit } from '../api/_lib/attendance.js';
import { cairoNow } from '../api/_lib/cairoTime.js';
import { planRecount } from '../api/_lib/dailyReset.js';

const dryRun = process.argv.includes('--dry-run');

async function main() {
  const { date: today } = cairoNow();
  console.log(`Project ${projectId} – this month's IN days up to ${today}${dryRun ? ' (DRY RUN)' : ''}`);

  for (const bus of (await adminDb.collection('buses').get()).docs) {
    // one transaction per bus: statuses read and counters written together
    const rows = await adminDb.runTransaction(async (tx) => {
      const docs = (await tx.get(adminDb.collection('employees').where('busId', '==', bus.id))).docs;
      const plans = planRecount(await loadEmployeeStates(adminDb, docs, today, tx));
      if (!dryRun) {
        const ops = plans.flatMap((p) => resetUnit(adminDb, p, today));
        if (ops.length > MAX_WRITES) throw new Error(`Bus ${bus.id}: too many writes for one transaction.`);
        ops.forEach((op) => op(tx));
      }
      return plans.map((p) => ({
        employee: p.id,
        name: String(docs.find((d) => d.id === p.id)?.get('name') ?? ''),
        going: p.goingInCount,
        returning: p.returningInCount,
        before: `${p.goingInCount - p.goingTally} / ${p.returningInCount - p.returningTally}`,
      }));
    });
    console.log(`Bus ${bus.id}:`);
    console.table(rows);
  }
  console.log(dryRun ? 'Dry run – nothing written.' : 'Done.');
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
