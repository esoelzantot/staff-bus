import { describe, expect, it } from 'vitest';
import { hashPin } from './_lib/pin';
import { memoryBuckets } from './_lib/rateLimit';
import { clientIp, handleLogin, IP_RULE, PRIVILEGED_RULE, type LoginDeps } from './login';

interface World {
  /** email → uid */
  accounts: Record<string, string>;
  profiles: Record<string, { role?: string; employeeDocId?: string }>;
  employees: string[];
  pins: Record<string, string>;
}

function makeDeps(world: World, clock = { now: 1_000_000 }) {
  const buckets = memoryBuckets();
  const deps: LoginDeps = {
    findUid: async (email) => world.accounts[email] ?? null,
    getProfile: async (uid) => world.profiles[uid] ?? null,
    employeeExists: async (id) => world.employees.includes(id),
    getPinHash: async (uid) => world.pins[uid] ?? null,
    createToken: async (uid) => `token-for-${uid}`,
    buckets,
    now: () => clock.now,
  };
  return { deps, buckets, clock };
}

const world = async (): Promise<World> => ({
  accounts: {
    'emp1001@employees.busapp.local': 'u-emp',
    'mgr001@employees.busapp.local': 'u-mgr',
    'ghost@employees.busapp.local': 'u-ghost',
  },
  profiles: { 'u-emp': { role: 'employee', employeeDocId: 'EMP1001' }, 'u-mgr': { role: 'manager' }, 'u-ghost': {} },
  employees: ['EMP1001'],
  pins: { 'u-mgr': await hashPin('right-pin-77') },
});

const code = async (p: Promise<unknown>) =>
  p.then(
    () => 'ok',
    (e: { code?: string }) => e.code,
  );

describe('handleLogin – employees (ID only)', () => {
  it('signs in a known employee, ignoring case and spaces', async () => {
    const { deps } = makeDeps(await world());
    expect(await handleLogin(deps, '1.1.1.1', { id: '  emp1001 ' })).toBe('token-for-u-emp');
  });

  it('rejects unknown, malformed and missing IDs with the same answer', async () => {
    const { deps } = makeDeps(await world());
    expect(await code(handleLogin(deps, '1.1.1.1', { id: 'NOPE99' }))).toBe('invalid-credentials');
    expect(await code(handleLogin(deps, '1.1.1.1', { id: '!!' }))).toBe('invalid-credentials');
    expect(await code(handleLogin(deps, '1.1.1.1', {}))).toBe('invalid-credentials');
    expect(await code(handleLogin(deps, '1.1.1.1', null))).toBe('invalid-credentials');
  });

  it('refuses accounts without a usable profile, or whose employee record is gone', async () => {
    const w = await world();
    const { deps } = makeDeps(w);
    expect(await code(handleLogin(deps, '1.1.1.1', { id: 'GHOST' }))).toBe('no-access');
    w.employees = [];
    expect(await code(handleLogin(deps, '1.1.1.1', { id: 'EMP1001' }))).toBe('no-access');
  });

  it('does not let an ID be used by a profile that points at a different employee', async () => {
    const w = await world();
    w.profiles['u-emp'] = { role: 'employee', employeeDocId: 'SOMEONE' };
    const { deps } = makeDeps(w);
    expect(await code(handleLogin(deps, '1.1.1.1', { id: 'EMP1001' }))).toBe('no-access');
  });
});

