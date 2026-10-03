import { describe, expect, it } from 'vitest';
import { hitBucket, memoryBuckets, refundBucket, type Rule } from './rateLimit';

const rule: Rule = { limit: 3, windowMs: 1000, lockMs: 5000 };

describe('hitBucket', () => {
  it('allows `limit` attempts, blocks the next one and locks', () => {
    let bucket = null as ReturnType<typeof hitBucket>['bucket'] | null;
    for (let i = 1; i <= 3; i++) {
      const r = hitBucket(bucket, rule, 100);
      expect(r.blocked).toBe(false);
      bucket = r.bucket;
    }
    const fourth = hitBucket(bucket, rule, 100);
    expect(fourth.blocked).toBe(true);
    expect(fourth.bucket.lockedUntil).toBe(5100);
  });

  it('stays blocked while locked, without extending the lock', () => {
    const locked = { count: 4, windowStart: 100, lockedUntil: 5100 };
    const r = hitBucket(locked, rule, 3000);
    expect(r.blocked).toBe(true);
    expect(r.bucket).toBe(locked);
  });

  it('starts a fresh window after the lock or the window expired', () => {
    expect(hitBucket({ count: 4, windowStart: 100, lockedUntil: 5100 }, rule, 5100)).toEqual({
      bucket: { count: 1, windowStart: 5100, lockedUntil: 0 },
      blocked: false,
    });
    expect(hitBucket({ count: 2, windowStart: 0, lockedUntil: 0 }, rule, 1000).bucket.count).toBe(1);
  });
});

describe('refundBucket', () => {
  it('takes one attempt back but never below zero', () => {
    expect(refundBucket({ count: 2, windowStart: 0, lockedUntil: 0 }, 10)?.count).toBe(1);
    expect(refundBucket({ count: 0, windowStart: 0, lockedUntil: 0 }, 10)?.count).toBe(0);
    expect(refundBucket(null, 10)).toBeNull();
  });

  it('does not touch a locked bucket', () => {
    const locked = { count: 4, windowStart: 0, lockedUntil: 999 };
    expect(refundBucket(locked, 10)).toBe(locked);
  });
});

describe('memoryBuckets', () => {
  it('counts parallel attempts exactly (no guess slips past the limit)', async () => {
    const store = memoryBuckets();
    const results = await Promise.all(Array.from({ length: 10 }, () => store.hit('k', rule, 100)));
    expect(results.filter((r) => !r.blocked)).toHaveLength(3);
  });
});
