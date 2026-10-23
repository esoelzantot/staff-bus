import { useCallback, useEffect, useState } from 'react';
import { disablePush, enablePush, getPushState, type PushOwner, type PushState } from '../services/pushService';
import { toAppError } from '../utils/errors';

/**
 * State + actions of the daily reminders on THIS device for the signed-in employee. Opening the screen re-saves an
 * existing subscription for this employee (see getPushState), so a choice made once stays on.
 */
export function usePushNotifications(owner: PushOwner | null) {
  const [state, setState] = useState<PushState | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const uid = owner?.uid;
  const employeeId = owner?.employeeId;

  const refresh = useCallback(
    () => getPushState(uid && employeeId ? { uid, employeeId } : undefined),
    [uid, employeeId],
  );

  useEffect(() => {
    let alive = true;
    void refresh().then((s) => {
      if (alive) setState(s);
    });
    return () => {
      alive = false;
    };
  }, [refresh]);

  const run = useCallback(
    async (action: () => Promise<void>) => {
      setBusy(true);
      setError(null);
      try {
        await action();
      } catch (err) {
        setError(toAppError(err).message);
      } finally {
        setState(await refresh());
        setBusy(false);
      }
    },
    [refresh],
  );

  const enable = useCallback(
    () => (uid && employeeId ? run(() => enablePush({ uid, employeeId })) : Promise.resolve()),
    [run, uid, employeeId],
  );
  const disable = useCallback(() => run(disablePush), [run]);

  return { state, busy, error, enable, disable, clearError: () => setError(null) };
}
