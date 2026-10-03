/**
 * Firestore security-rules tests. They run against the local emulator:
 *
 *   npm run test:rules        (needs the Firebase CLI: npm install -g firebase-tools, and Java for the emulator)
 *
 * Covers the things the app's safety rests on: own-record-only writes, atomic capacity, bus isolation,
 * no self-promotion, server-only collections, and "a trip belongs to today (Cairo)".
 */
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
  type Firestore,
} from 'firebase/firestore';
import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';
import { todayKey } from '../../src/utils/date/format';

let env: RulesTestEnvironment;

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-staff-bus',
    firestore: { rules: readFileSync('firestore.rules', 'utf8') },
  });
});

afterAll(async () => {
  await env.cleanup();
});

const stamp = new Date('2026-01-01T00:00:00Z');

/** Two buses (capacity 2), three employees (EMP1 + EMP2 on bus1, EMP3 on bus2), a manager and an admin. */
async function seed(overrides: { bus1GoingCount?: number } = {}) {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore() as unknown as Firestore;
    const bus = (id: string, goingCount: number) =>
      setDoc(doc(db, 'buses', id), {
        route: `Route ${id}`,
        busNumber: `No ${id}`,
        capacity: 2,
        activeTripType: 'going',
        goingCount,
        returningCount: 0,
        createdAt: stamp,
        updatedAt: stamp,
      });
    const employee = (id: string, busId: string, going: 'in' | 'out') =>
      setDoc(doc(db, 'employees', id), {
        employeeId: id,
        name: `Name ${id}`,
        type: 'main',
        busId,
        goingStatus: going,
        returningStatus: 'out',
        goingInCount: going === 'in' ? 1 : 0,
        returningInCount: 0,
        createdAt: stamp,
        updatedAt: stamp,
      });

    await bus('bus1', overrides.bus1GoingCount ?? 1);
    await bus('bus2', 0);
    await employee('EMP1', 'bus1', 'out');
    await employee('EMP2', 'bus1', 'in');
    await employee('EMP3', 'bus2', 'out');

    await setDoc(doc(db, 'users', 'u-emp1'), { role: 'employee', employeeDocId: 'EMP1' });
    await setDoc(doc(db, 'users', 'u-emp2'), { role: 'employee', employeeDocId: 'EMP2' });
    await setDoc(doc(db, 'users', 'u-emp3'), { role: 'employee', employeeDocId: 'EMP3' });
    await setDoc(doc(db, 'users', 'u-mgr'), { role: 'manager' });
    await setDoc(doc(db, 'users', 'u-adm'), { role: 'admin' });

    await setDoc(doc(db, 'credentials', 'u-mgr'), { pinHash: 'scrypt$secret' });
    await setDoc(doc(db, 'loginAttempts', 'ip_abc'), { count: 1, windowStart: 0, lockedUntil: 0 });
    await setDoc(doc(db, 'meta', 'dailyReset'), { lastResetDate: '2026-01-01' });
  });
}

const as = (uid: string) => env.authenticatedContext(uid).firestore() as unknown as Firestore;

beforeEach(() => seed());

describe('bus isolation and read access', () => {
  it('an employee reads the people on her own bus', async () => {
    await assertSucceeds(getDocs(query(collection(as('u-emp1'), 'employees'), where('busId', '==', 'bus1'))));
    await assertSucceeds(getDoc(doc(as('u-emp1'), 'employees', 'EMP2')));
    await assertSucceeds(getDoc(doc(as('u-emp1'), 'buses', 'bus1')));
  });

  it('…but nothing about another bus', async () => {
    await assertFails(getDocs(query(collection(as('u-emp1'), 'employees'), where('busId', '==', 'bus2'))));
    await assertFails(getDoc(doc(as('u-emp1'), 'employees', 'EMP3')));
    await assertFails(getDoc(doc(as('u-emp1'), 'buses', 'bus2')));
  });

  it('signed-out visitors read nothing', async () => {
    const anon = env.unauthenticatedContext().firestore() as unknown as Firestore;
    await assertFails(getDoc(doc(anon, 'employees', 'EMP1')));
    await assertFails(getDoc(doc(anon, 'buses', 'bus1')));
  });
});

