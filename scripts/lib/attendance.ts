/**
 * Daily IN record helpers (Admin SDK). They take the Firestore instance as a parameter (instead of importing the
 * configured app) so the reset can be tested against the emulator.
 */
import {
  FieldValue,
  type DocumentReference,
  type Firestore,
  type QueryDocumentSnapshot,
  type Transaction,
} from 'firebase-admin/firestore';
import type { EmployeePlan, EmployeeState } from './dailyReset';

/** What a write needs – both a WriteBatch and a Transaction provide it. */
export interface Writer {
  update(ref: DocumentReference, data: Record<string, unknown>): unknown;
  create(ref: DocumentReference, data: Record<string, unknown>): unknown;
}

export type Op = (writer: Writer) => void;

/** Firestore's limit of writes in one batch / transaction. */
export const MAX_WRITES = 500;

export const attendanceRef = (db: Firestore, employeeId: string, day: string): DocumentReference =>
  db.collection('employees').doc(employeeId).collection('attendance').doc(day);

/**
 * Employees with the "has today's record" flag, read with one batched get. Pass `tx` to read inside a
 * transaction (the reset does, so nobody can change a status between this read and its writes).
 */
export async function loadEmployeeStates(
  db: Firestore,
  docs: QueryDocumentSnapshot[],
  day: string,
  tx?: Transaction,
): Promise<EmployeeState[]> {
  if (docs.length === 0) return [];
  const refs = docs.map((d) => attendanceRef(db, d.id, day));
  const records = tx ? await tx.getAll(...refs) : await db.getAll(...refs);
  return docs.map((d, i) => ({
    id: d.id,
    type: d.data().type,
    goingStatus: d.data().goingStatus,
    returningStatus: d.data().returningStatus,
    hasRecordToday: records[i].exists,
    changedAt: d.data().updatedAt?.toMillis?.() ?? 0,
  }));
}

/**
 * The writes of one employee: statuses + tally, and the new record. They are one UNIT: they must land in the same
 * batch. The record is created with create(), so if someone else made it in the meantime the whole batch fails
 * instead of counting the day twice.
 */
export function seedUnit(db: Firestore, plan: EmployeePlan, day: string): Op[] {
  const empRef = db.collection('employees').doc(plan.id);
  return [
    (w) =>
      w.update(empRef, {
        goingStatus: plan.going,
        returningStatus: plan.returning,
        ...(plan.goingTally ? { goingInCount: FieldValue.increment(plan.goingTally) } : {}),
        ...(plan.returningTally ? { returningInCount: FieldValue.increment(plan.returningTally) } : {}),
        updatedAt: FieldValue.serverTimestamp(),
      }),
    (w) =>
      w.create(attendanceRef(db, plan.id, day), {
        date: day,
        goingStatus: plan.going,
        returningStatus: plan.returning,
        updatedAt: FieldValue.serverTimestamp(),
      }),
  ];
}

/**
 * A waiting employee who gives a seat back at the start of the day (see EmployeePlan.bumped): the new statuses,
 * the day taken back from the tally, and today's record (which exists – they pressed IN after midnight) updated.
 */
export function bumpUnit(db: Firestore, plan: EmployeePlan, day: string): Op[] {
  const empRef = db.collection('employees').doc(plan.id);
  return [
    (w) =>
      w.update(empRef, {
        goingStatus: plan.going,
        returningStatus: plan.returning,
        ...(plan.goingTally ? { goingInCount: FieldValue.increment(plan.goingTally) } : {}),
        ...(plan.returningTally ? { returningInCount: FieldValue.increment(plan.returningTally) } : {}),
        updatedAt: FieldValue.serverTimestamp(),
      }),
    (w) =>
      w.update(attendanceRef(db, plan.id, day), {
        goingStatus: plan.going,
        returningStatus: plan.returning,
        updatedAt: FieldValue.serverTimestamp(),
      }),
  ];
}

/** The writes the reset makes for one employee (none when the employee is left untouched). */
export const planUnit = (db: Firestore, plan: EmployeePlan, day: string): Op[] =>
  plan.seed ? seedUnit(db, plan, day) : plan.bumped ? bumpUnit(db, plan, day) : [];

/** Commits units in batches of at most 400 operations, never splitting a unit across two batches. */
export async function commitUnits(db: Firestore, units: Op[][]): Promise<void> {
  let batch = db.batch();
  let size = 0;
  for (const unit of units) {
    if (size + unit.length > 400) {
      await batch.commit();
      batch = db.batch();
      size = 0;
    }
    unit.forEach((op) => op(batch));
    size += unit.length;
  }
  if (size > 0) await batch.commit();
}
