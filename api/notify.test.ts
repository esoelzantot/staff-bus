import { describe, expect, it } from 'vitest';
import { isCronAuthorized as authorized } from './_lib/core';
import {
  buildPayload,
  handleNotify,
  isPushEndpoint,
  type EmployeeInfo,
  type NotifyDeps,
  type Payload,
  type StoredSubscription,
} from './notify';

// Cairo is UTC+3 until the end of October 2026.
const SUNDAY_7AM = new Date('2026-10-25T04:00:00Z');
const THURSDAY_4PM = new Date('2026-10-22T13:00:00Z');
const FRIDAY_7AM = new Date('2026-10-23T04:00:00Z');
const SATURDAY_4PM = new Date('2026-10-24T13:00:00Z');

const sub = (id: string, employeeId: string, endpoint = `https://fcm.googleapis.com/fcm/send/${id}`): StoredSubscription => ({
  id,
  employeeId,
  endpoint,
  keys: { p256dh: 'p', auth: 'a' },
});

function fakeDeps(options: {
  now: Date;
  subscriptions: StoredSubscription[];
  employees: Record<string, EmployeeInfo>;
  /** subscription id → HTTP status the push service answers with */
  failures?: Record<string, number>;
}) {
  const claimed = new Set<string>();
  const sent: { id: string; payload: Payload }[] = [];
  const removed: string[] = [];
  const deps: NotifyDeps = {
    now: () => options.now,
    claimSlot: async (day, slot) => {
      const key = `${day}_${slot}`;
      if (claimed.has(key)) return false;
      claimed.add(key);
      return true;
    },
    listSubscriptions: async () => options.subscriptions,
    getEmployees: async (ids) =>
      new Map(ids.filter((id) => options.employees[id]).map((id) => [id, options.employees[id]])),
    send: async (s, payload) => {
      const status = options.failures?.[s.id];
      if (status) throw Object.assign(new Error('push failed'), { statusCode: status });
      sent.push({ id: s.id, payload });
    },
    removeSubscriptions: async (ids) => {
      removed.push(...ids);
    },
  };
  return { deps, sent, removed };
}

const ahmed: EmployeeInfo = { name: 'Ahmed Mohamed', goingStatus: 'in', returningStatus: 'out' };
const sara: EmployeeInfo = { name: 'Sara Ali', goingStatus: 'out', returningStatus: 'in' };

