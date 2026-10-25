import type { Employee, StatusField } from '../types';
import { sortWaiting } from './waitingQueue';

/** Everyone who is "in" for the given direction – main employees first (order kept), then waiting in line order. */
export function passengersFor(employees: Employee[], field: StatusField): Employee[] {
  const inNow = employees.filter((e) => e[field] === 'in');
  return [...inNow.filter((e) => e.type === 'main'), ...sortWaiting(inNow.filter((e) => e.type === 'waiting'))];
}
