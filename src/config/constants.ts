export const COLLECTIONS = {
  users: 'users',
  employees: 'employees',
  buses: 'buses',
  busTrips: 'busTrips',
  busLocations: 'busLocations',
  /** Sub-collection of employees/{id}: the daily IN record. */
  attendance: 'attendance',
} as const;

export const COMPANY_NAME = import.meta.env.VITE_COMPANY_NAME || 'Employee Bus Service';

export const EMPLOYEE_ID_PATTERN = /^[A-Z0-9_-]{3,32}$/;
