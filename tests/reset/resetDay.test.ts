/**
 * The daily reset against the Firestore emulator (real transactions, real writes):
 *
 *   npm run test:rules     (runs tests/rules and tests/reset inside `firebase emulators:exec`)
 *
 * Uses its own demo project, so it never shares data with the rules tests.
 */
import { deleteApp, initializeApp, type App } from 'firebase-admin/app';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { resetAllBuses, resetBus } from '../../scripts/lib/resetDay';

const PROJECT = 'demo-staff-bus-reset';
const TODAY = '2026-10-22';
const YESTERDAY = '2026-10-21';

let app: App;
let db: Firestore;

beforeAll(() => {
  if (!process.env.FIRESTORE_EMULATOR_HOST) throw new Error('Run through the emulator: npm run test:rules');
  app = initializeApp({ projectId: PROJECT }, 'reset-test');
  db = getFirestore(app);
});

afterAll(async () => {
  await deleteApp(app);
});

async function clear() {
  const url = `http://${process.env.FIRESTORE_EMULATOR_HOST}/emulator/v1/projects/${PROJECT}/databases/(default)/documents`;
  const res = await fetch(url, { method: 'DELETE' });
  if (!res.ok) throw new Error(`Could not clear the emulator: ${res.status}`);
}

type Status = 'in' | 'out';
interface Seed {
  type: 'main' | 'waiting';
  going: Status;
  returning: Status;
  goingInCount?: number;
  returningInCount?: number;
  bus?: string;
}

async function seed(employees: Record<string, Seed>, capacity = 3) {
  await db.doc('buses/bus1').set({
    route: 'R1',
    busNumber: 'B1',
    capacity,
    activeTripType: 'returning',
    goingCount: 0,
    returningCount: 0,
  });
  for (const [id, e] of Object.entries(employees)) {
    await db.doc(`employees/${id}`).set({
      employeeId: id,
      name: id,
      type: e.type,
      busId: e.bus ?? 'bus1',
      goingStatus: e.going,
      returningStatus: e.returning,
      goingInCount: e.goingInCount ?? 0,
      returningInCount: e.returningInCount ?? 0,
    });
  }
}

const employee = async (id: string) => (await db.doc(`employees/${id}`).get()).data()!;
const record = async (id: string, day = TODAY) => (await db.doc(`employees/${id}/attendance/${day}`).get()).data();
const bus = async () => (await db.doc('buses/bus1').get()).data()!;

beforeEach(clear);

