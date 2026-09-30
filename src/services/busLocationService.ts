import { onSnapshot, runTransaction, serverTimestamp, updateDoc } from 'firebase/firestore';
import { db, locationRef, mapLocation } from '../firebase';
import type { BusLocation, Employee } from '../types';
import { makeError, toAppError } from '../utils/errors';
import type { Unsubscribe } from './employeeService';

/** A sharer whose last update is older than this is treated as gone. Keep in sync with firestore.rules (90 s). */
export const LOCATION_STALE_MS = 90_000;

export interface Fix {
  lat: number;
  lng: number;
  accuracy: number | null;
  speed: number | null;
  heading: number | null;
}

export const isLocationFresh = (loc: BusLocation, now = Date.now()) =>
  now - loc.updatedAt.toMillis() < LOCATION_STALE_MS;

export function subscribeBusLocation(
  busId: string,
  onData: (loc: BusLocation | null) => void,
  onError: (error: unknown) => void,
): Unsubscribe {
  return onSnapshot(locationRef(busId), (snap) => onData(snap.exists() ? mapLocation(snap) : null), onError);
}

/**
 * Becomes THE sharer of the bus' location. Rejected when a colleague is already sharing and still
 * sending updates; allowed when nobody shares, when it is me (resume), or when the last update is stale.
 */
export async function claimBusLocation(busId: string, employee: Employee, fix: Fix): Promise<void> {
  const ref = locationRef(busId);
  try {
    await runTransaction(db, async (tx) => {
      const snap = await tx.get(ref);
      if (snap.exists()) {
        const current = mapLocation(snap);
        if (current.active && current.sharedById !== employee.id && isLocationFresh(current)) {
          throw makeError('already-sharing');
        }
      }
      tx.set(ref, {
        active: true,
        sharedById: employee.id,
        sharedByName: employee.name,
        ...fix,
        startedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    });
  } catch (err) {
    throw toAppError(err);
  }
}

/** Pushes a new position (only the current sharer is allowed, enforced by the rules). */
export async function publishBusPosition(busId: string, fix: Fix): Promise<void> {
  try {
    await updateDoc(locationRef(busId), { ...fix, updatedAt: serverTimestamp() });
  } catch (err) {
    throw toAppError(err);
  }
}

/** Stops sharing (only the current sharer is allowed, enforced by the rules). */
export async function releaseBusLocation(busId: string): Promise<void> {
  try {
    await updateDoc(locationRef(busId), { active: false, updatedAt: serverTimestamp() });
  } catch (err) {
    throw toAppError(err);
  }
}
