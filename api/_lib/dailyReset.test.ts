import { describe, expect, it } from 'vitest';
import { planBusReset, planSnapshot, type EmployeeState } from './dailyReset.js';

const e = (
  id: string,
  type: EmployeeState['type'],
  going: 'in' | 'out',
  returning: 'in' | 'out',
  hasRecordToday = false,
  tally = 5,
): EmployeeState => ({
  id,
  type,
  goingStatus: going,
  returningStatus: returning,
  hasRecordToday,
  goingInCount: tally,
  returningInCount: tally,
});

const plan = (capacity: number, employees: EmployeeState[]) => {
  const p = planBusReset(capacity, employees);
  if ('error' in p) throw new Error(p.error);
  return p;
};
const of = (p: ReturnType<typeof plan>, id: string) => p.employees.find((x) => x.id === id)!;

describe('planBusReset – the rule: every main IN / IN, every waiting OUT / OUT', () => {
  it('whatever their statuses were yesterday', () => {
    const p = plan(14, [
      e('m1', 'main', 'out', 'out'),
      e('m2', 'main', 'in', 'out'),
      e('w1', 'waiting', 'in', 'in'),
      e('w2', 'waiting', 'out', 'in'),
    ]);
    for (const id of ['m1', 'm2']) expect(of(p, id)).toMatchObject({ going: 'in', returning: 'in' });
    for (const id of ['w1', 'w2']) expect(of(p, id)).toMatchObject({ going: 'out', returning: 'out' });
    expect(p).toMatchObject({ goingCount: 2, returningCount: 2 });
  });

  it('…and also for someone who already pressed IN / OUT after midnight (before the reset ran)', () => {
    const p = plan(14, [e('m1', 'main', 'out', 'out', true), e('w1', 'waiting', 'in', 'out', true)]);
    expect(of(p, 'm1')).toMatchObject({ going: 'in', returning: 'in', overridden: true, record: 'update' });
    expect(of(p, 'w1')).toMatchObject({ going: 'out', returning: 'out', overridden: true, record: 'update' });
  });

  it('every employee gets today\'s record (created, or updated when it exists)', () => {
    const p = plan(14, [e('m1', 'main', 'in', 'in'), e('w1', 'waiting', 'out', 'out', true)]);
    expect(of(p, 'm1').record).toBe('create');
    expect(of(p, 'w1').record).toBe('update');
  });
});

describe('planBusReset – IN days are counted exactly once', () => {
  it('no record yet today: +1 for main employees (Going + Returning), nothing for waiting', () => {
    const p = plan(14, [e('m1', 'main', 'out', 'out'), e('w1', 'waiting', 'in', 'in')]);
    expect(of(p, 'm1')).toMatchObject({ goingTally: 1, returningTally: 1, goingInCount: 6, returningInCount: 6 });
    expect(of(p, 'w1')).toMatchObject({ goingTally: 0, returningTally: 0, goingInCount: 5, returningInCount: 5 });
  });

  it('a waiting employee who pressed IN after midnight already got today counted → the reset takes it back', () => {
    // pressed Going IN at 00:20: tally 5 → 6; the reset puts them OUT → back to 5
    const p = plan(14, [e('w1', 'waiting', 'in', 'out', true, 6)]);
    expect(of(p, 'w1')).toMatchObject({ goingTally: -1, returningTally: 0, goingInCount: 5, returningInCount: 6 });
  });

  it('a main employee who pressed OUT after midnight lost today → the reset gives it back', () => {
    // pressed Going OUT at 00:20 (tally stays as before today); the reset puts them IN → +1
    const p = plan(14, [e('m1', 'main', 'out', 'in', true, 5)]);
    expect(of(p, 'm1')).toMatchObject({ goingTally: 1, returningTally: 0, goingInCount: 6, returningInCount: 5 });
  });

  it('a main employee already IN today (record exists) is not counted twice', () => {
    const p = plan(14, [e('m1', 'main', 'in', 'in', true, 6)]);
    expect(of(p, 'm1')).toMatchObject({ goingTally: 0, returningTally: 0, goingInCount: 6, overridden: false });
  });

  it('a tally never goes below zero (old data)', () => {
    const p = plan(14, [e('w1', 'waiting', 'in', 'in', true, 0)]);
    expect(of(p, 'w1')).toMatchObject({ goingInCount: 0, returningInCount: 0 });
  });
});

describe('planBusReset – capacity', () => {
  it('the bus counters are the number of main employees', () => {
    const p = plan(14, [e('m1', 'main', 'out', 'out'), e('m2', 'main', 'out', 'out'), e('w1', 'waiting', 'in', 'in')]);
    expect(p).toMatchObject({ goingCount: 2, returningCount: 2 });
  });

  it('refuses a roster whose main employees alone do not fit the bus', () => {
    const p = planBusReset(2, [e('a', 'main', 'in', 'in'), e('b', 'main', 'in', 'in'), e('c', 'main', 'in', 'in')]);
    expect('error' in p).toBe(true);
  });

  it('a full bus of main employees is fine', () => {
    expect(plan(2, [e('a', 'main', 'out', 'out'), e('b', 'main', 'out', 'out')])).toMatchObject({ goingCount: 2 });
  });
});

describe('planSnapshot (one-time start on a running system)', () => {
  it('records today from the CURRENT statuses and counts the directions that are IN', () => {
    const [a, b] = planSnapshot([e('a', 'main', 'in', 'out'), e('b', 'waiting', 'out', 'in')]);
    expect(a).toMatchObject({ going: 'in', returning: 'out', goingInCount: 6, returningInCount: 5, record: 'create' });
    expect(b).toMatchObject({ going: 'out', returning: 'in', goingInCount: 5, returningInCount: 6, record: 'create' });
  });

  it("skips employees that already have today's record (safe to run twice)", () => {
    expect(planSnapshot([e('a', 'main', 'in', 'in', true)])).toEqual([]);
  });
});
