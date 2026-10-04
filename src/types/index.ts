import type { Timestamp } from 'firebase/firestore';

export type Role = 'employee' | 'manager' | 'admin';
export type TripType = 'going' | 'returning';
export type EmployeeType = 'main' | 'waiting';
export type EmployeeStatus = 'in' | 'out';
export type TripStatus = 'active' | 'arrived' | 'closed';
export type StatusField = 'goingStatus' | 'returningStatus';

/** users/{firebaseAuthUid} */
export interface User {
  uid: string;
  role: Role;
  /** Set for role "employee"; equals the employees/{id} document id. */
  employeeId: string | null;
}

/** employees/{employeeId} – the document id IS the (upper-case) Employee ID, so it is unique by construction. */
export interface Employee {
  id: string;
  employeeId: string;
  name: string;
  type: EmployeeType;
  busId: string;
  goingStatus: EmployeeStatus;
  returningStatus: EmployeeStatus;
  /**
   * How many DAYS the employee was IN for Going / Returning (lifetime tally). A day counts once, however many
   * times the status was toggled; main employees start every day IN, so they count from midnight.
   */
  goingInCount: number;
  returningInCount: number;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

/**
 * employees/{employeeId}/attendance/{yyyy-mm-dd} – the daily IN record: one document per person per Cairo day,
 * holding the statuses the person ended (or is in) that day with.
 */
export interface AttendanceDay {
  /** yyyy-mm-dd – also the document id. */
  id: string;
  date: string;
  goingStatus: EmployeeStatus;
  returningStatus: EmployeeStatus;
  updatedAt: Timestamp;
}

/** buses/{busId} */
export interface Bus {
  id: string;
  route: string;
  busNumber: string;
  capacity: number;
  activeTripType: TripType;
  /** Number of employees whose goingStatus is "in" (kept atomically in sync). */
  goingCount: number;
  /** Number of employees whose returningStatus is "in". */
  returningCount: number;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

/** busLocations/{busId} – live position of the bus, shared by one employee at a time. */
export interface BusLocation {
  id: string;
  /** false once the sharer stopped (or the bus arrived). */
  active: boolean;
  lat: number;
  lng: number;
  accuracy: number | null;
  speed: number | null;
  heading: number | null;
  sharedById: string;
  sharedByName: string;
  startedAt: Timestamp;
  updatedAt: Timestamp;
}

/** busTrips/{busId}_{yyyy-mm-dd}_{tripType} */
export interface BusTrip {
  id: string;
  busId: string;
  route: string;
  busNumber: string;
  tripType: TripType;
  capacity: number;
  /** Local calendar day, yyyy-mm-dd. */
  date: string;
  arrivalTime: Timestamp | null;
  /** Set when an employee (not a manager) recorded the arrival. */
  arrivedById?: string | null;
  arrivedByName?: string | null;
  status: TripStatus;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}
