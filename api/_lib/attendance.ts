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

/** "2026-11-02" → "2026-11". */
export const monthOfDay = (day: string) => day.slice(0, 7);

/**
 * Employees with what the reset needs, read in one go (inside `tx` when given, so nobody can change a status between
 * this read and the writes): whether today's record exists, and this month's IN days BEFORE today, counted from the
 * daily records – the same source as the monthly PDF.
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
  const firstOfMonth = `${monthOfDay(day)}-01`;
  const earlier = await Promise.all(
    docs.map(async (d) => {
      const q = d.ref.collection('attendance').where('date', '>=', firstOfMonth).where('date', '<', day);
      const snap = tx ? await tx.get(q) : await q.get();
      return {
        going: snap.docs.filter((r) => r.get('goingStatus') === 'in').length,
        returning: snap.docs.filter((r) => r.get('returningStatus') === 'in').length,
      };
    }),
  );
  return docs.map((d, i) => ({
    id: d.id,
    type: d.data().type,
    goingStatus: d.data().goingStatus,
    returningStatus: d.data().returningStatus,
    hasRecordToday: records[i].exists,
    earlierThisMonth: earlier[i],
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
        // the counters are this month's IN days (see EmployeePlan)
        countMonth: monthOfDay(day),
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
