export const COLLECTIONS = {
  users: 'users',
  employees: 'employees',
  buses: 'buses',
  busTrips: 'busTrips',
  busLocations: 'busLocations',
} as const;

/** Synthetic e-mail domain that maps an Employee ID to a Firebase Auth account. */
export const EMPLOYEE_EMAIL_DOMAIN =
  import.meta.env.VITE_EMPLOYEE_EMAIL_DOMAIN || 'employees.busapp.local';

/** Part of the derived Firebase Auth password. Must match the provisioning scripts. */
export const EMPLOYEE_AUTH_SUFFIX = import.meta.env.VITE_AUTH_SUFFIX || 'staff-bus-access';

export const COMPANY_NAME = import.meta.env.VITE_COMPANY_NAME || 'Employee Bus Service';

export const EMPLOYEE_ID_PATTERN = /^[A-Z0-9_-]{3,32}$/;
