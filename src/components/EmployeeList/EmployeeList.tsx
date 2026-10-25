import { useMemo } from 'react';
import type { Employee, EmployeeStatus, EmployeeType, StatusField } from '../../types';
import { queueRanks, sortWaiting } from '../../utils/waitingQueue';
import { EmployeeCard } from '../EmployeeCard/EmployeeCard';
import { EmptyState } from '../common/EmptyState';

interface Props {
  title: string;
  variant: EmployeeType;
  employees: Employee[];
  readOnly?: boolean;
  meId?: string;
  pendingValue?: (employeeId: string, field: StatusField) => EmployeeStatus | null;
  onChange?: (employeeId: string, field: StatusField, value: EmployeeStatus) => void;
  /** Managers only: shows a "monthly IN record (PDF)" button on every card. */
  onExportLog?: (employee: Employee) => void;
  /** Id of the employee whose PDF is being prepared (disables that card's button). */
  exportingId?: string | null;
}

const EMPTY: Record<EmployeeType, string> = {
  main: 'لا يوجد موظفون أساسيون.',
  waiting: 'لا يوجد موظفون في قائمة الانتظار.',
};

export function EmployeeList({
  title,
  variant,
  employees,
  readOnly,
  meId,
  pendingValue,
  onChange,
  onExportLog,
  exportingId,
}: Props) {
  // The waiting list is shown in line order, each card with its place ("الدور N").
  const shown = useMemo(() => (variant === 'waiting' ? sortWaiting(employees) : employees), [variant, employees]);
  const ranks = useMemo(() => (variant === 'waiting' ? queueRanks(employees) : null), [variant, employees]);

  return (
    <section className={`section section--${variant}`} aria-labelledby={`list-${variant}`}>
      <div className="section__head">
        <h2 id={`list-${variant}`}>{title}</h2>
        <span className="count">{employees.length}</span>
      </div>
      {employees.length === 0 ? (
        <EmptyState>{EMPTY[variant]}</EmptyState>
      ) : (
        <div className="grid">
          {shown.map((e) => (
            <EmployeeCard
              key={e.id}
              employee={e}
              queueRank={ranks?.get(e.id)}
              readOnly={readOnly}
              isMe={e.id === meId}
              pendingValue={pendingValue}
              onChange={onChange}
              onExportLog={onExportLog}
              exporting={exportingId === e.id}
            />
          ))}
        </div>
      )}
    </section>
  );
}
