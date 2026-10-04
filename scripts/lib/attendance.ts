import type { DocumentReference, QueryDocumentSnapshot, WriteBatch } from 'firebase-admin/firestore';
import { FieldValue, adminDb } from './admin';
import type { EmployeePlan, EmployeeState } from './dailyReset';

export type Op = (batch: WriteBatch) => void;

export const attendanceRef = (employeeId: string, day: string): DocumentReference =>
  adminDb.collection('employees').doc(employeeId).collection('attendance').doc(day);

/** Employees with the "has today's record" flag, read with one batched get. */
export async function loadEmployeeStates(docs: QueryDocumentSnapshot[], day: string): Promise<EmployeeState[]> {
  if (docs.length === 0) return [];
  const records = await adminDb.getAll(...docs.map((d) => attendanceRef(d.id, day)));
  return docs.map((d, i) => ({
    id: d.id,
    type: d.data().type,
    goingStatus: d.data().goingStatus,
    returningStatus: d.data().returningStatus,
    hasRecordToday: records[i].exists,
  }));
}

/**
 * The writes of one employee: statuses + tally, and the new record. They are one UNIT: they must land in the same
 * batch. The record is created with create(), so if someone else made it in the meantime the whole batch fails
 * instead of counting the day twice.
 */
export function seedUnit(plan: EmployeePlan, day: string): Op[] {
  const empRef = adminDb.collection('employees').doc(plan.id);
  return [
    (b) =>
      b.update(empRef, {
        goingStatus: plan.going,
        returningStatus: plan.returning,
        ...(plan.goingTally ? { goingInCount: FieldValue.increment(plan.goingTally) } : {}),
        ...(plan.returningTally ? { returningInCount: FieldValue.increment(plan.returningTally) } : {}),
        updatedAt: FieldValue.serverTimestamp(),
      }),
    (b) =>
      b.create(attendanceRef(plan.id, day), {
        date: day,
        goingStatus: plan.going,
        returningStatus: plan.returning,
        updatedAt: FieldValue.serverTimestamp(),
      }),
  ];
}

/** Commits units in batches of at most 400 operations, never splitting a unit across two batches. */
export async function commitUnits(units: Op[][]): Promise<void> {
  let batch = adminDb.batch();
  let size = 0;
  for (const unit of units) {
    if (size + unit.length > 400) {
      await batch.commit();
      batch = adminDb.batch();
      size = 0;
    }
    unit.forEach((op) => op(batch));
    size += unit.length;
  }
  if (size > 0) await batch.commit();
}
