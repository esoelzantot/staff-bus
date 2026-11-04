import { FiClock, FiDownload } from 'react-icons/fi';
import type { Employee, EmployeeStatus, StatusField } from '../../types';
import { monthInDays } from '../../utils/attendance';
import { serviceDayKey } from '../../utils/date/format';
import { initials } from '../../utils/initials';
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

/** The bus of the "main" stub (same drawing as the app icon). */
function BusGlyph() {
  return (
    <svg className="stub__glyph" viewBox="0 0 64 64" aria-hidden="true">
      <rect x="10" y="12" width="44" height="32" rx="7" />
      <rect x="16" y="18" width="32" height="11" rx="2" className="stub__window" />
      <circle cx="21" cy="49" r="5" />
      <circle cx="43" cy="49" r="5" />
    </svg>
  );
}

/**
 * An employee as a bus ticket: avatar, name and the two directions on the ticket, the type on the stub (bus = main,
 * clock = waiting), separated by a perforated line with two notches.
 */
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
  const days = monthInDays(employee, serviceDayKey());
  const isMain = employee.type === 'main';
  const typeLabel = isMain ? 'أساسي' : 'انتظار';

  return (
    <article className={`card card--${employee.type} card--${size}${isMe ? ' card--me' : ''}`}>
      <div className="card__body">
        <header className="card__head">
          <span className="avatar" aria-hidden="true">
            {initials(employee.name)}
          </span>
          <h3 className="card__name">
            {/* bdi: a Latin name keeps its own direction, the tags stay on the same side for every name */}
            <bdi dir="auto">{employee.name}</bdi>
            {!isMain && queueRank !== undefined && (
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
        </header>

        {readOnly || !onChange || !pendingValue ? (
          <div className="card__pills">
            <StatusPill trip="going" value={employee.goingStatus} count={days.going} />
            <StatusPill trip="returning" value={employee.returningStatus} count={days.returning} />
          </div>
        ) : (
          <div className="card__toggles">
            <StatusToggle
              trip="going"
              value={employee.goingStatus}
              count={days.going}
              pendingValue={pendingValue(employee.id, 'goingStatus')}
              onChange={(v) => onChange(employee.id, 'goingStatus', v)}
            />
            <StatusToggle
              trip="returning"
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
      </div>

      {/* the ticket stub: what kind of passenger this is */}
      <aside className="card__stub" aria-label={typeLabel} title={typeLabel}>
        {isMain ? <BusGlyph /> : <FiClock className="stub__glyph" aria-hidden="true" />}
      </aside>
    </article>
  );
}
