import { onSnapshot, orderBy, query, runTransaction, serverTimestamp, updateDoc } from 'firebase/firestore';
import { busesCollection, busRef, db, mapBus, mapTrip, tripRef } from '../firebase';
import type { Bus, BusTrip, Employee, TripType } from '../types';
import { makeError, toAppError } from '../utils/errors';
import type { Unsubscribe } from './employeeService';

type OnError = (error: unknown) => void;

export function subscribeBus(busId: string, onData: (bus: Bus | null) => void, onError: OnError): Unsubscribe {
  return onSnapshot(busRef(busId), (snap) => onData(snap.exists() ? mapBus(snap) : null), onError);
}

export function subscribeBuses(onData: (buses: Bus[]) => void, onError: OnError): Unsubscribe {
  return onSnapshot(
    query(busesCollection(), orderBy('busNumber')),
    (snap) => onData(snap.docs.map(mapBus)),
    onError,
  );
}

export const makeTripId = (busId: string, date: string, tripType: TripType) =>
  `${busId}_${date}_${tripType}`;

export function subscribeTrip(tripId: string, onData: (trip: BusTrip | null) => void, onError: OnError): Unsubscribe {
  return onSnapshot(tripRef(tripId), (snap) => onData(snap.exists() ? mapTrip(snap) : null), onError);
}

/** Creates today's trip document for this bus + direction if it does not exist yet. */
export async function ensureTrip(bus: Bus, tripType: TripType, date: string): Promise<void> {
  const ref = tripRef(makeTripId(bus.id, date, tripType));
  try {
    await runTransaction(db, async (tx) => {
      const snap = await tx.get(ref);
      if (snap.exists()) return;
      tx.set(ref, {
        busId: bus.id,
        route: bus.route,
        busNumber: bus.busNumber,
        tripType,
        capacity: bus.capacity,
        date,
        status: 'active',
        arrivalTime: null,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    });
  } catch (err) {
    throw toAppError(err);
  }
}

export async function setActiveTripType(busId: string, tripType: TripType): Promise<void> {
  try {
    await updateDoc(busRef(busId), { activeTripType: tripType, updatedAt: serverTimestamp() });
  } catch (err) {
    throw toAppError(err);
  }
}

/** Records the arrival once, using the server clock. A second call is rejected. */
export async function recordArrival(tripId: string): Promise<void> {
  try {
    await runTransaction(db, async (tx) => {
      const snap = await tx.get(tripRef(tripId));
      if (!snap.exists()) throw makeError('not-found', 'لا توجد رحلة نشطة.');
      if (snap.data().arrivalTime) throw makeError('already-arrived');
      tx.update(tripRef(tripId), {
        arrivalTime: serverTimestamp(),
        status: 'arrived',
        updatedAt: serverTimestamp(),
      });
    });
  } catch (err) {
    throw toAppError(err);
  }
}

/**
 * Any employee on the bus can press "وصلنا". Arrival is recorded for the GOING direction only:
 * it stores today's going-trip arrival (server clock) and every employee sees it live.
 * Creates the trip document if nobody has opened it yet. If someone else already recorded the
 * arrival, nothing is written (the first press wins; the transaction makes two simultaneous taps safe).
 */
export async function recordArrivalByEmployee(bus: Bus, date: string, employee: Employee): Promise<void> {
  const tripType: TripType = 'going';
  const ref = tripRef(makeTripId(bus.id, date, tripType));
  try {
    await runTransaction(db, async (tx) => {
      const snap = await tx.get(ref);
      const by = { arrivedById: employee.id, arrivedByName: employee.name };
      if (snap.exists()) {
        if (snap.data().arrivalTime) return; // already recorded by someone else
        tx.update(ref, { ...by, arrivalTime: serverTimestamp(), status: 'arrived', updatedAt: serverTimestamp() });
        return;
      }
      tx.set(ref, {
        busId: bus.id,
        route: bus.route,
        busNumber: bus.busNumber,
        tripType,
        capacity: bus.capacity,
        date,
        ...by,
        status: 'arrived',
        arrivalTime: serverTimestamp(),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    });
  } catch (err) {
    throw toAppError(err);
  }
}

/** Explicit reset of a recorded arrival (managers / admins only, enforced by the rules). */
export async function resetArrival(tripId: string): Promise<void> {
  try {
    await updateDoc(tripRef(tripId), {
      arrivalTime: null,
      arrivedById: null,
      arrivedByName: null,
      status: 'active',
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    throw toAppError(err);
  }
}
