import { FiDownload } from 'react-icons/fi';
import type { Employee, TripType } from '../../types';
import { EmptyState } from '../common/EmptyState';

interface Props {
  tripType: TripType;
  capacity: number;
  passengers: Employee[];
  onExport: () => void;
}

export function Summary({ tripType, capacity, passengers, onExport }: Props) {
  const count = passengers.length;
  const full = count >= capacity;
  const pct = Math.min(100, Math.round((count / Math.max(capacity, 1)) * 100));

  return (
    <section className="section summary" aria-labelledby="summary-title">
      <div className="section__head">
        <h2 id="summary-title">الملخص – {tripType === 'going' ? 'الذهاب' : 'العودة'}</h2>
        <button type="button" className="btn btn--primary" onClick={onExport}>
          <FiDownload aria-hidden="true" /> تصدير PDF
        </button>
      </div>

      <div className="meter" aria-live="polite">
        <div className="meter__numbers">
          <strong>
            <bdi className="num">
              {count} / {capacity}
            </bdi>
          </strong>
          <span>{full ? 'الأتوبيس ممتلئ' : `متبقي ${capacity - count} مقعد`}</span>
        </div>
        <div
          className={`meter__bar${full ? ' is-full' : ''}`}
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={capacity}
          aria-valuenow={count}
        >
          <span style={{ width: `${pct}%` }} />
        </div>
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
