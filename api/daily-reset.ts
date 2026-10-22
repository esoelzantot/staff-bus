/**
 * Vercel serverless function – the daily reset, started on time by cron-job.org (00:05 Cairo, every day).
 *
 *   POST /api/daily-reset             Authorization: Bearer <NOTIFY_SECRET>
 *        ?dryRun=1                    plan only, write nothing
 *        ?force=1                     ignore the 00:00–05:59 window and the "already done today" check
 *
 * What it does is api/_lib/resetDay.ts: main employees IN / IN (+1 IN day), waiting OUT / OUT, a daily record for
 * everyone, counters recomputed, direction → Going, location sharing stopped – one transaction per bus.
 * Safe to call again and again: it acts once per Cairo day, so the GitHub Actions workflow can stay as a backup.
 *
 * Answers 200 with the result (done / skipped / dry run), 500 when a bus could not be reset – so cron-job.org
 * reports the failure (e-mail) and the next call retries.
 *
 * Environment (Vercel): NOTIFY_SECRET (the same secret as /api/notify), FIREBASE_SERVICE_ACCOUNT.
 */
import { getAdmin, HttpError, isCronAuthorized } from './_lib/core.js';
import { describeError, runDailyReset } from './_lib/resetDay.js';

interface Req {
  method?: string;
  headers: Record<string, string | string[] | undefined>;
  query?: Record<string, string | string[] | undefined>;
}
interface Res {
  status(code: number): Res;
  json(body: unknown): void;
  setHeader(name: string, value: string): void;
}

const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);
const flag = (value: string | string[] | undefined) => ['1', 'true'].includes(first(value) ?? '');

export default async function handler(req: Req, res: Res): Promise<void> {
  res.setHeader('Cache-Control', 'no-store');
  try {
    if (req.method !== 'POST' && req.method !== 'GET') {
      res.setHeader('Allow', 'GET, POST');
      throw new HttpError(405, 'Method not allowed.');
    }
    if (!isCronAuthorized(first(req.headers.authorization))) throw new HttpError(401, 'Unauthorized.');

    const outcome = await runDailyReset(getAdmin().db, {
      force: flag(req.query?.force),
      dryRun: flag(req.query?.dryRun),
      source: 'vercel',
    });
    console.log('daily-reset', JSON.stringify(outcome));
    res.status(outcome.status === 'failed' ? 500 : 200).json(outcome);
  } catch (err) {
    if (err instanceof HttpError) {
      res.status(err.status).json({ error: err.message });
      return;
    }
    console.error(err);
    res.status(500).json({ status: 'error', error: describeError(err) });
  }
}
