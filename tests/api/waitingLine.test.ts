/**
 * The waiting line ("الدور") as kept by api/employees.ts, against the Firestore + Auth emulators (real transactions):
 * new waiting employees join at the end, leaving the line closes the gap, managers reorder it.
 *
 *   npm run test:rules
 */
import { deleteApp, initializeApp, type App } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createEmployee, deleteEmployee, reorderWaiting, updateEmployee } from '../../api/employees';
import type { Admin } from '../../api/_lib/core';

const PROJECT = 'demo-staff-bus-queue';
let app: App;
let a: Admin;

beforeAll(() => {
  if (!process.env.FIRESTORE_EMULATOR_HOST || !process.env.FIREBASE_AUTH_EMULATOR_HOST) {
    throw new Error('Run through the emulators: npm run test:rules');
  }
  app = initializeApp({ projectId: PROJECT }, 'queue-test');
  a = { auth: getAuth(app), db: getFirestore(app) };
});

afterAll(async () => {
  await deleteApp(app);
});

async function clear() {
  const fs = `http://${process.env.FIRESTORE_EMULATOR_HOST}/emulator/v1/projects/${PROJECT}/databases/(default)/documents`;
  const auth = `http://${process.env.FIREBASE_AUTH_EMULATOR_HOST}/emulator/v1/projects/${PROJECT}/accounts`;
  await fetch(fs, { method: 'DELETE' });
  await fetch(auth, { method: 'DELETE' });
}

beforeEach(async () => {
  await clear();
  for (const id of ['bus1', 'bus2']) {
    await a.db.doc(`buses/${id}`).set({
      route: id,
      busNumber: id,
      capacity: 14,
      activeTripType: 'going',
      goingCount: 0,
      returningCount: 0,
    });
  }
});

const add = (employeeId: string, type: 'main' | 'waiting' = 'waiting', busId = 'bus1') =>
  createEmployee(a, { employeeId, name: `Name ${employeeId}`, type, busId });

/** The waiting line of a bus as stored: [id, queueOrder] in order. */
async function line(busId = 'bus1') {
  const snap = await a.db.collection('employees').where('busId', '==', busId).where('type', '==', 'waiting').get();
  return snap.docs
    .map((d) => [d.id, d.get('queueOrder')] as const)
    .sort((x, y) => (x[1] ?? 99) - (y[1] ?? 99));
}

describe('the waiting line', () => {
  it('new waiting employees join at the end: 1, 2, 3', async () => {
    await add('WA1');
    await add('WA2');
    await add('MA1', 'main');
    await add('WA3');
    expect(await line()).toEqual([
      ['WA1', 1],
      ['WA2', 2],
      ['WA3', 3],
    ]);
    expect((await a.db.doc('employees/MA1').get()).get('queueOrder')).toBeUndefined();
  });

  it('employees from before the line existed get numbers (by name) when the next one joins', async () => {
    for (const [id, name] of [
      ['OLDB', 'Badr'],
      ['OLDA', 'Ali'],
    ]) {
      await a.db.doc(`employees/${id}`).set({ employeeId: id, name, type: 'waiting', busId: 'bus1' });
    }
    await add('NEW');
    expect(await line()).toEqual([
      ['OLDA', 1],
      ['OLDB', 2],
      ['NEW', 3],
    ]);
  });

  it('a manager reorders it', async () => {
    await add('WA1');
    await add('WA2');
    await add('WA3');
    await reorderWaiting(a, { busId: 'bus1', order: ['WA3', 'WA1', 'WA2'] });
    expect(await line()).toEqual([
      ['WA3', 1],
      ['WA1', 2],
      ['WA2', 3],
    ]);
  });

  it('…but only with exactly the waiting employees of that bus', async () => {
    await add('WA1');
    await add('WA2');
    for (const order of [['WA1'], ['WA1', 'WA2', 'WA9'], ['WA1', 'WA1']]) {
      await expect(reorderWaiting(a, { busId: 'bus1', order })).rejects.toMatchObject({ status: 409 });
    }
    expect(await line()).toEqual([
      ['WA1', 1],
      ['WA2', 2],
    ]);
  });

  it('deleting someone closes the gap', async () => {
    await add('WA1');
    await add('WA2');
    await add('WA3');
    await deleteEmployee(a, { employeeId: 'WA2' });
    expect(await line()).toEqual([
      ['WA1', 1],
      ['WA3', 2],
    ]);
  });

  it('made main → leaves the line (gap closed); made waiting → joins at the end', async () => {
    await add('WA1');
    await add('WA2');
    await add('MA1', 'main');
    await updateEmployee(a, { employeeId: 'WA1', type: 'main' });
    expect(await line()).toEqual([['WA2', 1]]);
    expect((await a.db.doc('employees/WA1').get()).get('queueOrder')).toBeUndefined();

    await updateEmployee(a, { employeeId: 'MA1', type: 'waiting' });
    expect(await line()).toEqual([
      ['WA2', 1],
      ['MA1', 2],
    ]);
  });

  it('moved to another bus → leaves the old line, joins the end of the new one', async () => {
    await add('WA1');
    await add('WA2');
    await add('XB1', 'waiting', 'bus2');
    await updateEmployee(a, { employeeId: 'WA1', busId: 'bus2' });
    expect(await line('bus1')).toEqual([['WA2', 1]]);
    expect(await line('bus2')).toEqual([
      ['XB1', 1],
      ['WA1', 2],
    ]);
  });

  it('a name change keeps the place', async () => {
    await add('WA1');
    await add('WA2');
    await updateEmployee(a, { employeeId: 'WA1', name: 'Renamed' });
    expect(await line()).toEqual([
      ['WA1', 1],
      ['WA2', 2],
    ]);
  });
});
