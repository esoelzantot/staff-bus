/**
 * A whole new day, end to end, against the emulator WITH the real security rules:
 * the nightly reset runs (Admin SDK), then employees press IN / OUT the way the app does (client SDK, same fields
 * as src/services/employeeService.ts + attendanceService.ts). Proves that after the reset everyone can choose
 * freely, the bus capacity still holds, the IN tallies and the daily record follow every choice, and a late second
 * run of the reset never overwrites what people chose.
 *
 *   npm run test:rules
 */
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { deleteApp, initializeApp, type App } from 'firebase-admin/app';
import { getFirestore as getAdminFirestore, type Firestore as AdminFirestore } from 'firebase-admin/firestore';
import { doc, getDoc, serverTimestamp, setDoc, writeBatch, type Firestore } from 'firebase/firestore';
import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { resetAllBuses } from '../../api/_lib/resetDay.js';
import { todayKey } from '../../src/utils/date/format';

const PROJECT = 'demo-staff-bus-newday';
const today = todayKey(); // the rules only accept records for the real Cairo day

let env: RulesTestEnvironment;
let adminApp: App;
let admin: AdminFirestore;

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: PROJECT,
    firestore: { rules: readFileSync('firestore.rules', 'utf8') },
  });
  adminApp = initializeApp({ projectId: PROJECT }, 'new-day-test');
  admin = getAdminFirestore(adminApp);
});

afterAll(async () => {
  await env.cleanup();
  await deleteApp(adminApp);
});

/** Yesterday evening: MAIN1 / MAIN2 went OUT, WAIT1 had a seat (IN), WAIT2 stayed OUT. Capacity 3. */
beforeEach(async () => {
  await env.clearFirestore();
  await admin.doc('buses/bus1').set({
    route: 'R1',
    busNumber: 'B1',
    capacity: 3,
    activeTripType: 'returning',
    goingCount: 1,
    returningCount: 1,
  });
  const people = {
    MAIN1: { type: 'main', going: 'out', count: 10 },
    MAIN2: { type: 'main', going: 'out', count: 10 },
    WAIT1: { type: 'waiting', going: 'in', count: 3 },
    WAIT2: { type: 'waiting', going: 'out', count: 3 },
  } as const;
  for (const [id, p] of Object.entries(people)) {
    await admin.doc(`employees/${id}`).set({
      employeeId: id,
      name: id,
      type: p.type,
      busId: 'bus1',
      goingStatus: p.going,
      returningStatus: p.going,
      goingInCount: p.count,
      returningInCount: p.count,
    });
    await admin.doc(`users/u-${id}`).set({ role: 'employee', employeeDocId: id });
  }
});

const as = (id: string) => env.authenticatedContext(`u-${id}`).firestore() as unknown as Firestore;

/** Exactly what the app writes when an employee presses Going IN / OUT. */
async function pressGoing(id: string, value: 'in' | 'out') {
  const db = as(id);
  const me = (await getDoc(doc(db, 'employees', id))).data()!;
  const bus = (await getDoc(doc(db, 'buses', 'bus1'))).data()!;
  const delta = value === 'in' ? 1 : -1;
  const batch = writeBatch(db);
  batch.update(doc(db, 'employees', id), {
    goingStatus: value,
    goingInCount: Math.max(0, me.goingInCount + delta),
    updatedAt: serverTimestamp(),
  });
  batch.update(doc(db, 'buses', 'bus1'), {
    goingCount: Math.max(0, bus.goingCount + delta),
    statusChangeOf: id,
    updatedAt: serverTimestamp(),
  });
  await batch.commit();
  // …then today's record (attendanceService.recordAttendance)
  await setDoc(
    doc(db, 'employees', id, 'attendance', today),
    { date: today, goingStatus: value, returningStatus: me.returningStatus, updatedAt: serverTimestamp() },
    { merge: true },
  );
}

const employee = async (id: string) => (await admin.doc(`employees/${id}`).get()).data()!;
const record = async (id: string) => (await admin.doc(`employees/${id}/attendance/${today}`).get()).data()!;
const bus = async () => (await admin.doc('buses/bus1').get()).data()!;

