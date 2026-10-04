import { FiCheck, FiX } from 'react-icons/fi';
import type { EmployeeStatus } from '../../types';

interface Props {
  label: string;
  value: EmployeeStatus;
  /** Value currently being saved, or null when idle. */
  pendingValue: EmployeeStatus | null;
  /** Number of days this employee was IN. */
  count: number;
  disabled?: boolean;
  onChange: (value: EmployeeStatus) => void;
}

export function StatusToggle({ label, value, pendingValue, count, disabled, onChange }: Props) {
  const saving = pendingValue !== null;
  const options: { key: EmployeeStatus; text: string }[] = [
    { key: 'in', text: 'IN' },
    { key: 'out', text: 'OUT' },
  ];

  return (
    <div className="toggle" role="group" aria-label={label}>
      <span className="toggle__label">
        {label}
        <span className="tally" title={`عدد أيام IN: ${count}`} aria-label={`عدد أيام IN: ${count}`}>
          {count}
        </span>
        {saving && <span className="toggle__saving">جارٍ الحفظ…</span>}
      </span>
      <div className="toggle__buttons">
        {options.map(({ key, text }) => {
          const active = value === key;
          return (
            <button
              key={key}
              type="button"
              className={`toggle__btn toggle__btn--${key}${active ? ' is-active' : ''}`}
              aria-pressed={active}
              disabled={disabled || saving}
              onClick={() => !active && onChange(key)}
            >
              {pendingValue === key ? (
                <span className="spinner spinner--sm" aria-hidden="true" />
              ) : key === 'in' ? (
                <FiCheck aria-hidden="true" />
              ) : (
                <FiX aria-hidden="true" />
              )}
              {text}
            </button>
          );
        })}
      </div>
    </div>
  );
}
