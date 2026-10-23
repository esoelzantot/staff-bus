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
import type { EmployeePlan, EmployeeState } from './dailyReset.js';

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
    goingInCount: Number(d.data().goingInCount ?? 0),
    returningInCount: Number(d.data().returningInCount ?? 0),
  }));
}

/**
 * The writes of one employee: statuses, IN tallies, and today's record. They are one UNIT (same batch /
 * transaction). A new record is made with create(), so if someone made it in the meantime the write fails instead
 * of counting the day twice; an existing record (the person pressed IN / OUT today) is overwritten.
 * The tallies are written as final values, so the unit must run on states read in the same transaction / batch.
 */
export function resetUnit(db: Firestore, plan: EmployeePlan, day: string): Op[] {
  const empRef = db.collection('employees').doc(plan.id);
  const record = { date: day, goingStatus: plan.going, returningStatus: plan.returning, updatedAt: FieldValue.serverTimestamp() };
  return [
    (w) =>
      w.update(empRef, {
        goingStatus: plan.going,
        returningStatus: plan.returning,
        goingInCount: plan.goingInCount,
        returningInCount: plan.returningInCount,
        updatedAt: FieldValue.serverTimestamp(),
      }),
    plan.record === 'create'
      ? (w) => w.create(attendanceRef(db, plan.id, day), record)
      : (w) => w.update(attendanceRef(db, plan.id, day), record),
  ];
}

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
