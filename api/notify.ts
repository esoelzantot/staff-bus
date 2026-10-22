/**
 * Vercel serverless function – the daily reminders (Web Push).
 *
 *   POST /api/notify?slot=going        07:00 Cairo  "هتركب الأتوبيس النهارده؟"   (Going IN / OUT)
 *   POST /api/notify?slot=returning    16:00 Cairo  "هترجع بالأتوبيس النهارده؟"  (Returning IN / OUT)
 *   Authorization: Bearer <NOTIFY_SECRET>
 *
 * Called by an external scheduler (cron-job.org – GitHub Actions starts runs hours late). It is safe to call more
 * than once: every slot is sent at most ONCE per Cairo day (meta/notify_{day}_{slot}), and only on working days
 * (Sunday – Thursday). Optional query flags: dryRun=1 (count, send nothing), force=1 (ignore the day / once checks).
 *
 * Every employee who tapped "فعّل التنبيهات" on a device has a pushSubscriptions/{id} document; the reminder goes to
 * all of them with their current status. Subscriptions the push service reports as gone (404 / 410), of deleted
 * employees, or pointing at an unknown host are removed.
 *
 * Environment (Vercel → Settings → Environment Variables):
 *   NOTIFY_SECRET            long random string, also set in the cron-job.org jobs
 *   VITE_VAPID_PUBLIC_KEY    VAPID public key (also used by the web app at build time)
 *   VAPID_PRIVATE_KEY        VAPID private key (server only)
 *   VAPID_SUBJECT            optional, "mailto:you@example.com" or the app's https URL
 *   FIREBASE_SERVICE_ACCOUNT the service-account JSON (already set for the other functions)
 */
import { FieldValue } from 'firebase-admin/firestore';
import webpush from 'web-push';
import { cairoDay, cairoWeekday, getAdmin, HttpError, isCronAuthorized, type Admin } from './_lib/core.js';

export type Slot = 'going' | 'returning';

/** Sunday … Thursday (0 … 4): the bus runs on working days only. */
export const WORKING_DAYS = [0, 1, 2, 3, 4];

/** Push services a subscription may point at (the server must not POST to arbitrary URLs). */
const PUSH_HOSTS = [
  /^fcm\.googleapis\.com$/,
  /(^|\.)push\.services\.mozilla\.com$/,
  /(^|\.)push\.apple\.com$/,
  /(^|\.)notify\.windows\.com$/,
];

export function isPushEndpoint(endpoint: unknown): endpoint is string {
  if (typeof endpoint !== 'string' || endpoint.length > 1024) return false;
  try {
    const url = new URL(endpoint);
    return url.protocol === 'https:' && PUSH_HOSTS.some((re) => re.test(url.hostname));
  } catch {
    return false;
  }
}

export interface StoredSubscription {
  id: string;
  employeeId: string;
  endpoint: string;
  keys: { p256dh: string; auth: string };
}

export interface EmployeeInfo {
  name: string;
  goingStatus: 'in' | 'out';
  returningStatus: 'in' | 'out';
}

export interface Payload {
  title: string;
  body: string;
  /** Same tag = a newer reminder replaces an older one still on the screen. */
  tag: string;
  url: string;
}

/** Everything the notify logic needs from the outside world (so it can be unit-tested without Firebase). */
export interface NotifyDeps {
  now(): Date;
  /** Marks the slot as sent for the day. false = it was already sent. */
  claimSlot(day: string, slot: Slot): Promise<boolean>;
  listSubscriptions(): Promise<StoredSubscription[]>;
  getEmployees(ids: string[]): Promise<Map<string, EmployeeInfo>>;
  /** Rejects with { statusCode } when the push service refuses. */
  send(subscription: StoredSubscription, payload: Payload, slot: Slot): Promise<void>;
  removeSubscriptions(ids: string[]): Promise<void>;
}

export interface NotifyOptions {
  slot: Slot;
  force?: boolean;
  dryRun?: boolean;
}

export interface NotifyResult {
  slot: Slot;
  day: string;
  /** Why nothing was sent (not a working day / already sent today). */
  skipped?: 'not-a-working-day' | 'already-sent';
  subscriptions: number;
  sent: number;
  failed: number;
  removed: number;
}

const STATUS = { in: 'IN', out: 'OUT' } as const;
const firstName = (name: string) => name.trim().split(/\s+/)[0] || name;

export function buildPayload(slot: Slot, employee: EmployeeInfo): Payload {
  const who = firstName(employee.name);
  if (slot === 'going') {
    return {
      title: '🚌 الذهاب – صباح الخير',
      body: `${who}، هتركب الأتوبيس النهارده؟ حالتك دلوقتي ${STATUS[employee.goingStatus]}. افتح التطبيق وحدّد IN أو OUT للذهاب.`,
      tag: 'reminder-going',
      url: '/',
    };
  }
  return {
    title: '🚌 العودة',
    body: `${who}، هترجع بالأتوبيس النهارده؟ حالتك دلوقتي ${STATUS[employee.returningStatus]}. افتح التطبيق وحدّد IN أو OUT للعودة.`,
    tag: 'reminder-returning',
    url: '/',
  };
}

