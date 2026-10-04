import type { Employee, EmployeeStatus, EmployeeType, StatusField } from '../../types';
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
          {employees.map((e) => (
            <EmployeeCard
              key={e.id}
              employee={e}
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
