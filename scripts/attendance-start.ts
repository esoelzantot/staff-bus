/**
 * One-time start of the daily IN record on a system that already has employees. Run it once after deploying the
 * version that introduces the record (and the new rules):
 *
 *   npm run attendance-start -- --dry-run   # show what would be written
 *   npm run attendance-start                # do it
 *
 * For every employee that has no record for TODAY (Cairo day) it creates today's record from the statuses the
 * person has right now, and adds today to the IN tally of every direction that is IN. From tomorrow on the nightly
 * reset (reset-daily) does this for everyone. Safe to run again: employees that already have today's record are
 * skipped, so nothing is counted twice.
 */
import { adminDb, projectId } from './lib/admin';
import { commitUnits, loadEmployeeStates, seedUnit } from './lib/attendance';
import { cairoNow } from './lib/cairoTime';
import { planSnapshot } from './lib/dailyReset';

const dryRun = process.argv.includes('--dry-run');

async function main() {
  const { date: today } = cairoNow();
  console.log(`Project ${projectId} – starting the daily record for ${today}${dryRun ? ' (DRY RUN)' : ''}`);

  const docs = (await adminDb.collection('employees').get()).docs;
  const plans = planSnapshot(await loadEmployeeStates(docs, today));
  const inGoing = plans.filter((p) => p.goingTally).length;
  const inReturning = plans.filter((p) => p.returningTally).length;
  console.log(
    `${plans.length} of ${docs.length} employee(s) get today's record (IN today: ${inGoing} going, ${inReturning} returning).`,
  );
  if (dryRun || plans.length === 0) return console.log(dryRun ? 'Dry run – nothing written.' : 'Nothing to do.');

  await commitUnits(plans.map((p) => seedUnit(p, today)));
  console.log('Done.');
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
