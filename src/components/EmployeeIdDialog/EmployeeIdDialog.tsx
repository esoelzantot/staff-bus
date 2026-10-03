import { useEffect, useState, type FormEvent } from 'react';
import { loginWithId } from '../../services/authService';
import { AppError, toAppError } from '../../utils/errors';
import { ErrorBanner } from '../common/ErrorBanner';

export function EmployeeIdDialog({ initialError }: { initialError?: string | null }) {
  const [employeeId, setEmployeeId] = useState('');
  const [pin, setPin] = useState('');
  /** Managers / admins are asked for a PIN after the server says so (employees never see this field). */
  const [needsPin, setNeedsPin] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(initialError ?? null);

  // A message that arrives after the dialog is already on screen (e.g. "account not activated").
  useEffect(() => {
    if (initialError) setError(initialError);
  }, [initialError]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await loginWithId(employeeId, needsPin ? pin : undefined); // AuthContext picks the session up
    } catch (err) {
      if (err instanceof AppError && err.code === 'pin-required') {
        setNeedsPin(true);
        setError(null);
      } else {
        // Wrong ID / wrong PIN / locked: show why, and never keep a rejected PIN in the field.
        setError(toAppError(err).message);
        setPin('');
      }
      setBusy(false);
    }
  }

  function changeId(value: string) {
    setEmployeeId(value);
    if (needsPin) {
      setNeedsPin(false);
      setPin('');
    }
  }

  return (
    <div className="dialog-backdrop">
      <form className="dialog" role="dialog" aria-modal="true" aria-labelledby="dlg-title" onSubmit={submit}>
        <h1 id="dlg-title">أهلاً بك</h1>
        <p className="dialog__hint">
          {needsPin ? 'هذا حساب إدارة. أدخل الرقم السري للمتابعة.' : 'أدخل رقم الموظف لعرض سجلك في الأتوبيس.'}
        </p>

        <label className="field">
          <span>رقم الموظف</span>
          <input
            dir="ltr"
            value={employeeId}
            onChange={(e) => changeId(e.target.value)}
            placeholder="EMP1025"
            autoComplete="username"
            autoCapitalize="characters"
            autoCorrect="off"
            spellCheck={false}
            autoFocus
            required
          />
        </label>

        {needsPin && (
          <label className="field">
            <span>الرقم السري</span>
            <input
              dir="ltr"
              type="password"
              value={pin}
              onChange={(e) => setPin(e.target.value)}
              autoComplete="current-password"
              autoCapitalize="off"
              autoCorrect="off"
              spellCheck={false}
              autoFocus
              required
            />
          </label>
        )}

        <ErrorBanner message={error} />

        <button type="submit" className="btn btn--primary btn--xl" disabled={busy}>
          {busy ? 'جارٍ التحقق…' : 'متابعة'}
        </button>
      </form>
    </div>
  );
}
