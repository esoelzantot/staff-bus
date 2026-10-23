/**
 * Vercel serverless function – keeps the daily reminders alive when the browser renews a push subscription.
 *
 *   POST /api/push-renew   { oldEndpoint, subscription: { endpoint, keys: { p256dh, auth } } }
 *
 * Browsers occasionally replace a device's push subscription on their own (the "pushsubscriptionchange" event in
 * public/sw.js), also while the app is closed or nobody is signed in. Without this the reminders of that device would
 * silently stop. The service worker has no sign-in, so the OLD endpoint is the proof: it is a long secret URL known
 * only to that browser and to us. The new subscription takes over the owner (uid / employee) of the old one.
 */
import { FieldValue } from 'firebase-admin/firestore';
import { getAdmin, HttpError, type Admin } from './_lib/core.js';
import { isPushEndpoint, subscriptionDocId } from './_lib/push.js';

interface Owner {
  uid: string;
  employeeId: string;
}

export interface RenewDeps {
  /** Owner of the stored subscription with this id, or null when there is none. */
  findOwner(id: string): Promise<Owner | null>;
  /** Stores the new subscription for the same owner and removes the old one (one batch). */
  replace(oldId: string, newId: string, data: Owner & { endpoint: string; p256dh: string; auth: string }): Promise<void>;
}

const isKey = (value: unknown, max: number): value is string =>
  typeof value === 'string' && value.length > 0 && value.length <= max;

export async function handleRenew(deps: RenewDeps, rawBody: unknown): Promise<void> {
  const body = (rawBody && typeof rawBody === 'object' ? rawBody : {}) as Record<string, unknown>;
  const sub = (body.subscription && typeof body.subscription === 'object' ? body.subscription : {}) as Record<
    string,
    unknown
  >;
  const keys = (sub.keys && typeof sub.keys === 'object' ? sub.keys : {}) as Record<string, unknown>;

  if (!isPushEndpoint(body.oldEndpoint) || !isPushEndpoint(sub.endpoint)) throw new HttpError(400, 'Invalid endpoint.');
  if (!isKey(keys.p256dh, 256) || !isKey(keys.auth, 64)) throw new HttpError(400, 'Invalid keys.');

  const oldId = subscriptionDocId(body.oldEndpoint);
  const owner = await deps.findOwner(oldId);
  if (!owner) throw new HttpError(404, 'Unknown subscription.');

  await deps.replace(oldId, subscriptionDocId(sub.endpoint), {
    uid: owner.uid,
    employeeId: owner.employeeId,
    endpoint: sub.endpoint,
    p256dh: keys.p256dh,
    auth: keys.auth,
  });
}

export function makeDeps(a: Admin): RenewDeps {
  const col = a.db.collection('pushSubscriptions');
  return {
    findOwner: async (id) => {
      const snap = await col.doc(id).get();
      if (!snap.exists) return null;
      return { uid: String(snap.get('uid')), employeeId: String(snap.get('employeeId')) };
    },
    replace: async (oldId, newId, data) => {
      const batch = a.db.batch();
      batch.set(col.doc(newId), { ...data, updatedAt: FieldValue.serverTimestamp() });
      if (newId !== oldId) batch.delete(col.doc(oldId));
      await batch.commit();
    },
  };
}

// ── HTTP wrapper (Vercel Node.js function) ─────────────────────────────────────────────────────
interface Req {
  method?: string;
  body?: unknown;
}
interface Res {
  status(code: number): Res;
  json(body: unknown): void;
  setHeader(name: string, value: string): void;
}

export default async function handler(req: Req, res: Res): Promise<void> {
  res.setHeader('Cache-Control', 'no-store');
  try {
    if (req.method !== 'POST') {
      res.setHeader('Allow', 'POST');
      throw new HttpError(405, 'Method not allowed.');
    }
    let body = req.body;
    if (typeof body === 'string') {
      try {
        body = JSON.parse(body);
      } catch {
        throw new HttpError(400, 'Invalid JSON.');
      }
    }
    await handleRenew(makeDeps(getAdmin()), body);
    res.status(200).json({ ok: true });
  } catch (err) {
    if (err instanceof HttpError) {
      res.status(err.status).json({ error: err.message });
      return;
    }
    console.error(err);
    res.status(500).json({ error: 'Server error.' });
  }
}