/** Sends in small groups so a big roster neither floods the push services nor runs out of time. */
const BATCH = 20;

export async function handleNotify(deps: NotifyDeps, options: NotifyOptions): Promise<NotifyResult> {
  const now = deps.now();
  const day = cairoDay(now);
  const result: NotifyResult = { slot: options.slot, day, subscriptions: 0, sent: 0, failed: 0, removed: 0 };

  if (!options.force && !WORKING_DAYS.includes(cairoWeekday(now))) return { ...result, skipped: 'not-a-working-day' };

  const all = await deps.listSubscriptions();
  const employees = await deps.getEmployees([...new Set(all.map((s) => s.employeeId))]);

  // Subscriptions that can never be delivered: deleted employee, or not a known push service.
  const dead = all.filter((s) => !employees.has(s.employeeId) || !isPushEndpoint(s.endpoint)).map((s) => s.id);
  const live = all.filter((s) => !dead.includes(s.id));
  result.subscriptions = live.length;

  if (options.dryRun) return result;
  if (!options.force && !(await deps.claimSlot(day, options.slot))) return { ...result, skipped: 'already-sent' };

  const gone: string[] = [...dead];
  for (let i = 0; i < live.length; i += BATCH) {
    const group = live.slice(i, i + BATCH);
    const outcomes = await Promise.allSettled(
      group.map((s) => deps.send(s, buildPayload(options.slot, employees.get(s.employeeId)!), options.slot)),
    );
    outcomes.forEach((outcome, k) => {
      if (outcome.status === 'fulfilled') {
        result.sent++;
        return;
      }
      result.failed++;
      const code = (outcome.reason as { statusCode?: number } | null)?.statusCode;
      if (code === 404 || code === 410) gone.push(group[k].id); // unsubscribed / expired
    });
  }

  if (gone.length > 0) await deps.removeSubscriptions(gone);
  result.removed = gone.length;
  return result;
}

// ── Firebase + web-push wiring ─────────────────────────────────────────────────────────────────
function configureVapid(): void {
  const publicKey = process.env.VITE_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const host = process.env.VERCEL_PROJECT_PRODUCTION_URL;
  const subject = process.env.VAPID_SUBJECT || (host ? `https://${host}` : '');
  if (!publicKey || !privateKey || !subject) {
    throw new HttpError(500, 'Server not configured: VITE_VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY and VAPID_SUBJECT are required.');
  }
  webpush.setVapidDetails(subject, publicKey, privateKey);
}

/** How long a push service keeps trying to deliver a reminder to a phone that is offline. */
const TTL_SECONDS = 3 * 60 * 60;

export function makeDeps(a: Admin): NotifyDeps {
  configureVapid();
  return {
    now: () => new Date(),
    claimSlot: async (day, slot) => {
      try {
        await a.db.collection('meta').doc(`notify_${day}_${slot}`).create({ day, slot, at: FieldValue.serverTimestamp() });
        return true;
      } catch (err) {
        if ((err as { code?: number }).code === 6) return false; // ALREADY_EXISTS
        throw err;
      }
    },
    listSubscriptions: async () =>
      (await a.db.collection('pushSubscriptions').get()).docs.map((d) => ({
        id: d.id,
        employeeId: String(d.get('employeeId') ?? ''),
        endpoint: String(d.get('endpoint') ?? ''),
        keys: { p256dh: String(d.get('p256dh') ?? ''), auth: String(d.get('auth') ?? '') },
      })),
    getEmployees: async (ids) => {
      const map = new Map<string, EmployeeInfo>();
      if (ids.length === 0) return map;
      const snaps = await a.db.getAll(...ids.map((id) => a.db.collection('employees').doc(id)));
      for (const snap of snaps) if (snap.exists) map.set(snap.id, snap.data() as EmployeeInfo);
      return map;
    },
    send: async (s, payload, slot) => {
      await webpush.sendNotification({ endpoint: s.endpoint, keys: s.keys }, JSON.stringify(payload), {
        TTL: TTL_SECONDS,
        urgency: 'high',
        topic: `reminder-${slot}`,
      });
    },
    removeSubscriptions: async (ids) => {
      const batch = a.db.batch();
      ids.forEach((id) => batch.delete(a.db.collection('pushSubscriptions').doc(id)));
      await batch.commit();
    },
  };
}

// ── HTTP wrapper (Vercel Node.js function) ─────────────────────────────────────────────────────
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
    if (!isCronAuthorized(first(req.headers.authorization))) {
      throw new HttpError(401, 'Unauthorized.');
    }
    const slot = first(req.query?.slot);
    if (slot !== 'going' && slot !== 'returning') throw new HttpError(400, 'slot must be "going" or "returning".');

    const result = await handleNotify(makeDeps(getAdmin()), {
      slot,
      force: flag(req.query?.force),
      dryRun: flag(req.query?.dryRun),
    });
    console.log('notify', JSON.stringify(result));
    res.status(200).json(result);
  } catch (err) {
    if (err instanceof HttpError) {
      res.status(err.status).json({ error: err.message });
      return;
    }
    console.error(err);
    res.status(500).json({ error: 'Server error.' });
  }
}
