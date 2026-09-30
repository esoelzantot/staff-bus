export interface EmployeeState {
  id: string;
  type: 'main' | 'waiting';
  goingStatus: 'in' | 'out';
  returningStatus: 'in' | 'out';
}

export type BusResetPlan =
  | { error: string }
  | {
      /** Employees whose statuses must change, with the status they get. */
      updates: { id: string; status: 'in' | 'out' }[];
      /** Both bus counters after the reset (= number of main employees). */
      count: number;
    };

/**
 * Daily start state of a bus: every MAIN employee IN (going + returning), every WAITING employee OUT.
 * Waiting employees must go back to OUT too, otherwise "main back IN" + "waiting still IN" could exceed the capacity.
 */
export function planBusReset(capacity: number, employees: EmployeeState[]): BusResetPlan {
  const count = employees.filter((e) => e.type === 'main').length;
  if (count > capacity) return { error: `عدد الأساسي (${count}) أكبر من سعة الأتوبيس (${capacity}).` };

  const updates = employees
    .map((e) => ({ id: e.id, status: (e.type === 'main' ? 'in' : 'out') as 'in' | 'out', e }))
    .filter(({ status, e }) => e.goingStatus !== status || e.returningStatus !== status)
    .map(({ id, status }) => ({ id, status }));
  return { updates, count };
}
