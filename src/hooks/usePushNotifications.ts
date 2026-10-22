import { useCallback, useEffect, useState } from 'react';
import { disablePush, enablePush, getPushState, syncPush, type PushOwner, type PushState } from '../services/pushService';
import { toAppError } from '../utils/errors';

/** State + actions of the daily reminders on THIS device for the signed-in employee. */
export function usePushNotifications(owner: PushOwner | null) {
  const [state, setState] = useState<PushState | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const uid = owner?.uid;
  const employeeId = owner?.employeeId;

  useEffect(() => {
    let alive = true;
    void getPushState().then((s) => {
      if (alive) setState(s);
    });
    // keep the stored subscription current (renewed by the browser, or another employee signed in here before)
    if (uid && employeeId) void syncPush({ uid, employeeId });
    return () => {
      alive = false;
    };
  }, [uid, employeeId]);

  const run = useCallback(async (action: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await action();
    } catch (err) {
      setError(toAppError(err).message);
    } finally {
      setState(await getPushState());
      setBusy(false);
    }
  }, []);

  const enable = useCallback(
    () => (uid && employeeId ? run(() => enablePush({ uid, employeeId })) : Promise.resolve()),
    [run, uid, employeeId],
  );
  const disable = useCallback(() => run(disablePush), [run]);

  return { state, busy, error, enable, disable, clearError: () => setError(null) };
}