describe('a new day: reset at night, then everyone chooses freely', () => {
  it('starts the day: main IN / IN, waiting OUT / OUT, direction Going', async () => {
    const result = await resetAllBuses(admin, today);
    expect(result.failed).toBe(false);
    expect(await employee('MAIN1')).toMatchObject({ goingStatus: 'in', returningStatus: 'in', goingInCount: 11 });
    expect(await employee('WAIT1')).toMatchObject({ goingStatus: 'out', returningStatus: 'out', goingInCount: 3 });
    expect(await bus()).toMatchObject({ goingCount: 2, returningCount: 2, activeTripType: 'going' });
  });

  it('a main employee can go OUT, and the day is taken back from the tally and the record', async () => {
    await resetAllBuses(admin, today);
    await assertSucceeds(pressGoing('MAIN1', 'out'));
    expect(await employee('MAIN1')).toMatchObject({ goingStatus: 'out', goingInCount: 10 });
    expect(await record('MAIN1')).toMatchObject({ goingStatus: 'out', returningStatus: 'in' });
    expect(await bus()).toMatchObject({ goingCount: 1 });
  });

  it('a waiting employee can take a free seat (IN), and it counts as an IN day', async () => {
    await resetAllBuses(admin, today);
    await assertSucceeds(pressGoing('WAIT1', 'in'));
    expect(await employee('WAIT1')).toMatchObject({ goingStatus: 'in', goingInCount: 4 });
    expect(await record('WAIT1')).toMatchObject({ goingStatus: 'in' });
    expect(await bus()).toMatchObject({ goingCount: 3 });
  });

  it('changing your mind many times still counts ONE day', async () => {
    await resetAllBuses(admin, today);
    for (const value of ['out', 'in', 'out', 'in'] as const) await assertSucceeds(pressGoing('MAIN1', value));
    expect(await employee('MAIN1')).toMatchObject({ goingStatus: 'in', goingInCount: 11 });
    expect(await record('MAIN1')).toMatchObject({ goingStatus: 'in' });
  });

  it('the capacity still holds: no IN on a full bus', async () => {
    await resetAllBuses(admin, today);
    await assertSucceeds(pressGoing('WAIT1', 'in')); // 3 / 3
    await assertFails(pressGoing('WAIT2', 'in'));
    expect(await bus()).toMatchObject({ goingCount: 3 });
  });

  it('a late second run of the reset (GitHub runs it several times a night) keeps what people chose', async () => {
    await resetAllBuses(admin, today);
    await pressGoing('MAIN1', 'out');
    await pressGoing('WAIT1', 'in');

    const again = await resetAllBuses(admin, today);
    expect(again.seeded).toBe(0);
    expect(await employee('MAIN1')).toMatchObject({ goingStatus: 'out', goingInCount: 10 });
    expect(await employee('WAIT1')).toMatchObject({ goingStatus: 'in', goingInCount: 4 });
    expect(await bus()).toMatchObject({ goingCount: 2 });
  });

  it('someone who pressed IN / OUT after midnight but BEFORE the reset ran keeps the choice', async () => {
    await pressGoing('WAIT2', 'in'); // 00:05 – the reset has not run yet (GitHub is late)
    await resetAllBuses(admin, today);
    expect(await employee('WAIT2')).toMatchObject({ goingStatus: 'in' });
    expect(await employee('MAIN1')).toMatchObject({ goingStatus: 'in' });
    expect(await bus()).toMatchObject({ goingCount: 3 });
  });

  it('…unless a waiting employee took a seat the main employees need: it is given back, tally + record fixed', async () => {
    await admin.doc('buses/bus1').update({ capacity: 2 }); // 2 main employees = a full bus
    await pressGoing('WAIT2', 'in'); // 00:05: grabs the seat MAIN1 left free yesterday (2 / 2)
    const result = await resetAllBuses(admin, today);
    expect(result.failed).toBe(false);
    expect(result.buses[0]).toMatchObject({ status: 'done', bumped: ['WAIT2'] });
    expect(await employee('WAIT2')).toMatchObject({ goingStatus: 'out', goingInCount: 3 });
    expect(await record('WAIT2')).toMatchObject({ goingStatus: 'out' });
    expect(await employee('MAIN1')).toMatchObject({ goingStatus: 'in', goingInCount: 11 });
    expect(await bus()).toMatchObject({ goingCount: 2 });
  });
});
