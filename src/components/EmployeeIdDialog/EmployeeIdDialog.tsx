import { useState, type FormEvent } from 'react';
import { loginWithId } from '../../services/authService';
import { toAppError } from '../../utils/errors';
import { ErrorBanner } from '../common/ErrorBanner';

export function EmployeeIdDialog({ initialError }: { initialError?: string | null }) {
  const [employeeId, setEmployeeId] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(initialError ?? null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await loginWithId(employeeId); // AuthContext picks the session up
    } catch (err) {
      setError(toAppError(err).message);
      setBusy(false);
    }
  }

  return (
    <div className="dialog-backdrop">
      <form className="dialog" role="dialog" aria-modal="true" aria-labelledby="dlg-title" onSubmit={submit}>
        <h1 id="dlg-title">أهلاً بك</h1>
        <p className="dialog__hint">أدخل رقم الموظف لعرض سجلك في الأتوبيس.</p>

        <label className="field">
          <span>رقم الموظف</span>
          <input
            dir="ltr"
            value={employeeId}
            onChange={(e) => setEmployeeId(e.target.value)}
            placeholder="EMP1025"
            autoComplete="username"
            autoCapitalize="characters"
            autoCorrect="off"
            spellCheck={false}
            autoFocus
            required
          />
        </label>

        <ErrorBanner message={error} />

        <button type="submit" className="btn btn--primary btn--xl" disabled={busy}>
          {busy ? 'جارٍ التحقق…' : 'متابعة'}
        </button>
      </form>
    </div>
  );
}
