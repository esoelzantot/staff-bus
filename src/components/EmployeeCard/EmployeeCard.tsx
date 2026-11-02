import { FiDownload } from 'react-icons/fi';
import type { Employee, EmployeeStatus, StatusField } from '../../types';
import { monthInDays } from '../../utils/attendance';
import { todayKey } from '../../utils/date/format';
import { StatusPill } from '../common/StatusPill';
import { StatusToggle } from '../common/StatusToggle';

interface Props {
  employee: Employee;
  size?: 'regular' | 'large';
  /** Shows the statuses without any buttons. */
  readOnly?: boolean;
  /** Marks the card that belongs to the signed-in employee. */
  isMe?: boolean;
  pendingValue?: (employeeId: string, field: StatusField) => EmployeeStatus | null;
  onChange?: (employeeId: string, field: StatusField, value: EmployeeStatus) => void;
  /** Managers only: opens this employee's monthly IN record (every day, Going + Returning) for a PDF download. */
  onExportLog?: (employee: Employee) => void;
  /** The PDF of this card is being prepared. */
  exporting?: boolean;
  /** Waiting employees: place in the waiting line (1 = first to take a free seat). */
  queueRank?: number;
}

export function EmployeeCard({
  employee,
  size = 'regular',
  readOnly = false,
  isMe = false,
  pendingValue,
  onChange,
  onExportLog,
  exporting = false,
  queueRank,
}: Props) {
  // IN days of the current month only (the counters start again at 0 every month)
  const days = monthInDays(employee, todayKey());
  return (
    <article className={`card card--${employee.type} card--${size}${isMe ? ' card--me' : ''}`}>
      <header className="card__head">
        <div>
          <h3 className="card__name">
            {/* bdi: a Latin name keeps its own direction, the tags stay on the same side for every name */}
            <bdi dir="auto">{employee.name}</bdi>
            {employee.type === 'waiting' && queueRank !== undefined && (
              <span
                className="queueTag"
                title="الترتيب في قائمة الانتظار: الأول ياخد أول مكان يفضى"
                aria-label={`الترتيب في قائمة الانتظار: ${queueRank}`}
              >
                {queueRank}
              </span>
            )}
            {isMe && <span className="meTag">أنت</span>}
          </h3>
        </div>
        <span className={`badge badge--${employee.type}`}>{employee.type === 'main' ? 'أساسي' : 'انتظار'}</span>
      </header>

      {readOnly || !onChange || !pendingValue ? (
        <div className="card__pills">
          <StatusPill label="الذهاب" value={employee.goingStatus} count={days.going} />
          <StatusPill label="العودة" value={employee.returningStatus} count={days.returning} />
        </div>
      ) : (
        <div className="card__toggles">
          <StatusToggle
            label="الذهاب"
            value={employee.goingStatus}
            count={days.going}
            pendingValue={pendingValue(employee.id, 'goingStatus')}
            onChange={(v) => onChange(employee.id, 'goingStatus', v)}
          />
          <StatusToggle
            label="العودة"
            value={employee.returningStatus}
            count={days.returning}
            pendingValue={pendingValue(employee.id, 'returningStatus')}
            onChange={(v) => onChange(employee.id, 'returningStatus', v)}
          />
        </div>
      )}

      {onExportLog && (
        <button
          type="button"
          className="btn btn--ghost btn--sm"
          disabled={exporting}
          onClick={() => onExportLog(employee)}
          aria-label={`السجل الشهري للموظف ${employee.name} (PDF)`}
        >
          {exporting ? <span className="spinner spinner--sm" aria-hidden="true" /> : <FiDownload aria-hidden="true" />}
          {exporting ? 'جارٍ التجهيز…' : 'السجل الشهري (PDF)'}
        </button>
      )}
    </article>
  );
}
