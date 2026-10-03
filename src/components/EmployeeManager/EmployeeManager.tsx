import { useMemo, useState, type FormEvent } from 'react';
import { FiChevronDown, FiEdit2, FiPlus, FiTrash2 } from 'react-icons/fi';
import { EMPLOYEE_ID_PATTERN } from '../../config/constants';
import { useConfirm } from '../../hooks/useConfirm';
import { createEmployee, deleteEmployee, updateEmployee } from '../../services/employeeAdminService';
import type { Bus, Employee, EmployeeType } from '../../types';
import { toAppError } from '../../utils/errors';
import { ErrorBanner } from '../common/ErrorBanner';
import { Modal } from '../common/Modal';

interface Props {
  /** Employees of the selected bus (live). */
  employees: Employee[];
  bus: Bus;
  buses: Bus[];
}

type DialogState = { mode: 'add' } | { mode: 'edit'; employee: Employee } | null;

const TYPE_LABEL: Record<EmployeeType, string> = { main: 'أساسي', waiting: 'انتظار' };

/** Manager tools: add, edit and delete employees. The lists above update live, so nothing to refresh. */
export function EmployeeManager({ employees, bus, buses }: Props) {
  const [dialog, setDialog] = useState<DialogState>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { confirm, dialog: confirmDialog } = useConfirm();

  const sorted = useMemo(
    () => [...employees].sort((a, b) => a.type.localeCompare(b.type) || a.name.localeCompare(b.name, 'ar')),
    [employees],
  );

  async function remove(e: Employee) {
    const ok = await confirm({
      title: 'حذف موظف',
      message: `حذف الموظف "${e.name}" (${e.employeeId}) نهائياً؟\nسيُحذف حساب دخوله أيضاً ولا يمكن التراجع.`,
      confirmLabel: 'حذف نهائياً',
      cancelLabel: 'تراجع',
      destructive: true,
    });
    if (!ok) return;
    setBusyId(e.id);
    setError(null);
    try {
      await deleteEmployee(e.id);
    } catch (err) {
      setError(toAppError(err).message);
    } finally {
      setBusyId(null);
    }
  }

  return (
    <details className="section manage">
      <summary className="manage__summary">
        <h2>إدارة الموظفين</h2>
        <span className="count">{employees.length}</span>
        <FiChevronDown className="manage__chev" aria-hidden="true" />
      </summary>

      <div className="manage__body">
        <button type="button" className="btn btn--primary" onClick={() => setDialog({ mode: 'add' })}>
          <FiPlus aria-hidden="true" /> إضافة موظف
        </button>

        <ErrorBanner message={error} onDismiss={() => setError(null)} />

        {sorted.length === 0 ? (
          <p className="manage__empty">لا يوجد موظفون في هذا الأتوبيس.</p>
        ) : (
          <ul className="manageList">
            {sorted.map((e) => (
              <li key={e.id} className="manageRow">
                <div className="manageRow__who">
                  <strong>{e.name}</strong>
                  <span className="manageRow__id" dir="ltr">
                    {e.employeeId}
                  </span>
                </div>
                <span className={`manageRow__type manageRow__type--${e.type}`}>{TYPE_LABEL[e.type]}</span>
                <button
                  type="button"
                  className="iconBtn"
                  aria-label={`تعديل ${e.name}`}
                  title="تعديل"
                  disabled={busyId === e.id}
                  onClick={() => setDialog({ mode: 'edit', employee: e })}
                >
                  <FiEdit2 aria-hidden="true" />
                </button>
                <button
                  type="button"
                  className="iconBtn iconBtn--danger"
                  aria-label={`حذف ${e.name}`}
                  title="حذف"
                  disabled={busyId === e.id}
                  onClick={() => void remove(e)}
                >
                  {busyId === e.id ? <span className="spinner spinner--sm" aria-hidden="true" /> : <FiTrash2 aria-hidden="true" />}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {dialog && <EmployeeDialog state={dialog} bus={bus} buses={buses} onClose={() => setDialog(null)} />}
      {confirmDialog}
    </details>
  );
}

function EmployeeDialog({
  state,
  bus,
  buses,
  onClose,
}: {
  state: NonNullable<DialogState>;
  bus: Bus;
  buses: Bus[];
  onClose: () => void;
}) {
  const editing = state.mode === 'edit' ? state.employee : null;
  const [employeeId, setEmployeeId] = useState(editing?.employeeId ?? '');
  const [name, setName] = useState(editing?.name ?? '');
  const [type, setType] = useState<EmployeeType>(editing?.type ?? 'waiting');
  const [busId, setBusId] = useState(editing?.busId ?? bus.id);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(ev: FormEvent) {
    ev.preventDefault();
    if (busy) return;
    const id = employeeId.trim().toUpperCase();
    if (!editing && !EMPLOYEE_ID_PATTERN.test(id)) {
      setError('رقم الموظف غير صالح (من 3 إلى 32 حرفاً أو رقماً إنجليزياً، ويسمح بـ _ و -).');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      if (editing) await updateEmployee({ employeeId: editing.id, name, type, busId });
      else await createEmployee({ employeeId: id, name, type, busId });
      onClose();
    } catch (err) {
      setError(toAppError(err).message);
      setBusy(false);
    }
  }

  return (
    <Modal onClose={onClose} dismissable={!busy}>
      <form className="dialog" role="dialog" aria-modal="true" aria-labelledby="emp-dlg-title" onSubmit={submit}>
        <h1 id="emp-dlg-title">{editing ? 'تعديل موظف' : 'إضافة موظف'}</h1>

        <label className="field">
          <span>رقم الموظف</span>
          <input
            dir="ltr"
            value={employeeId}
            onChange={(e) => setEmployeeId(e.target.value)}
            placeholder="EMP1025"
            autoCapitalize="characters"
            autoCorrect="off"
            spellCheck={false}
            disabled={Boolean(editing)}
            autoFocus={!editing}
            required
          />
        </label>

        <label className="field">
          <span>الاسم</span>
          <input value={name} onChange={(e) => setName(e.target.value)} autoFocus={Boolean(editing)} required />
        </label>

        <label className="field">
          <span>النوع</span>
          <select value={type} onChange={(e) => setType(e.target.value as EmployeeType)}>
            <option value="main">أساسي (يبدأ كل يوم IN)</option>
            <option value="waiting">انتظار</option>
          </select>
        </label>

        {buses.length > 1 && (
          <label className="field">
            <span>الأتوبيس</span>
            <select value={busId} onChange={(e) => setBusId(e.target.value)}>
              {buses.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.route} · {b.busNumber}
                </option>
              ))}
            </select>
          </label>
        )}

        <ErrorBanner message={error} />

        <div className="dialog__actions">
          <button type="submit" className="btn btn--primary" disabled={busy}>
            {busy ? 'جارٍ الحفظ…' : 'حفظ'}
          </button>
          <button type="button" className="btn btn--ghost" disabled={busy} onClick={onClose}>
            إلغاء
          </button>
        </div>
      </form>
    </Modal>
  );
}