describe('a new day', () => {
  beforeEach(() =>
    seed({
      // yesterday evening: the main employee went OUT, the waiting one was let IN
      MAIN1: { type: 'main', going: 'out', returning: 'out', goingInCount: 5, returningInCount: 4 },
      MAIN2: { type: 'main', going: 'in', returning: 'in', goingInCount: 7, returningInCount: 7 },
      WAIT1: { type: 'waiting', going: 'in', returning: 'in', goingInCount: 2, returningInCount: 1 },
    }),
  );

  it('main employees → IN / IN, waiting employees → OUT / OUT', async () => {
    const result = await resetAllBuses(db, TODAY);
    expect(result.failed).toBe(false);
    expect(await employee('MAIN1')).toMatchObject({ goingStatus: 'in', returningStatus: 'in' });
    expect(await employee('MAIN2')).toMatchObject({ goingStatus: 'in', returningStatus: 'in' });
    expect(await employee('WAIT1')).toMatchObject({ goingStatus: 'out', returningStatus: 'out' });
  });

  it('today counts as one IN day for main employees only (going + returning)', async () => {
    await resetAllBuses(db, TODAY);
    expect(await employee('MAIN1')).toMatchObject({ goingInCount: 6, returningInCount: 5 });
    expect(await employee('MAIN2')).toMatchObject({ goingInCount: 8, returningInCount: 8 });
    expect(await employee('WAIT1')).toMatchObject({ goingInCount: 2, returningInCount: 1 });
  });

  it("creates today's record for everyone (the monthly PDF reads it)", async () => {
    await resetAllBuses(db, TODAY);
    expect(await record('MAIN1')).toMatchObject({ date: TODAY, goingStatus: 'in', returningStatus: 'in' });
    expect(await record('WAIT1')).toMatchObject({ date: TODAY, goingStatus: 'out', returningStatus: 'out' });
  });

  it('recomputes the bus: counters, direction Going, shared location stopped', async () => {
    await db.doc('busLocations/bus1').set({ active: true, sharedById: 'MAIN2' });
    await resetAllBuses(db, TODAY);
    expect(await bus()).toMatchObject({ goingCount: 2, returningCount: 2, activeTripType: 'going' });
    expect((await db.doc('busLocations/bus1').get()).data()).toMatchObject({ active: false });
  });

  it('a second run on the same day changes nothing (no day counted twice)', async () => {
    await resetAllBuses(db, TODAY);
    // after the reset MAIN1 decides not to go today
    await db.doc('employees/MAIN1').update({ goingStatus: 'out', goingInCount: 5 });
    await db.doc(`employees/MAIN1/attendance/${TODAY}`).update({ goingStatus: 'out' });

    const again = await resetAllBuses(db, TODAY);
    expect(again.seeded).toBe(0);
    expect(await employee('MAIN1')).toMatchObject({ goingStatus: 'out', goingInCount: 5, returningInCount: 5 });
    expect(await employee('MAIN2')).toMatchObject({ goingInCount: 8, returningInCount: 8 });
    expect(await bus()).toMatchObject({ goingCount: 1, returningCount: 2 });
  });

  it('the next day is counted again, and the history of yesterday stays', async () => {
    await resetAllBuses(db, YESTERDAY);
    await resetAllBuses(db, TODAY);
    expect(await employee('MAIN1')).toMatchObject({ goingInCount: 7, returningInCount: 6 });
    expect(await record('MAIN1', YESTERDAY)).toMatchObject({ goingStatus: 'in' });
    expect(await record('MAIN1', TODAY)).toMatchObject({ goingStatus: 'in' });
  });

  it('a dry run writes nothing', async () => {
    const result = await resetAllBuses(db, TODAY, true);
    expect(result.seeded).toBe(3);
    expect(await employee('MAIN1')).toMatchObject({ goingStatus: 'out', goingInCount: 5 });
    expect(await record('MAIN1')).toBeUndefined();
  });
});

describe('when something is wrong', () => {
  it('more main employees than seats: the bus is skipped untouched and reported', async () => {
    await seed(
      {
        M1: { type: 'main', going: 'out', returning: 'out' },
        M2: { type: 'main', going: 'out', returning: 'out' },
        M3: { type: 'main', going: 'out', returning: 'out' },
      },
      2,
    );
    const result = await resetAllBuses(db, TODAY);
    expect(result.failed).toBe(true);
    expect(result.buses[0]).toMatchObject({ busId: 'bus1', status: 'error' });
    expect(await employee('M1')).toMatchObject({ goingStatus: 'out', goingInCount: 0 });
    expect(await record('M1')).toBeUndefined();
  });

  it('one broken bus does not stop the others', async () => {
    await seed({ M1: { type: 'main', going: 'out', returning: 'out' } });
    await db.doc('buses/bus2').set({ route: 'R2', busNumber: 'B2', capacity: 0, goingCount: 0, returningCount: 0 });
    const result = await resetAllBuses(db, TODAY);
    expect(result.failed).toBe(true);
    expect(result.buses.find((b) => b.busId === 'bus1')).toMatchObject({ status: 'done', seeded: 1 });
    expect(result.buses.find((b) => b.busId === 'bus2')).toMatchObject({ status: 'error' });
    expect(await employee('M1')).toMatchObject({ goingStatus: 'in', goingInCount: 1 });
  });

  it('a bus that no longer exists is reported as gone', async () => {
    expect(await resetBus(db, 'nope', TODAY)).toEqual({ busId: 'nope', status: 'gone' });
  });
});
