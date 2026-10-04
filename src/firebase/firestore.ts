import {
  collection,
  doc,
  getFirestore,
  type DocumentSnapshot,
  type QueryDocumentSnapshot,
} from 'firebase/firestore';
import { COLLECTIONS } from '../config/constants';
import type { AttendanceDay, Bus, BusLocation, BusTrip, Employee } from '../types';
import { firebaseApp } from './config';

export const db = getFirestore(firebaseApp);

export const employeesCollection = () => collection(db, COLLECTIONS.employees);
export const busesCollection = () => collection(db, COLLECTIONS.buses);

export const userRef = (uid: string) => doc(db, COLLECTIONS.users, uid);
export const employeeRef = (id: string) => doc(db, COLLECTIONS.employees, id);
export const busRef = (id: string) => doc(db, COLLECTIONS.buses, id);
export const tripRef = (id: string) => doc(db, COLLECTIONS.busTrips, id);
export const attendanceCollection = (employeeId: string) =>
  collection(db, COLLECTIONS.employees, employeeId, COLLECTIONS.attendance);
export const attendanceRef = (employeeId: string, day: string) =>
  doc(db, COLLECTIONS.employees, employeeId, COLLECTIONS.attendance, day);
export const locationRef = (busId: string) => doc(db, COLLECTIONS.busLocations, busId);

type AnySnapshot = DocumentSnapshot | QueryDocumentSnapshot;

function read<T extends { id: string }>(snap: AnySnapshot): T {
  // "estimate" gives pending serverTimestamp() fields a usable local value.
  const data = snap.data({ serverTimestamps: 'estimate' });
  if (!data) throw new Error(`Document ${snap.ref.path} has no data`);
  return { ...data, id: snap.id } as unknown as T;
}

export const mapEmployee = (snap: AnySnapshot): Employee => {
  const e = read<Employee>(snap);
  return { ...e, goingInCount: e.goingInCount ?? 0, returningInCount: e.returningInCount ?? 0 };
};
export const mapBus = (snap: AnySnapshot) => read<Bus>(snap);
export const mapTrip = (snap: AnySnapshot) => read<BusTrip>(snap);
export const mapLocation = (snap: AnySnapshot) => read<BusLocation>(snap);
export const mapAttendance = (snap: AnySnapshot) => read<AttendanceDay>(snap);
