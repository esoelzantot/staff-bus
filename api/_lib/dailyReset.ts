type Status = 'in' | 'out';

export interface EmployeeState {
  id: string;
  type: 'main' | 'waiting';
  goingStatus: Status;
  returningStatus: Status;
  /** Today's IN record (employees/{id}/attendance/{today}) already exists – the person pressed IN / OUT today. */
  hasRecordToday: boolean;
  /** Current IN tallies (number of IN days per direction). */
  goingInCount?: number;
  returningInCount?: number;
}

/** What the reset does for one employee. */
export interface EmployeePlan {
  id: string;
  /** Statuses the employee has after the reset. */
  going: Status;
  returning: Status;
  /** Days added to goingInCount / returningInCount (+1, 0 or -1 – see tallyDelta). */
  goingTally: number;
  returningTally: number;
  /** The tallies after the reset (never below zero). */
  goingInCount: number;
  returningInCount: number;
  /** Today's record: 'create' = there is none yet, 'update' = the person already pressed IN / OUT today. */
  record: 'create' | 'update';
  /** The person had chosen something else today (after midnight) – the reset put them back to the start. */
  overridden: boolean;
}

export type BusResetPlan =
  | { error: string }
  | {
      employees: EmployeePlan[];
      /** Both bus counters after the reset = number of MAIN employees (everyone IN). */
      goingCount: number;
      returningCount: number;
    };

/** Start-of-day status: MAIN employees IN, WAITING employees OUT – for Going AND Returning. */
export const startStatus = (type: EmployeeState['type']): Status => (type === 'main' ? 'in' : 'out');

const isIn = (s: Status) => (s === 'in' ? 1 : 0);

/**
 * How many IN days a direction gains with the reset.
 *  - No record today: today has not been counted yet → +1 when the day starts IN.
 *  - A record today: the person pressed IN / OUT after midnight, and every press already moved the tally
 *    (OUT → IN +1, IN → OUT -1), so today is counted exactly when the CURRENT status is IN. The reset only
 *    applies the difference: IN → OUT -1, OUT → IN +1, unchanged 0. A day is never counted twice or lost.
 */
const tallyDelta = (current: Status, start: Status, hasRecordToday: boolean) =>
  hasRecordToday ? isIn(start) - isIn(current) : isIn(start);

/**
 * Daily start of a bus – the rule, without exceptions:
 *   every MAIN employee    → IN for Going and Returning
 *   every WAITING employee → OUT for Going and Returning
 * whatever anyone chose since midnight; the IN tallies and today's record follow (see tallyDelta).
 * Refused only when the main employees alone do not fit the bus (a roster problem to fix first).
 */
export function planBusReset(capacity: number, employees: EmployeeState[]): BusResetPlan {
  const plans: EmployeePlan[] = employees.map((e) => {
    const start = startStatus(e.type);
    const goingTally = tallyDelta(e.goingStatus, start, e.hasRecordToday);
    const returningTally = tallyDelta(e.returningStatus, start, e.hasRecordToday);
    return {
      id: e.id,
      going: start,
      returning: start,
      goingTally,
      returningTally,
      goingInCount: Math.max(0, (e.goingInCount ?? 0) + goingTally),
      returningInCount: Math.max(0, (e.returningInCount ?? 0) + returningTally),
      record: e.hasRecordToday ? 'update' : 'create',
      overridden: e.hasRecordToday && (e.goingStatus !== start || e.returningStatus !== start),
    };
  });

  const mains = plans.filter((p) => p.going === 'in').length;
  if (mains > capacity) {
    return { error: `عدد الموظفين الأساسيين (${mains}) أكبر من سعة الأتوبيس (${capacity}).` };
  }
  return { employees: plans, goingCount: mains, returningCount: mains };
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
      going: e.goingStatus,
      returning: e.returningStatus,
      goingTally: isIn(e.goingStatus),
      returningTally: isIn(e.returningStatus),
      goingInCount: (e.goingInCount ?? 0) + isIn(e.goingStatus),
      returningInCount: (e.returningInCount ?? 0) + isIn(e.returningStatus),
      record: 'create',
      overridden: false,
    }));
}
