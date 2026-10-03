import { describe, expect, it } from 'vitest';
import type { Employee } from '../types';
import { passengersFor } from './passengers';

const emp = (
  id: string,
  type: Employee['type'],
  going: Employee['goingStatus'],
  returning: Employee['returningStatus'],
) => ({ id, employeeId: id, name: id, type, goingStatus: going, returningStatus: returning }) as Employee;

describe('passengersFor', () => {
  const all = [
    emp('w1', 'waiting', 'in', 'out'),
    emp('m1', 'main', 'in', 'in'),
    emp('m2', 'main', 'out', 'in'),
    emp('w2', 'waiting', 'in', 'in'),
  ];

  it('keeps only the people who are IN for that direction', () => {
    expect(passengersFor(all, 'goingStatus').map((e) => e.id)).toEqual(['m1', 'w1', 'w2']);
    expect(passengersFor(all, 'returningStatus').map((e) => e.id)).toEqual(['m1', 'm2', 'w2']);
  });

  it('lists main employees first and keeps the incoming order inside each group', () => {
    const ids = passengersFor(all, 'goingStatus').map((e) => e.type);
    expect(ids).toEqual(['main', 'waiting', 'waiting']);
  });

  it('does not mutate its input', () => {
    const copy = [...all];
    passengersFor(all, 'goingStatus');
    expect(all).toEqual(copy);
  });
});
