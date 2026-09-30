import { useCallback, useRef, useState } from 'react';
import { setEmployeeStatus } from '../services/employeeService';
import type { EmployeeStatus, StatusField } from '../types';
import { toAppError } from '../utils/errors';

/** Tracks which (employee, field) saves are in flight and the last error. */
export function useStatusUpdater() {
  const [pending, setPending] = useState<Record<string, EmployeeStatus>>({});
  const [error, setError] = useState<string | null>(null);
  const inFlight = useRef(new Set<string>());

  const update = useCallback(async (employeeId: string, field: StatusField, value: EmployeeStatus) => {
    const key = `${employeeId}:${field}`;
    if (inFlight.current.has(key)) return;
    inFlight.current.add(key);
    setError(null);
    setPending((p) => ({ ...p, [key]: value }));
    try {
      await setEmployeeStatus(employeeId, field, value);
    } catch (err) {
      setError(toAppError(err).message);
    } finally {
      inFlight.current.delete(key);
      setPending((p) => {
        const { [key]: _removed, ...rest } = p;
        return rest;
      });
    }
  }, []);

  /** The value being saved for this field, or null when idle. */
  const pendingValue = useCallback(
    (employeeId: string, field: StatusField): EmployeeStatus | null => pending[`${employeeId}:${field}`] ?? null,
    [pending],
  );

  return { update, pendingValue, error, clearError: () => setError(null) };
}