describe('handleLogin – managers / admins (ID + PIN)', () => {
  it('asks for the PIN instead of letting the ID in', async () => {
    const { deps } = makeDeps(await world());
    expect(await code(handleLogin(deps, '1.1.1.1', { id: 'MGR001' }))).toBe('pin-required');
    expect(await code(handleLogin(deps, '1.1.1.1', { id: 'MGR001', pin: '' }))).toBe('pin-required');
  });

  it('signs in with the right PIN and rejects a wrong one', async () => {
    const { deps } = makeDeps(await world());
    expect(await code(handleLogin(deps, '1.1.1.1', { id: 'MGR001', pin: 'wrong-pin-00' }))).toBe('invalid-pin');
    expect(await handleLogin(deps, '1.1.1.1', { id: 'MGR001', pin: 'right-pin-77' })).toBe('token-for-u-mgr');
  });

  it('fails closed when no PIN was ever set', async () => {
    const w = await world();
    w.pins = {};
    const { deps } = makeDeps(w);
    expect(await code(handleLogin(deps, '1.1.1.1', { id: 'MGR001', pin: 'right-pin-77' }))).toBe('pin-not-set');
  });

  it('rejects non-string PINs', async () => {
    const { deps } = makeDeps(await world());
    expect(await code(handleLogin(deps, '1.1.1.1', { id: 'MGR001', pin: { $ne: 1 } }))).toBe('invalid-pin');
  });

  it('locks the account after too many wrong PINs – even the right PIN is refused while locked', async () => {
    const { deps, clock } = makeDeps(await world());
    for (let i = 0; i < PRIVILEGED_RULE.limit; i++) {
      // vary the IP so only the per-account lock is exercised
      expect(await code(handleLogin(deps, `9.9.9.${i}`, { id: 'MGR001', pin: `bad-pin-${i}x` }))).toBe('invalid-pin');
    }
    expect(await code(handleLogin(deps, '9.9.9.99', { id: 'MGR001', pin: 'right-pin-77' }))).toBe('locked');

    clock.now += PRIVILEGED_RULE.lockMs;
    expect(await handleLogin(deps, '9.9.9.99', { id: 'MGR001', pin: 'right-pin-77' })).toBe('token-for-u-mgr');
  });

  it('a successful sign-in resets the wrong-PIN counter', async () => {
    const { deps } = makeDeps(await world());
    for (let round = 0; round < 3; round++) {
      for (let i = 0; i < PRIVILEGED_RULE.limit - 1; i++) {
        await code(handleLogin(deps, `8.8.${round}.${i}`, { id: 'MGR001', pin: 'bad-pin-xx' }));
      }
      expect(await handleLogin(deps, '8.8.8.8', { id: 'MGR001', pin: 'right-pin-77' })).toBe('token-for-u-mgr');
    }
  });
});

describe('handleLogin – per-IP limit', () => {
  it('blocks an IP that keeps guessing IDs, but not other IPs', async () => {
    const { deps } = makeDeps(await world());
    for (let i = 0; i < IP_RULE.limit; i++) {
      expect(await code(handleLogin(deps, '6.6.6.6', { id: `NOPE${i}00` }))).toBe('invalid-credentials');
    }
    expect(await code(handleLogin(deps, '6.6.6.6', { id: 'EMP1001' }))).toBe('too-many-requests');
    expect(await handleLogin(deps, '7.7.7.7', { id: 'EMP1001' })).toBe('token-for-u-emp');
  });

  it('successful sign-ins and PIN prompts never count against the IP', async () => {
    const { deps } = makeDeps(await world());
    for (let i = 0; i < IP_RULE.limit * 3; i++) {
      expect(await handleLogin(deps, '5.5.5.5', { id: 'EMP1001' })).toBe('token-for-u-emp');
      expect(await code(handleLogin(deps, '5.5.5.5', { id: 'MGR001' }))).toBe('pin-required');
    }
  });

  it('parallel guesses cannot exceed the limit', async () => {
    const { deps } = makeDeps(await world());
    const outcomes = await Promise.all(
      Array.from({ length: IP_RULE.limit * 3 }, (_, i) => code(handleLogin(deps, '4.4.4.4', { id: `NOPE${i}00` }))),
    );
    expect(outcomes.filter((o) => o === 'invalid-credentials')).toHaveLength(IP_RULE.limit);
    expect(outcomes.filter((o) => o === 'too-many-requests')).toHaveLength(IP_RULE.limit * 2);
  });
});

describe('clientIp', () => {
  it('prefers x-real-ip, then the first x-forwarded-for entry', () => {
    expect(clientIp({ 'x-real-ip': '1.2.3.4', 'x-forwarded-for': '9.9.9.9' })).toBe('1.2.3.4');
    expect(clientIp({ 'x-forwarded-for': '5.6.7.8, 10.0.0.1' })).toBe('5.6.7.8');
    expect(clientIp({})).toBe('unknown');
  });
});
