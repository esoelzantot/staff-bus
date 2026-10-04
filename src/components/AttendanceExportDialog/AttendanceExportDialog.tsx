import { useId, useMemo, useState } from 'react';
import type { AttendanceDay } from '../../types';
import { availableMonths, buildMonth, monthOf } from '../../utils/attendance';
import { formatMonth } from '../../utils/date/format';
import { Modal } from '../common/Modal';

interface Props {
  employeeName: string;
  /** Every recorded day of the employee (any months). */
  days: AttendanceDay[];
  /** Today's day key (yyyy-mm-dd, Cairo). */
  today: string;
  /** Called with the chosen month (yyyy-mm); the caller builds and downloads the PDF. */
  onExport: (month: string) => void;
  onClose: () => void;
  /** The PDF is being prepared. */
  busy?: boolean;
}

const AR = 'ar-EG-u-nu-latn';

/** Month picker of the manager's "monthly IN record": shows the month's totals and downloads its PDF. */
export function AttendanceExportDialog({ employeeName, days, today, onExport, onClose, busy = false }: Props) {
  const titleId = useId();
  const selectId = useId();
  const months = useMemo(() => availableMonths(days, monthOf(today)), [days, today]);
  const [month, setMonth] = useState(months[0]);
  const view = useMemo(() => buildMonth(days, month, today), [days, month, today]);

  return (
    <Modal onClose={onClose} dismissable={!busy}>
      <div className="dialog" role="dialog" aria-modal="true" aria-labelledby={titleId}>
        <h1 id={titleId}>السجل الشهري</h1>
        <p className="dialog__hint">{employeeName}</p>

        <label className="field" htmlFor={selectId}>
          <span>الشهر</span>
          <select id={selectId} value={month} onChange={(e) => setMonth(e.target.value)} disabled={busy}>
            {months.map((m) => (
              <option key={m} value={m}>
                {formatMonth(m, AR)}
              </option>
            ))}
          </select>
        </label>

        <p className="dialog__hint" aria-live="polite">
          {view.rows.length === 0
            ? 'هذا الشهر لم يبدأ بعد.'
            : `أيام مسجّلة: ${view.recorded} من ${view.rows.length} · الذهاب IN: ${view.goingIn} يوم · العودة IN: ${view.returningIn} يوم`}
        </p>

        <div className="dialog__actions">
          <button
            type="button"
            className="btn btn--primary"
            disabled={busy || view.rows.length === 0}
            onClick={() => onExport(month)}
          >
            {busy ? 'جارٍ التجهيز…' : 'تحميل PDF'}
          </button>
          <button type="button" className="btn btn--ghost" disabled={busy} onClick={onClose}>
            إغلاق
          </button>
        </div>
      </div>
    </Modal>
  );
}
