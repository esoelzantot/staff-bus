/**
 * Vercel serverless function – sign-in.
 *
 * POST /api/login   { id: string, pin?: string }   →   200 { token }   (a Firebase custom token)
 *
 * Why this exists: signing in with a password derived from the Employee ID meant the "password" shipped in
 * the browser bundle, so any ID (including a manager's or admin's) was enough to get in. Now the browser
 * never sees a credential: this function checks the ID on the server, asks for a PIN when the account is a
 * manager / admin, limits guesses, and only then mints a custom token for the existing Auth account.
 *
 * Employees: Employee ID only (as requested).  Manager / admin: Employee ID + PIN (credentials/{uid}).
 *
 * Failure reasons are returned as { error: <code>, message } – the web app maps the code to its own text:
 *   invalid-credentials · pin-required · invalid-pin · pin-not-set · no-access · locked · too-many-requests
 *
 * Environment (Vercel → Settings → Environment Variables):
 *   FIREBASE_SERVICE_ACCOUNT        the service-account JSON (already set for api/employees.ts)
 *   VITE_EMPLOYEE_EMAIL_DOMAIN      must match the value used when the accounts were created
 */
import { createHash } from 'node:crypto';
import { employeeEmail, getAdmin, HttpError, ID_PATTERN, type Admin } from './_lib/core.js';
import { PIN_MAX_LENGTH, verifyPin } from './_lib/pin.js';
import { firestoreBuckets, type BucketStore, type Rule } from './_lib/rateLimit.js';

/** Failed attempts per client IP (successes are refunded, so normal use never counts). */
export const IP_RULE: Rule = { limit: 20, windowMs: 10 * 60_000, lockMs: 10 * 60_000 };
/** PIN attempts per manager / admin account: the 6th wrong guess locks the account for 15 minutes. */
export const PRIVILEGED_RULE: Rule = { limit: 5, windowMs: 15 * 60_000, lockMs: 15 * 60_000 };

interface Profile {
  role?: unknown;
  employeeDocId?: unknown;
}

/** Everything the sign-in logic needs from the outside world (so it can be unit-tested without Firebase). */
export interface LoginDeps {
  findUid(email: string): Promise<string | null>;
  getProfile(uid: string): Promise<Profile | null>;
  employeeExists(id: string): Promise<boolean>;
  getPinHash(uid: string): Promise<string | null>;
  createToken(uid: string): Promise<string>;
  buckets: BucketStore;
  now(): number;
}

export function makeDeps(a: Admin): LoginDeps {
  return {
    findUid: async (email) => {
      try {
        return (await a.auth.getUserByEmail(email)).uid;
      } catch (err) {
        if ((err as { code?: string }).code === 'auth/user-not-found') return null;
        throw err;
      }
    },
    getProfile: async (uid) => {
      const snap = await a.db.collection('users').doc(uid).get();
      return snap.exists ? (snap.data() ?? null) : null;
    },
    employeeExists: async (id) => (await a.db.collection('employees').doc(id).get()).exists,
    getPinHash: async (uid) => {
      const hash = (await a.db.collection('credentials').doc(uid).get()).data()?.pinHash;
      return typeof hash === 'string' ? hash : null;
    },
    createToken: (uid) => a.auth.createCustomToken(uid),
    buckets: firestoreBuckets(a.db),
    now: () => Date.now(),
  };
}

const invalidCredentials = () => new HttpError(401, 'رقم الموظف غير صحيح.', 'invalid-credentials');

const hashKey = (value: string) => createHash('sha256').update(value).digest('hex').slice(0, 32);

function parseId(raw: unknown): string {
  const id = typeof raw === 'string' ? raw.trim().toUpperCase() : '';
  if (!ID_PATTERN.test(id)) throw invalidCredentials();
  return id;
}

function parsePin(raw: unknown): string | null {
  if (raw === undefined || raw === null || raw === '') return null;
  if (typeof raw !== 'string' || raw.length > PIN_MAX_LENGTH)
    throw new HttpError(401, 'الرقم السري غير صحيح.', 'invalid-pin');
  return raw;
}

