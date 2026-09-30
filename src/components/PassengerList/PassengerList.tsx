import { FiDownload } from 'react-icons/fi';
import type { Employee } from '../../types';
import { EmptyState } from '../common/EmptyState';

interface Props {
  title: string;
  capacity: number;
  passengers: Employee[];
  meId?: string;
  /** When provided, shows an "export PDF" button for this list. */
  onExport?: () => void;
}

export function PassengerList({ title, capacity, passengers, meId, onExport }: Props) {
  const full = passengers.length >= capacity;
  return (
    <section className="section" aria-label={title}>
      <div className="section__head">
        <h2>{title}</h2>
        <span className={`capacity${full ? ' is-full' : ''}`}>
          <bdi className="num">
            {passengers.length} / {capacity}
          </bdi>
          {full && <span> · ممتلئ</span>}
        </span>
        {onExport && (
          <button type="button" className="btn btn--primary btn--sm" onClick={onExport}>
            <FiDownload aria-hidden="true" /> تصدير PDF
          </button>
        )}
      </div>
      {passengers.length === 0 ? (
        <EmptyState>لا يوجد ركاب بعد.</EmptyState>
      ) : (
        <ol className="passengers">
          {passengers.map((p) => (
            <li key={p.id} className={p.id === meId ? 'is-me' : undefined}>
              <span dir="auto">
                {p.name}
                {p.id === meId && <span className="meTag">أنت</span>}
              </span>
              <span className={`badge badge--${p.type}`}>{p.type === 'main' ? 'أساسي' : 'انتظار'}</span>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
