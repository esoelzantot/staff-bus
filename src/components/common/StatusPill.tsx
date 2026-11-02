import type { EmployeeStatus, TripType } from '../../types';
import { DaysChip } from './DaysChip';
import { TRIP_LABEL, TRIP_SHORT, TripIcon } from './TripIcon';

/**
 * Read-only chip of one direction, coloured by the status: icon + "ذهاب" · IN / OUT · this month's IN days.
 * Two of them sit side by side on a card.
 */
export function StatusPill({ trip, value, count }: { trip: TripType; value: EmployeeStatus; count: number }) {
  return (
    <div className={`trip trip--${value}`} title={`${TRIP_LABEL[trip]}: ${value === 'in' ? 'IN' : 'OUT'}`}>
      <span className="trip__dir">
        <TripIcon trip={trip} />
        {TRIP_SHORT[trip]}
      </span>
      <span className={`pill pill--${value}`}>{value === 'in' ? 'IN' : 'OUT'}</span>
      <DaysChip count={count} />
    </div>
  );
}