describe('status changes (own record, atomic with the bus counter)', () => {
  const goIn = (db: Firestore, empId: string, nextGoingCount: number, tally = 1) => {
    const batch = writeBatch(db);
    batch.update(doc(db, 'employees', empId), { goingStatus: 'in', goingInCount: tally, updatedAt: serverTimestamp() });
    batch.update(doc(db, 'buses', 'bus1'), { goingCount: nextGoingCount, updatedAt: serverTimestamp() });
    return batch.commit();
  };

  it('an employee can switch her own status IN together with the counter', async () => {
    await assertSucceeds(goIn(as('u-emp1'), 'EMP1', 2));
  });

  it('…but not without the matching counter change', async () => {
    const db = as('u-emp1');
    await assertFails(
      updateDoc(doc(db, 'employees', 'EMP1'), { goingStatus: 'in', goingInCount: 1, updatedAt: serverTimestamp() }),
    );
  });

  it('…and not with a counter that does not match', async () => {
    await assertFails(goIn(as('u-emp1'), 'EMP1', 1));
  });

  it('…and not past the capacity', async () => {
    await seed({ bus1GoingCount: 2 });
    await assertFails(goIn(as('u-emp1'), 'EMP1', 3));
  });

  it("an employee cannot touch a colleague's record", async () => {
    const db = as('u-emp1');
    const batch = writeBatch(db);
    batch.update(doc(db, 'employees', 'EMP2'), { goingStatus: 'out', updatedAt: serverTimestamp() });
    batch.update(doc(db, 'buses', 'bus1'), { goingCount: 0, updatedAt: serverTimestamp() });
    await assertFails(batch.commit());
  });

  it('an employee cannot edit anything but the statuses (e.g. her own name)', async () => {
    await assertFails(
      updateDoc(doc(as('u-emp1'), 'employees', 'EMP1'), { name: 'Boss', updatedAt: serverTimestamp() }),
    );
  });

  it('only admins create or delete employees', async () => {
    const record = {
      employeeId: 'NEW1',
      name: 'New',
      type: 'waiting',
      busId: 'bus1',
      goingStatus: 'out',
      returningStatus: 'out',
    };
    await assertFails(setDoc(doc(as('u-emp1'), 'employees', 'NEW1'), record));
    await assertFails(setDoc(doc(as('u-mgr'), 'employees', 'NEW1'), record));
    await assertSucceeds(setDoc(doc(as('u-adm'), 'employees', 'NEW1'), record));
  });
});

describe('no self-promotion', () => {
  it('users can read only their own profile (managers read all)', async () => {
    await assertSucceeds(getDoc(doc(as('u-emp1'), 'users', 'u-emp1')));
    await assertFails(getDoc(doc(as('u-emp1'), 'users', 'u-mgr')));
    await assertSucceeds(getDoc(doc(as('u-mgr'), 'users', 'u-emp1')));
  });

  it('nobody but an admin can write a profile – an employee cannot make herself admin', async () => {
    await assertFails(setDoc(doc(as('u-emp1'), 'users', 'u-emp1'), { role: 'admin' }));
    await assertFails(updateDoc(doc(as('u-emp1'), 'users', 'u-emp1'), { role: 'admin' }));
    await assertFails(updateDoc(doc(as('u-mgr'), 'users', 'u-mgr'), { role: 'admin' }));
  });
});

describe('server-only collections (PIN hashes, login counters)', () => {
  for (const [path, label] of [
    [['credentials', 'u-mgr'], 'credentials'],
    [['loginAttempts', 'ip_abc'], 'loginAttempts'],
    [['meta', 'dailyReset'], 'meta'],
  ] as const) {
    it(`${label}: denied to employees, managers and admins alike`, async () => {
      for (const uid of ['u-emp1', 'u-mgr', 'u-adm']) {
        await assertFails(getDoc(doc(as(uid), path[0], path[1])));
        await assertFails(setDoc(doc(as(uid), path[0], path[1]), { hacked: true }));
      }
    });
  }
});

describe('a trip belongs to today (Cairo)', () => {
  const dayOffset = (days: number) => todayKey(new Date(Date.now() + days * 86_400_000));

  const employeeTrip = (date: string) => ({
    busId: 'bus1',
    route: 'Route bus1',
    busNumber: 'No bus1',
    capacity: 2,
    tripType: 'going',
    date,
    status: 'arrived',
    arrivalTime: serverTimestamp(),
    arrivedById: 'EMP1',
    arrivedByName: 'Name EMP1',
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  const managerTrip = (date: string) => ({
    busId: 'bus1',
    route: 'Route bus1',
    busNumber: 'No bus1',
    tripType: 'going',
    capacity: 2,
    date,
    status: 'active',
    arrivalTime: null,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  it("an employee records the arrival of today's going trip", async () => {
    const date = dayOffset(0);
    await assertSucceeds(setDoc(doc(as('u-emp1'), 'busTrips', `bus1_${date}_going`), employeeTrip(date)));
  });

  it('…but not for yesterday or tomorrow', async () => {
    for (const offset of [-1, 1]) {
      const date = dayOffset(offset);
      await assertFails(setDoc(doc(as('u-emp1'), 'busTrips', `bus1_${date}_going`), employeeTrip(date)));
    }
  });

  it("…nor on another bus, nor signed with a colleague's name", async () => {
    const date = dayOffset(0);
    await assertFails(
      setDoc(doc(as('u-emp3'), 'busTrips', `bus1_${date}_going`), {
        ...employeeTrip(date),
        arrivedById: 'EMP3',
        arrivedByName: 'Name EMP3',
      }),
    );
    await assertFails(
      setDoc(doc(as('u-emp1'), 'busTrips', `bus1_${date}_going`), {
        ...employeeTrip(date),
        arrivedByName: 'Someone else',
      }),
    );
  });

  it("a manager opens today's trip, but not one for another day", async () => {
    const today = dayOffset(0);
    await assertSucceeds(setDoc(doc(as('u-mgr'), 'busTrips', `bus1_${today}_going`), managerTrip(today)));
    const other = dayOffset(-3);
    await assertFails(setDoc(doc(as('u-mgr'), 'busTrips', `bus1_${other}_going`), managerTrip(other)));
  });
});
