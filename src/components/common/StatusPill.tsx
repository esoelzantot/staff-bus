import type { EmployeeStatus } from '../../types';

/** Read-only IN / OUT indicator. */
export function StatusPill({ label, value, count }: { label: string; value: EmployeeStatus; count: number }) {
  return (
    <div className="pill-row">
      <span>{label}</span>
      <span className="tally" title={`أيام IN الشهر ده: ${count}`} aria-label={`أيام IN الشهر ده: ${count}`}>
        {count}
      </span>
      <span className={`pill pill--${value}`}>{value === 'in' ? 'IN' : 'OUT'}</span>
    </div>
  );
}
