type Status = 'in' | 'out';

export interface EmployeeState {
  id: string;
  type: 'main' | 'waiting';
  goingStatus: Status;
  returningStatus: Status;
  /** Today's IN record (employees/{id}/attendance/{today}) already exists. */
  hasRecordToday: boolean;
  /** When the employee's statuses last changed (ms) – decides who gives a seat back first (see planBusReset). */
  changedAt?: number;
}

/** What the reset does for one employee. */
export interface EmployeePlan {
  id: string;
  /**
   * true  = the employee has no record for today yet: write the start-of-day statuses, create today's record
   *         and add today to the IN tallies;
   * false = a record exists (the employee already acted since midnight, or an earlier run did this):
   *         leave everything untouched, so a re-run can never count a day twice.
   */
  seed: boolean;
  /**
   * true = a WAITING employee who took a seat after midnight, before the reset ran, while the main employees
   *        (who start the day IN) need it: set back to OUT for that direction, the day taken back from the tally
   *        (goingTally / returningTally = -1) and today's record updated.
   */
  bumped?: boolean;
  /** Statuses the employee has after the reset. */
  going: Status;
  returning: Status;
  /** Days to add to goingInCount / returningInCount (1 when the day starts IN, -1 when bumped). */
  goingTally: number;
  returningTally: number;
}

export type BusResetPlan =
  | { error: string }
  | {
      employees: EmployeePlan[];
      /** Both bus counters after the reset = number of employees that are IN. */
      goingCount: number;
      returningCount: number;
    };

/** Start-of-day status: MAIN employees IN, WAITING employees OUT. */
export const startStatus = (type: EmployeeState['type']): Status => (type === 'main' ? 'in' : 'out');

/**
 * Daily start of a bus: every MAIN employee IN (going + returning), every WAITING employee OUT – and one
 * IN-record per person for the new day. Waiting employees must go back to OUT too, otherwise
 * "main back IN" + "waiting still IN" could exceed the capacity.
 * Employees that already have today's record are skipped (see EmployeePlan.seed).
 */
export function planBusReset(capacity: number, employees: EmployeeState[]): BusResetPlan {
  const plans: EmployeePlan[] = employees.map((e) => {
    if (e.hasRecordToday) {
      return {
        id: e.id,
        seed: false,
        going: e.goingStatus,
        returning: e.returningStatus,
        goingTally: 0,
        returningTally: 0,
      };
    }
    const start = startStatus(e.type);
    const tally = start === 'in' ? 1 : 0;
    return { id: e.id, seed: true, going: start, returning: start, goingTally: tally, returningTally: tally };
  });

  // Main employees have priority at the start of the day. A waiting employee may already have taken a seat
  // after midnight (GitHub starts the reset late) – if the bus would be over capacity, those seats are given back,
  // the most recent first. Main employees' own choices since midnight are never changed.
  const byId = new Map(employees.map((e) => [e.id, e]));
  for (const [dir, tally] of [
    ['going', 'goingTally'],
    ['returning', 'returningTally'],
  ] as const) {
    let count = plans.filter((p) => p[dir] === 'in').length;
    const giveBack = plans
      .filter((p) => !p.seed && p[dir] === 'in' && byId.get(p.id)?.type === 'waiting')
      .sort((a, b) => (byId.get(b.id)?.changedAt ?? 0) - (byId.get(a.id)?.changedAt ?? 0));
    for (const p of giveBack) {
      if (count <= capacity) break;
      p[dir] = 'out';
      p[tally] = -1;
      p.bumped = true;
      count--;
    }
  }

  const goingCount = plans.filter((p) => p.going === 'in').length;
  const returningCount = plans.filter((p) => p.returning === 'in').length;
  if (goingCount > capacity || returningCount > capacity) {
    return { error: `عدد الموظفين IN (${Math.max(goingCount, returningCount)}) أكبر من سعة الأتوبيس (${capacity}).` };
  }
  return { employees: plans, goingCount, returningCount };
}

/**
 * One-time start of the daily record on an existing system (npm run attendance-start): today's record is
 * created from the statuses people have RIGHT NOW, and every direction that is IN counts as today's day.
 */
export function planSnapshot(employees: EmployeeState[]): EmployeePlan[] {
  return employees
    .filter((e) => !e.hasRecordToday)
    .map((e) => ({
      id: e.id,
      seed: true,
      going: e.goingStatus,
      returning: e.returningStatus,
      goingTally: e.goingStatus === 'in' ? 1 : 0,
      returningTally: e.returningStatus === 'in' ? 1 : 0,
    }));
}
