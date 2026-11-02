type Status = 'in' | 'out';

/** IN days per direction. */
export interface InDays {
  going: number;
  returning: number;
}

export interface EmployeeState {
  id: string;
  type: 'main' | 'waiting';
  goingStatus: Status;
  returningStatus: Status;
  /** Today's IN record (employees/{id}/attendance/{today}) already exists – the person pressed IN / OUT today. */
  hasRecordToday: boolean;
  /** IN days of the CURRENT month BEFORE today, counted from the daily records (attendance). */
  earlierThisMonth: InDays;
  /** The stored counters (only for reporting the change). */
  goingInCount?: number;
  returningInCount?: number;
}

/** What the reset does for one employee. */
export interface EmployeePlan {
  id: string;
  /** Statuses the employee has after the reset. */
  going: Status;
  returning: Status;
  /**
   * The counters after the reset: IN days of the CURRENT month (yyyy-mm in `countMonth`), today included.
   * Recomputed from the daily records every night, so they always match the monthly PDF and start again at 0
   * on the first of every month.
   */
  goingInCount: number;
  returningInCount: number;
  /** Change of the counters (reporting / tests). */
  goingTally: number;
  returningTally: number;
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
 * Daily start of a bus – the rule, without exceptions:
 *   every MAIN employee    → IN for Going and Returning
 *   every WAITING employee → OUT for Going and Returning
 * whatever anyone chose since midnight. The counters become this month's IN days: the days before today (from the
 * records) + today with the start status. Refused only when the main employees alone do not fit the bus.
 */
export function planBusReset(capacity: number, employees: EmployeeState[]): BusResetPlan {
  const plans: EmployeePlan[] = employees.map((e) => {
    const start = startStatus(e.type);
    const goingInCount = e.earlierThisMonth.going + isIn(start);
    const returningInCount = e.earlierThisMonth.returning + isIn(start);
    return {
      id: e.id,
      going: start,
      returning: start,
      goingInCount,
      returningInCount,
      goingTally: goingInCount - (e.goingInCount ?? 0),
      returningTally: returningInCount - (e.returningInCount ?? 0),
      record: e.hasRecordToday ? 'update' : 'create',
      overridden: e.hasRecordToday && (e.goingStatus !== start || e.returningStatus !== start),
    };
  });

  const mains = plans.filter((p) => p.going === 'in').length;
  if (mains > capacity) {
    return { error: `عدد الموظفين الأساسيين (${mains}) أكبر من سعة الباص (${capacity}).` };
  }
  return { employees: plans, goingCount: mains, returningCount: mains };
}

/**
 * Counters for today WITHOUT changing anyone's statuses (npm run recount-month, attendance-start): this month's IN
 * days = the days before today (records) + today with the CURRENT statuses. `record: 'create'` only for employees
 * without today's record (the others keep theirs).
 */
export function planRecount(employees: EmployeeState[]): EmployeePlan[] {
  return employees.map((e) => {
    const goingInCount = e.earlierThisMonth.going + isIn(e.goingStatus);
    const returningInCount = e.earlierThisMonth.returning + isIn(e.returningStatus);
    return {
      id: e.id,
      going: e.goingStatus,
      returning: e.returningStatus,
      goingInCount,
      returningInCount,
      goingTally: goingInCount - (e.goingInCount ?? 0),
      returningTally: returningInCount - (e.returningInCount ?? 0),
      record: e.hasRecordToday ? 'update' : 'create',
      overridden: false,
    };
  });
}
