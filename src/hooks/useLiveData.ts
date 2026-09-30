import { useEffect, useState } from 'react';
import type { Unsubscribe } from '../services/employeeService';
import { toAppError } from '../utils/errors';

export type Subscribe<T> = (onData: (value: T) => void, onError: (error: unknown) => void) => Unsubscribe;

export interface LiveState<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
}

/** Subscribes to a realtime source. Pass `null` to stay idle (e.g. while an id is unknown). */
export function useLiveData<T>(subscribe: Subscribe<T> | null, deps: readonly unknown[]): LiveState<T> {
  const [state, setState] = useState<LiveState<T>>({ data: null, loading: subscribe !== null, error: null });

  useEffect(() => {
    if (!subscribe) {
      setState({ data: null, loading: false, error: null });
      return;
    }
    setState((prev) => ({ ...prev, loading: true, error: null }));
    return subscribe(
      (data) => setState({ data, loading: false, error: null }),
      (err) => setState({ data: null, loading: false, error: toAppError(err).message }),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return state;
}
