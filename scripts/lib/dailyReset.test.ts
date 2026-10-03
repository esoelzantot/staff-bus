import { describe, expect, it } from 'vitest';
import { planBusReset, type EmployeeState } from './dailyReset';

const e = (id: string, type: EmployeeState['type'], going: 'in' | 'out', returning: 'in' | 'out'): EmployeeState => ({
  id,
  type,
  goingStatus: going,
  returningStatus: returning,
});

describe('planBusReset', () => {
  it('puts main employees IN and waiting employees OUT, touching only those that differ', () => {
    const plan = planBusReset(13, [
      e('m1', 'main', 'out', 'in'),
      e('m2', 'main', 'in', 'in'),
      e('w1', 'waiting', 'in', 'out'),
      e('w2', 'waiting', 'out', 'out'),
    ]);
    expect(plan).toEqual({
      updates: [
        { id: 'm1', status: 'in' },
        { id: 'w1', status: 'out' },
      ],
      count: 2,
    });
  });

  it('refuses a roster whose main employees do not fit the bus', () => {
    const plan = planBusReset(2, [e('a', 'main', 'in', 'in'), e('b', 'main', 'in', 'in'), e('c', 'main', 'in', 'in')]);
    expect('error' in plan).toBe(true);
  });

  it('is a no-op when the day already starts clean', () => {
    expect(planBusReset(13, [e('m1', 'main', 'in', 'in'), e('w1', 'waiting', 'out', 'out')])).toEqual({
      updates: [],
      count: 1,
    });
  });
});
