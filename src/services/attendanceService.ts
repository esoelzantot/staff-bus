import { getDocs, serverTimestamp, setDoc } from 'firebase/firestore';
import { attendanceCollection, attendanceRef, mapAttendance } from '../firebase';
import type { AttendanceDay, EmployeeStatus } from '../types';
import { toAppError } from '../utils/errors';

/**
 * Writes today's IN record of an employee (one document per person per Cairo day).
 *
 * It is deliberately NOT part of the status transaction and never throws: the IN / OUT change itself must
 * not fail because of the log. If this write is lost (offline, rules), the next status change rewrites the
 * whole day, and the nightly reset creates tomorrow's record for everyone anyway.
 */
export async function recordAttendance(
  employeeId: string,
  day: string,
  statuses: { goingStatus: EmployeeStatus; returningStatus: EmployeeStatus },
): Promise<void> {
  try {
    await setDoc(
      attendanceRef(employeeId, day),
      { date: day, ...statuses, updatedAt: serverTimestamp() },
      { merge: true },
    );
  } catch (err) {
    console.warn('Daily IN record was not saved', err);
  }
}

/** Every recorded day of one employee, newest first (managers only – enforced by the rules). */
export async function fetchAttendance(employeeId: string): Promise<AttendanceDay[]> {
  try {
    const snap = await getDocs(attendanceCollection(employeeId));
    return snap.docs.map(mapAttendance).sort((a, b) => b.date.localeCompare(a.date));
  } catch (err) {
    throw toAppError(err);
  }
}