describe('handleNotify', () => {
  it('07:00 on a working day: every device of every employee gets the Going reminder', async () => {
    const { deps, sent } = fakeDeps({
      now: SUNDAY_7AM,
      subscriptions: [sub('a1', 'EMP1'), sub('a2', 'EMP1'), sub('s1', 'EMP2')],
      employees: { EMP1: ahmed, EMP2: sara },
    });
    const result = await handleNotify(deps, { slot: 'going' });
    expect(result).toMatchObject({ day: '2026-10-25', sent: 3, failed: 0, subscriptions: 3 });
    expect(sent.map((s) => s.id)).toEqual(['a1', 'a2', 's1']);
    expect(sent[0].payload.body).toContain('Ahmed');
    expect(sent[0].payload.body).toContain('IN'); // Ahmed is IN for going
  });

  it('16:00: the Returning reminder, with the returning status', async () => {
    const { deps, sent } = fakeDeps({
      now: THURSDAY_4PM,
      subscriptions: [sub('s1', 'EMP2')],
      employees: { EMP2: sara },
    });
    await handleNotify(deps, { slot: 'returning' });
    expect(sent[0].payload).toMatchObject({ title: '🚌 العودة', tag: 'reminder-returning' });
    expect(sent[0].payload.body).toContain('حالتك دلوقتي IN');
  });

  it('Friday and Saturday: nothing is sent', async () => {
    for (const now of [FRIDAY_7AM, SATURDAY_4PM]) {
      const { deps, sent } = fakeDeps({ now, subscriptions: [sub('a1', 'EMP1')], employees: { EMP1: ahmed } });
      expect(await handleNotify(deps, { slot: 'going' })).toMatchObject({ skipped: 'not-a-working-day', sent: 0 });
      expect(sent).toHaveLength(0);
    }
  });

  it('…unless forced (manual test)', async () => {
    const { deps, sent } = fakeDeps({ now: FRIDAY_7AM, subscriptions: [sub('a1', 'EMP1')], employees: { EMP1: ahmed } });
    await handleNotify(deps, { slot: 'going', force: true });
    expect(sent).toHaveLength(1);
  });

  it('each slot is sent once per day, even if the scheduler calls twice', async () => {
    const { deps, sent } = fakeDeps({ now: SUNDAY_7AM, subscriptions: [sub('a1', 'EMP1')], employees: { EMP1: ahmed } });
    await handleNotify(deps, { slot: 'going' });
    expect(await handleNotify(deps, { slot: 'going' })).toMatchObject({ skipped: 'already-sent' });
    await handleNotify(deps, { slot: 'returning' }); // the other slot is independent
    expect(sent).toHaveLength(2);
  });

  it('a dry run counts but sends nothing and does not use up the slot', async () => {
    const { deps, sent } = fakeDeps({ now: SUNDAY_7AM, subscriptions: [sub('a1', 'EMP1')], employees: { EMP1: ahmed } });
    expect(await handleNotify(deps, { slot: 'going', dryRun: true })).toMatchObject({ subscriptions: 1, sent: 0 });
    expect(sent).toHaveLength(0);
    expect(await handleNotify(deps, { slot: 'going' })).toMatchObject({ sent: 1 });
  });

  it('removes expired devices (404 / 410) but keeps ones that failed for a passing reason', async () => {
    const { deps, removed } = fakeDeps({
      now: SUNDAY_7AM,
      subscriptions: [sub('gone', 'EMP1'), sub('expired', 'EMP1'), sub('busy', 'EMP1'), sub('ok', 'EMP1')],
      employees: { EMP1: ahmed },
      failures: { gone: 410, expired: 404, busy: 503 },
    });
    expect(await handleNotify(deps, { slot: 'going' })).toMatchObject({ sent: 1, failed: 3, removed: 2 });
    expect(removed.sort()).toEqual(['expired', 'gone']);
  });

  it('removes devices of deleted employees and of unknown push hosts, without sending to them', async () => {
    const { deps, sent, removed } = fakeDeps({
      now: SUNDAY_7AM,
      subscriptions: [sub('old', 'EMP9'), sub('evil', 'EMP1', 'https://attacker.example/push'), sub('ok', 'EMP1')],
      employees: { EMP1: ahmed },
    });
    await handleNotify(deps, { slot: 'going' });
    expect(sent.map((s) => s.id)).toEqual(['ok']);
    expect(removed.sort()).toEqual(['evil', 'old']);
  });
});

describe('helpers', () => {
  it('only real push services are accepted', () => {
    expect(isPushEndpoint('https://fcm.googleapis.com/fcm/send/abc')).toBe(true);
    expect(isPushEndpoint('https://web.push.apple.com/QAbc')).toBe(true);
    expect(isPushEndpoint('https://updates.push.services.mozilla.com/wpush/v2/x')).toBe(true);
    expect(isPushEndpoint('https://wns2-db5p.notify.windows.com/w/?token=x')).toBe(true);
    expect(isPushEndpoint('http://fcm.googleapis.com/x')).toBe(false);
    expect(isPushEndpoint('https://fcm.googleapis.com.evil.com/x')).toBe(false);
    expect(isPushEndpoint('https://169.254.169.254/latest')).toBe(false);
  });

  it('the secret must match exactly', () => {
    const secret = 'a-very-long-random-secret';
    expect(authorized(`Bearer ${secret}`, secret)).toBe(true);
    expect(authorized(`Bearer ${secret}x`, secret)).toBe(false);
    expect(authorized(secret, secret)).toBe(false);
    expect(authorized(undefined, secret)).toBe(false);
    expect(authorized('Bearer short', 'short')).toBe(false); // a weak / unset secret never opens the door
  });

  it('the reminder uses the first name only', () => {
    expect(buildPayload('going', ahmed).body.startsWith('Ahmed،')).toBe(true);
  });
});
