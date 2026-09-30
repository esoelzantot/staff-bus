import type { Employee, StatusField } from '../types';

/** Everyone who is "in" for the given direction – main employees first, then waiting (name order kept). */
export function passengersFor(employees: Employee[], field: StatusField): Employee[] {
  return employees
    .filter((e) => e[field] === 'in')
    .sort((a, b) => (a.type === b.type ? 0 : a.type === 'main' ? -1 : 1));
}