/** Core sign-in logic. Returns the custom token to hand to the browser. */
export async function handleLogin(deps: LoginDeps, ip: string, rawBody: unknown): Promise<string> {
  const body = (rawBody && typeof rawBody === 'object' ? rawBody : {}) as Record<string, unknown>;
  const now = deps.now();

  // Every attempt counts against the IP first; it is refunded below when the attempt succeeds.
  const ipKey = `ip_${hashKey(ip)}`;
  const ipHit = await deps.buckets.hit(ipKey, IP_RULE, now);
  if (ipHit.blocked) throw new HttpError(429, 'محاولات كثيرة. انتظر بضع دقائق ثم حاول مرة أخرى.', 'too-many-requests');

  const succeed = async (uid: string) => {
    await deps.buckets.refund(ipKey, now);
    return deps.createToken(uid);
  };

  const id = parseId(body.id);
  const pin = parsePin(body.pin);

  const uid = await deps.findUid(employeeEmail(id));
  if (!uid) throw invalidCredentials();

  const profile = await deps.getProfile(uid);
  const role = profile?.role;

  if (role === 'employee') {
    if (profile?.employeeDocId !== id || !(await deps.employeeExists(id))) {
      throw new HttpError(403, 'هذا الحساب غير مفعّل لاستخدام التطبيق.', 'no-access');
    }
    return succeed(uid);
  }

  if (role === 'manager' || role === 'admin') {
    if (pin === null) {
      // Asking for the PIN is not a failed guess.
      await deps.buckets.refund(ipKey, now);
      throw new HttpError(401, 'أدخل الرقم السري.', 'pin-required');
    }

    const uidKey = `uid_${uid}`;
    const hit = await deps.buckets.hit(uidKey, PRIVILEGED_RULE, now);
    if (hit.blocked) throw new HttpError(429, 'تم إيقاف المحاولات مؤقتاً لهذا الحساب.', 'locked');

    const stored = await deps.getPinHash(uid);
    if (!stored) {
      await deps.buckets.refund(uidKey, now);
      throw new HttpError(403, 'لم يتم تفعيل رقم سري لهذا الحساب.', 'pin-not-set');
    }
    if (!(await verifyPin(pin, stored))) throw new HttpError(401, 'الرقم السري غير صحيح.', 'invalid-pin');

    await deps.buckets.clear(uidKey);
    return succeed(uid);
  }

  throw new HttpError(403, 'هذا الحساب غير مفعّل لاستخدام التطبيق.', 'no-access');
}

// ── HTTP wrapper (Vercel Node.js function) ─────────────────────────────────────────────────────
interface Req {
  method?: string;
  headers: Record<string, string | string[] | undefined>;
  body?: unknown;
}
interface Res {
  status(code: number): Res;
  json(body: unknown): void;
  setHeader(name: string, value: string): void;
}

const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

/** Vercel sets these headers itself (a client cannot spoof them), so the first value is the real client. */
export function clientIp(headers: Req['headers']): string {
  const real = first(headers['x-real-ip'])?.trim();
  if (real) return real;
  const forwarded = first(headers['x-forwarded-for'])?.split(',')[0]?.trim();
  return forwarded || 'unknown';
}

export default async function handler(req: Req, res: Res): Promise<void> {
  res.setHeader('Cache-Control', 'no-store');
  try {
    if (req.method !== 'POST') {
      res.setHeader('Allow', 'POST');
      throw new HttpError(405, 'الطريقة غير مدعومة.', 'method-not-allowed');
    }
    let body = req.body;
    if (typeof body === 'string') {
      try {
        body = JSON.parse(body);
      } catch {
        throw new HttpError(400, 'بيانات غير صالحة.', 'invalid-credentials');
      }
    }
    const token = await handleLogin(makeDeps(getAdmin()), clientIp(req.headers), body);
    res.status(200).json({ token });
  } catch (err) {
    if (err instanceof HttpError) {
      res.status(err.status).json({ error: err.code ?? 'server', message: err.message });
      return;
    }
    console.error(err);
    res.status(500).json({ error: 'server', message: 'حدث خطأ في الخادم. حاول مرة أخرى.' });
  }
}
