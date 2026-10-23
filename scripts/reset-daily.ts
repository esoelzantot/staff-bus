/**
 * Daily reset from the command line / the GitHub Actions BACKUP workflow. The main trigger is cron-job.org calling
 * /api/daily-reset at 00:05 Cairo; both run the same api/_lib/resetDay.ts and the reset acts only once per day, so
 * whichever comes second just reports "already done".
 *
 *   npm run reset-daily -- --dry-run   # show what would change, writes nothing
 *   npm run reset-daily -- --force     # run now (ignores the time window and the "already done today" check)
 *
 * Exit code 1 = the day is NOT reset; on GitHub every reason is printed as an annotation (run page + e-mail).
 */
import { describeError, runDailyReset } from '../api/_lib/resetDay.js';
import { annotateError, annotateNotice, summary } from './lib/ghActions';

const args = process.argv.slice(2);
const force = args.includes('--force');
const dryRun = args.includes('--dry-run');

const TITLE = 'Daily reset';

async function main(): Promise<number> {
  // Imported here, not at the top: a broken key / missing setting must end up in the error report below.
  const { adminDb, projectId } = await import('./lib/admin');
  console.log(`Project ${projectId}${dryRun ? ' (DRY RUN)' : ''}`);

  const outcome = await runDailyReset(adminDb, {
    force,
    dryRun,
    source: process.env.GITHUB_ACTIONS === 'true' ? 'github' : 'cli',
  });

  if (outcome.status === 'skipped') {
    console.log(
      outcome.reason === 'already-done'
        ? `Skipped: ${outcome.day} was already reset.`
        : 'Skipped: outside the 00:00–05:59 Cairo window.',
    );
    return 0;
  }

  const rows = outcome.buses.map((b) => {
    switch (b.status) {
      case 'done': {
        console.log(
          `Bus ${b.busId}: ${b.employees} employee(s) back to the start of the day, counters → ${b.goingCount}/${b.returningCount}`,
        );
        if (b.overridden.length > 0) {
          annotateNotice(
            `${TITLE}: bus ${b.busId}`,
            `Chose IN / OUT after midnight and were put back to the start of the day: ${b.overridden.join(', ')}`,
          );
        }
        const note = b.overridden.length > 0 ? ` (put back: ${b.overridden.join(', ')})` : '';
        return `| ${b.busId} | ✅${note} | ${b.employees} | ${b.goingCount} / ${b.returningCount} |`;
      }
      case 'already-done':
        console.log(`Bus ${b.busId}: already reset today – left alone.`);
        return `| ${b.busId} | already reset today | – | – |`;
      case 'gone':
        return `| ${b.busId} | deleted during the run | – | – |`;
      default:
        annotateError(`${TITLE}: bus ${b.busId} skipped`, b.error);
        return `| ${b.busId} | ❌ ${b.error} | – | – |`;
    }
  });
  if (outcome.unassigned.length > 0) {
    annotateError(TITLE, `Employees on a bus that does not exist (never reset): ${outcome.unassigned.join(', ')}`);
  }
  summary(
    [
      `### Daily reset ${outcome.day}${dryRun ? ' (dry run)' : ''}`,
      '',
      '| Bus | Result | Employees | Going / Returning IN |',
      '| --- | --- | --- | --- |',
      ...rows,
    ].join('\n'),
  );
  if (outcome.buses.length === 0) annotateNotice(TITLE, 'There are no buses in the project.');

  if (outcome.status === 'dry-run') {
    console.log('Dry run – nothing written.');
    return outcome.buses.some((b) => b.status === 'error') ? 1 : 0;
  }
  if (outcome.status === 'failed') {
    annotateError(TITLE, 'Some buses were skipped; the day is not marked as done, so the next run retries.');
    return 1;
  }
  console.log(`Done. ${outcome.employees} employee(s) started ${outcome.day}.`);
  annotateNotice(TITLE, `${outcome.day}: ${outcome.employees} employee(s) started the new day.`);
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
