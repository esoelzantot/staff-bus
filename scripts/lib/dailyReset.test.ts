import { describe, expect, it } from 'vitest';
import { planBusReset, planSnapshot, type EmployeeState } from './dailyReset';

const e = (
  id: string,
  type: EmployeeState['type'],
  going: 'in' | 'out',
  returning: 'in' | 'out',
  hasRecordToday = false,
): EmployeeState => ({ id, type, goingStatus: going, returningStatus: returning, hasRecordToday });

describe('planBusReset', () => {
  it('starts main employees IN (and counts the day), waiting employees OUT (no day)', () => {
    const plan = planBusReset(13, [e('m1', 'main', 'out', 'in'), e('w1', 'waiting', 'in', 'out')]);
    expect(plan).toEqual({
      employees: [
        { id: 'm1', seed: true, going: 'in', returning: 'in', goingTally: 1, returningTally: 1 },
        { id: 'w1', seed: true, going: 'out', returning: 'out', goingTally: 0, returningTally: 0 },
      ],
      goingCount: 1,
      returningCount: 1,
    });
  });

  it('every employee gets a record for the new day, even when nothing changed', () => {
    const plan = planBusReset(13, [e('m1', 'main', 'in', 'in'), e('w1', 'waiting', 'out', 'out')]);
    if ('error' in plan) throw new Error(plan.error);
    expect(plan.employees.every((p) => p.seed)).toBe(true);
  });

  it("never counts a day twice: an employee with today's record is left untouched", () => {
    const plan = planBusReset(13, [e('m1', 'main', 'out', 'in', true), e('m2', 'main', 'in', 'in')]);
    if ('error' in plan) throw new Error(plan.error);
    expect(plan.employees[0]).toEqual({
      id: 'm1',
      seed: false,
      going: 'out',
      returning: 'in',
      goingTally: 0,
      returningTally: 0,
    });
    // the bus counters follow the real statuses (m1 is OUT for going, so only m2 counts)
    expect(plan.goingCount).toBe(1);
    expect(plan.returningCount).toBe(2);
  });

  it('refuses a roster that does not fit the bus', () => {
    const plan = planBusReset(2, [e('a', 'main', 'in', 'in'), e('b', 'main', 'in', 'in'), e('c', 'main', 'in', 'in')]);
    expect('error' in plan).toBe(true);
  });
});

describe('planSnapshot (one-time start on a running system)', () => {
  it('records today from the CURRENT statuses and counts the directions that are IN', () => {
    expect(planSnapshot([e('a', 'main', 'in', 'out'), e('b', 'waiting', 'out', 'in')])).toEqual([
      { id: 'a', seed: true, going: 'in', returning: 'out', goingTally: 1, returningTally: 0 },
      { id: 'b', seed: true, going: 'out', returning: 'in', goingTally: 0, returningTally: 1 },
    ]);
  });

  it("skips employees that already have today's record (safe to run twice)", () => {
    expect(planSnapshot([e('a', 'main', 'in', 'in', true)])).toEqual([]);
  });
});
