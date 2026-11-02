import { FiDownload } from 'react-icons/fi';
import type { Employee, TripType } from '../../types';
import { EmptyState } from '../common/EmptyState';
import { SeatMap } from '../common/SeatMap';

interface Props {
  tripType: TripType;
  capacity: number;
  passengers: Employee[];
  onExport: () => void;
}

export function Summary({ tripType, capacity, passengers, onExport }: Props) {
  const count = passengers.length;

  return (
    <section className="section summary" aria-labelledby="summary-title">
      <div className="section__head">
        <h2 id="summary-title">الملخص – {tripType === 'going' ? 'الذهاب' : 'العودة'}</h2>
        <button type="button" className="btn btn--primary" onClick={onExport}>
          <FiDownload aria-hidden="true" /> تصدير PDF
        </button>
      </div>

      <div aria-live="polite">
        <SeatMap label={tripType === 'going' ? 'الذهاب' : 'العودة'} capacity={capacity} taken={count} />
      </div>

      {count === 0 ? (
        <EmptyState>لا يوجد ركاب بعد.</EmptyState>
      ) : (
        <ol className="passengers">
          {passengers.map((p) => (
            <li key={p.id}>
              <span dir="auto">{p.name}</span>
              <span className={`badge badge--${p.type}`}>{p.type === 'main' ? 'أساسي' : 'انتظار'}</span>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
