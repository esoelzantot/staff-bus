import { onSnapshot, query, runTransaction, serverTimestamp, where } from 'firebase/firestore';
import { busRef, db, employeeRef, employeesCollection, mapBus, mapEmployee } from '../firebase';
import type { EmployeeStatus, StatusField } from '../types';
import type { Employee } from '../types';
import { todayKey } from '../utils/date/format';
import { makeError, toAppError } from '../utils/errors';
import { recordAttendance } from './attendanceService';

export type Unsubscribe = () => void;
type OnError = (error: unknown) => void;

export function subscribeEmployee(
  employeeId: string,
  onData: (employee: Employee | null) => void,
  onError: OnError,
): Unsubscribe {
  return onSnapshot(employeeRef(employeeId), (snap) => onData(snap.exists() ? mapEmployee(snap) : null), onError);
}

export function subscribeBusEmployees(
  busId: string,
  onData: (employees: Employee[]) => void,
  onError: OnError,
): Unsubscribe {
  const q = query(employeesCollection(), where('busId', '==', busId));
  return onSnapshot(
    q,
    (snap) =>
      onData(
        snap.docs.map(mapEmployee).sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })),
      ),
    onError,
  );
}

const COUNTER_FIELD = { goingStatus: 'goingCount', returningStatus: 'returningCount' } as const;
const TALLY_FIELD = { goingStatus: 'goingInCount', returningStatus: 'returningInCount' } as const;

/**
 * Sets one status (going OR returning) for one employee.
 *
 * The employee document and the bus counter are written in ONE transaction:
 *  - the counter can never drift from the real number of "in" employees,
 *  - joining a full bus is rejected atomically (and again by the security rules),
 *  - concurrent updates are retried by Firestore instead of overwriting each other.
 * Only the requested field (and its IN tally) is written, so Going never touches Returning and vice versa.
 *
 * The IN tally counts DAYS: OUT → IN adds one, IN → OUT takes it back (never below zero), so switching
 * IN / OUT / IN on the same day is still one day. Afterwards today's IN record (employees/{id}/attendance) is
 * brought up to date – separately, so a problem with the log can never block an IN / OUT change.
 */
export async function setEmployeeStatus(employeeId: string, field: StatusField, value: EmployeeStatus): Promise<void> {
  let saved = null as { goingStatus: EmployeeStatus; returningStatus: EmployeeStatus } | null;
  try {
    await runTransaction(db, async (tx) => {
      const empSnap = await tx.get(employeeRef(employeeId));
      if (!empSnap.exists()) throw makeError('not-found', 'لم يتم العثور على سجل الموظف.');
      const employee = mapEmployee(empSnap);
      if (employee[field] === value) return; // nothing to change

      const busSnap = await tx.get(busRef(employee.busId));
      if (!busSnap.exists()) throw makeError('not-found', 'لم يتم العثور على بيانات الأتوبيس.');
      const bus = mapBus(busSnap);

      const counter = COUNTER_FIELD[field];
      const delta = value === 'in' ? 1 : -1;
      if (delta > 0 && bus[counter] >= bus.capacity) {
        throw makeError('bus-full', `الأتوبيس ممتلئ حالياً. الحد الأقصى: ${bus.capacity} راكب.`);
      }

      const tally = TALLY_FIELD[field];
      tx.update(employeeRef(employeeId), {
        [field]: value,
        // days IN: OUT → IN adds one, IN → OUT takes it back
        [tally]: Math.max(0, employee[tally] + delta),
        updatedAt: serverTimestamp(),
      });
      tx.update(busRef(employee.busId), {
        [counter]: Math.max(0, bus[counter] + delta),
        updatedAt: serverTimestamp(),
      });
      saved = {
        goingStatus: field === 'goingStatus' ? value : employee.goingStatus,
        returningStatus: field === 'returningStatus' ? value : employee.returningStatus,
      };
    });
  } catch (err) {
    throw toAppError(err);
  }

  // Not awaited on purpose: the button must not wait for the log (see recordAttendance).
  if (saved) void recordAttendance(employeeId, todayKey(), saved);
}
