import { useEffect, useState } from 'react';
import {
  ensureTrip,
  makeTripId,
  subscribeBus,
  subscribeBuses,
  subscribeTrip,
} from '../services/busTripService';
import { subscribeBusLocation } from '../services/busLocationService';
import { subscribeBusEmployees, subscribeEmployee } from '../services/employeeService';
import type { Bus, BusLocation, BusTrip, Employee } from '../types';
import { todayKey } from '../utils/date/format';
import { toAppError } from '../utils/errors';
import { useLiveData } from './useLiveData';

export const useEmployeeRecord = (employeeId: string | null) =>
  useLiveData<Employee | null>(
    employeeId ? (ok, err) => subscribeEmployee(employeeId, ok, err) : null,
    [employeeId],
  );

export const useBus = (busId: string | null) =>
  useLiveData<Bus | null>(busId ? (ok, err) => subscribeBus(busId, ok, err) : null, [busId]);

export const useBusLocation = (busId: string | null) =>
  useLiveData<BusLocation | null>(busId ? (ok, err) => subscribeBusLocation(busId, ok, err) : null, [busId]);

export const useBuses = () => useLiveData<Bus[]>((ok, err) => subscribeBuses(ok, err), []);

export const useBusEmployees = (busId: string | null) =>
  useLiveData<Employee[]>(busId ? (ok, err) => subscribeBusEmployees(busId, ok, err) : null, [busId]);

/** Current local day; updates itself when midnight passes so a new trip is opened. */
export function useToday(): string {
  const [day, setDay] = useState(todayKey());
  useEffect(() => {
    const timer = setInterval(() => setDay(todayKey()), 60_000);
    return () => clearInterval(timer);
  }, []);
  return day;
}

/** Makes sure today's trip for the bus' active direction exists, then streams it. */
export function useActiveTrip(bus: Bus | null) {
  const today = useToday();
  const tripType = bus?.activeTripType ?? null;
  const tripId = bus && tripType ? makeTripId(bus.id, today, tripType) : null;
  const [ensureError, setEnsureError] = useState<string | null>(null);

  useEffect(() => {
    setEnsureError(null);
    if (!bus || !tripType) return;
    ensureTrip(bus, tripType, today).catch((err) => setEnsureError(toAppError(err).message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bus?.id, tripType, today]);

  const live = useLiveData<BusTrip | null>(
    tripId ? (ok, err) => subscribeTrip(tripId, ok, err) : null,
    [tripId],
  );
  return { ...live, error: live.error ?? ensureError };
}

/**
 * Streams today's GOING trip of the bus (the only trip employees can record an arrival for) WITHOUT
 * creating it (employees are not allowed to create idle trips; managers use useActiveTrip).
 * `date` is the day the subscription is for – use it when writing so both always agree.
 */
export function useTodayGoingTrip(bus: Bus | null) {
  const date = useToday();
  const tripId = bus ? makeTripId(bus.id, date, 'going') : null;
  const live = useLiveData<BusTrip | null>(tripId ? (ok, err) => subscribeTrip(tripId, ok, err) : null, [tripId]);
  return { ...live, date };
}

export function useOnlineStatus(): boolean {
  const [online, setOnline] = useState(typeof navigator === 'undefined' ? true : navigator.onLine);
  useEffect(() => {
    const up = () => setOnline(true);
    const down = () => setOnline(false);
    window.addEventListener('online', up);
    window.addEventListener('offline', down);
    return () => {
      window.removeEventListener('online', up);
      window.removeEventListener('offline', down);
    };
  }, []);
  return online;
}
