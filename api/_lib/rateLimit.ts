/**
 * Attempt limiter backed by Firestore (loginAttempts/{key}, denied to every client by the rules).
 *
 * Every attempt is counted BEFORE it is checked and refunded when it turns out to be a success, so parallel
 * guesses cannot slip past the limit: Firestore transactions serialise the counter updates.
 */
import { type Firestore } from 'firebase-admin/firestore';

export interface Rule {
  /** Attempts allowed inside one window. */
  limit: number;
  windowMs: number;
  /** How long the key stays blocked once the limit is exceeded. */
  lockMs: number;
}

export interface Bucket {
  count: number;
  windowStart: number;
  /** 0 = not locked. */
  lockedUntil: number;
}

export interface HitResult {
  bucket: Bucket;
  blocked: boolean;
}

export interface BucketStore {
  /** Counts one attempt. `blocked` = the key is locked, so the attempt must be rejected. */
  hit(key: string, rule: Rule, now: number): Promise<HitResult>;
  /** Takes one attempt back (the attempt succeeded, so it must not count against the limit). */
  refund(key: string, now: number): Promise<void>;
  /** Forgets every failure of this key. */
  clear(key: string): Promise<void>;
}

export function hitBucket(prev: Bucket | null, rule: Rule, now: number): HitResult {
  if (prev && prev.lockedUntil > now) return { bucket: prev, blocked: true };
  const expired =
    !prev || now - prev.windowStart >= rule.windowMs || (prev.lockedUntil !== 0 && prev.lockedUntil <= now);
  const count = (expired ? 0 : prev.count) + 1;
  const windowStart = expired ? now : prev.windowStart;
  if (count > rule.limit) return { bucket: { count, windowStart, lockedUntil: now + rule.lockMs }, blocked: true };
  return { bucket: { count, windowStart, lockedUntil: 0 }, blocked: false };
}

export function refundBucket(prev: Bucket | null, now: number): Bucket | null {
  if (!prev || prev.lockedUntil > now) return prev;
  return { ...prev, count: Math.max(0, prev.count - 1) };
}

const KEEP_MS = 24 * 60 * 60 * 1000;

export function firestoreBuckets(db: Firestore): BucketStore {
  const col = db.collection('loginAttempts');
  // `expiresAt` lets you add a Firestore TTL policy on loginAttempts to purge old documents automatically.
  const stamp = (bucket: Bucket, now: number) => ({ ...bucket, expiresAt: new Date(now + KEEP_MS) });

  return {
    hit: (key, rule, now) =>
      db.runTransaction(async (tx) => {
        const ref = col.doc(key);
        const snap = await tx.get(ref);
        const prev = snap.exists ? (snap.data() as Bucket) : null;
        const result = hitBucket(prev, rule, now);
        if (result.bucket !== prev) tx.set(ref, stamp(result.bucket, now));
        return result;
      }),

    refund: async (key, now) => {
      await db.runTransaction(async (tx) => {
        const ref = col.doc(key);
        const snap = await tx.get(ref);
        if (!snap.exists) return;
        const next = refundBucket(snap.data() as Bucket, now);
        if (next) tx.set(ref, stamp(next, now));
      });
    },

    clear: async (key) => {
      await col.doc(key).delete();
    },
  };
}

/** In-memory store with the same semantics (unit tests, local experiments). */
export function memoryBuckets(): BucketStore & { data: Map<string, Bucket> } {
  const data = new Map<string, Bucket>();
  return {
    data,
    hit: async (key, rule, now) => {
      const result = hitBucket(data.get(key) ?? null, rule, now);
      data.set(key, result.bucket);
      return result;
    },
    refund: async (key, now) => {
      const next = refundBucket(data.get(key) ?? null, now);
      if (next) data.set(key, next);
    },
    clear: async (key) => {
      data.delete(key);
    },
  };
}
