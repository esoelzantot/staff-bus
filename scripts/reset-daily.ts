/**
 * Daily reset (Admin SDK). Runs automatically from .github/workflows/daily-reset.yml shortly after midnight Cairo.
 * What it does to each bus: see scripts/lib/resetDay.ts.
 *
 *   npm run reset-daily -- --dry-run   # show what would change, writes nothing
 *   npm run reset-daily -- --force     # run now (ignores the time window and the "already done today" check)
 *
 * The workflow starts it several times a night (GitHub delays or drops scheduled runs); only the first run inside
 * the 00:00–05:59 Cairo window does the work, and meta/dailyReset remembers the day so the others exit at once.
 * Exit code 1 = the day is NOT reset (GitHub then e-mails the failure); every reason is printed as an annotation.
 */
import { annotateError, annotateNotice, summary } from './lib/ghActions';
import { RESET_WINDOW_END_HOUR, cairoNow } from './lib/cairoTime';
import { describeError, resetAllBuses } from './lib/resetDay';

const args = process.argv.slice(2);
const force = args.includes('--force');
const dryRun = args.includes('--dry-run');

const TITLE = 'Daily reset';

async function main(): Promise<number> {
  const { date: today, hour } = cairoNow();

  if (!force && hour >= RESET_WINDOW_END_HOUR) {
    console.log(`Skipped: ${hour}:xx Cairo time is outside the 00:00–05:59 window.`);
    return 0;
  }

  // Imported here, not at the top: a broken key / missing setting must end up in the error report below.
  const { FieldValue, adminDb, projectId } = await import('./lib/admin');
  const metaRef = adminDb.collection('meta').doc('dailyReset');

  if (!force && (await metaRef.get()).data()?.lastResetDate === today) {
    console.log(`Skipped: ${today} was already reset.`);
    return 0;
  }

  console.log(`Project ${projectId} – resetting for ${today}${dryRun ? ' (DRY RUN)' : ''}`);
  const result = await resetAllBuses(adminDb, today, dryRun);

  const rows = result.buses.map((b) => {
    if (b.status === 'done') {
      console.log(
        `Bus ${b.busId}: ${b.seeded}/${b.total} employee(s) start the new day, counters → ${b.goingCount}/${b.returningCount}`,
      );
      if (b.bumped.length > 0) {
        annotateNotice(`${TITLE}: bus ${b.busId}`, `Seat given back to the main employees by: ${b.bumped.join(', ')}`);
      }
      const note = b.bumped.length > 0 ? ` (seat given back: ${b.bumped.join(', ')})` : '';
      return `| ${b.busId} | ✅${note} | ${b.seeded}/${b.total} | ${b.goingCount} / ${b.returningCount} |`;
    }
    if (b.status === 'gone') return `| ${b.busId} | deleted during the run | – | – |`;
    annotateError(`${TITLE}: bus ${b.busId} skipped`, b.error);
    return `| ${b.busId} | ❌ ${b.error} | – | – |`;
  });
  summary(
    [
      `### Daily reset ${today}${dryRun ? ' (dry run)' : ''}`,
      '',
      '| Bus | Result | Employees reset | Going / Returning IN |',
      '| --- | --- | --- | --- |',
      ...rows,
    ].join('\n'),
  );

  if (result.buses.length === 0) annotateNotice(TITLE, 'There are no buses in the project.');
  if (dryRun) {
    console.log('Dry run – nothing written.');
    return result.failed ? 1 : 0;
  }
  if (result.failed) {
    annotateError(TITLE, 'Some buses were skipped; the day is not marked as done, so the next run retries.');
    return 1;
  }

  await metaRef.set({ lastResetDate: today, resetAt: FieldValue.serverTimestamp(), employeesChanged: result.seeded });
  console.log(`Done. ${result.seeded} employee(s) started ${today}.`);
  annotateNotice(TITLE, `${today}: ${result.seeded} employee(s) started the new day.`);
  return 0;
}

// exitCode (not process.exit) so the output is fully written before Node ends (stdout is a pipe on GitHub).
main()
  .then((code) => {
    process.exitCode = code;
  })
  .catch((err) => {
    annotateError(`${TITLE} failed`, describeError(err));
    if (err instanceof Error && err.stack) console.error(err.stack);
    process.exitCode = 1;
  });
