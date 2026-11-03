import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { COLLECTIONS } from '../config/constants';
import { db, mapTrip } from '../firebase';
import type { ArrivalRecord } from '../utils/arrivals';
import type { Unsubscribe } from './employeeService';

/**
 * The going trips of one bus in one month (yyyy-mm), live: an arrival recorded today appears at once. Every
 * "وصلنا" is already stored on its trip (busTrips/{busId}_{date}_going: arrivalTime from the server clock + who).
 * Needs the composite index busTrips (busId, tripType, date) – see firestore.indexes.json.
 */
export function subscribeMonthArrivals(
  busId: string,
  month: string,
  onData: (records: ArrivalRecord[]) => void,
  onError: (error: unknown) => void,
): Unsubscribe {
  const q = query(
    collection(db, COLLECTIONS.busTrips),
    where('busId', '==', busId),
    where('tripType', '==', 'going'),
    where('date', '>=', `${month}-01`),
    where('date', '<=', `${month}-31`),
  );
  return onSnapshot(
    q,
    (snap) =>
      onData(
        snap.docs.map(mapTrip).map((t) => ({
          date: t.date,
          arrivalTime: t.arrivalTime ? t.arrivalTime.toDate() : null,
          arrivedByName: t.arrivedByName ?? null,
        })),
      ),
    onError,
  );
}
