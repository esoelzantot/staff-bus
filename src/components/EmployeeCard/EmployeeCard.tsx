import { FiDownload } from 'react-icons/fi';
import type { Employee, EmployeeStatus, StatusField } from '../../types';
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
}: Props) {
  return (
    <article className={`card card--${employee.type} card--${size}${isMe ? ' card--me' : ''}`}>
      <header className="card__head">
        <div>
          <h3 className="card__name" dir="auto">
            {employee.name}
            {isMe && <span className="meTag">أنت</span>}
          </h3>
        </div>
        <span className={`badge badge--${employee.type}`}>{employee.type === 'main' ? 'أساسي' : 'انتظار'}</span>
      </header>

      {readOnly || !onChange || !pendingValue ? (
        <div className="card__pills">
          <StatusPill label="الذهاب" value={employee.goingStatus} count={employee.goingInCount} />
          <StatusPill label="العودة" value={employee.returningStatus} count={employee.returningInCount} />
        </div>
      ) : (
        <div className="card__toggles">
          <StatusToggle
            label="الذهاب"
            value={employee.goingStatus}
            count={employee.goingInCount}
            pendingValue={pendingValue(employee.id, 'goingStatus')}
            onChange={(v) => onChange(employee.id, 'goingStatus', v)}
          />
          <StatusToggle
            label="العودة"
            value={employee.returningStatus}
            count={employee.returningInCount}
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
