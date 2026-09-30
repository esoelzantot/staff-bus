import { FiCheckCircle, FiFlag, FiRotateCcw } from 'react-icons/fi';
import type { BusTrip } from '../../types';
import { formatTime } from '../../utils/date/format';
import { EmptyState } from '../common/EmptyState';
import { Spinner } from '../common/Spinner';

interface Props {
  trip: BusTrip | null;
  loading: boolean;
  busy: boolean;
  onArrive: () => void;
  onReset: () => void;
}

export function ArrivalSection({ trip, loading, busy, onArrive, onReset }: Props) {
  const arrived = Boolean(trip?.arrivalTime);

  return (
    <section className={`section arrival${arrived ? ' is-arrived' : ''}`} aria-labelledby="arrival-title">
      <div className="section__head">
        <h2 id="arrival-title">الوصول</h2>
      </div>

      {loading ? (
        <Spinner label="جارٍ تحميل بيانات الأتوبيس…" />
      ) : !trip ? (
        <EmptyState>لا توجد رحلة نشطة.</EmptyState>
      ) : arrived ? (
        <div className="arrival__done">
          <FiCheckCircle aria-hidden="true" className="arrival__icon" />
          <div>
            <strong>وصل الأتوبيس ✓</strong>
            <p>وقت الوصول:</p>
            <p className="arrival__time">{formatTime(trip.arrivalTime)}</p>
          </div>
          <button
            type="button"
            className="btn btn--ghost"
            disabled={busy}
            onClick={() => {
              if (window.confirm('هل تريد إلغاء تسجيل الوصول لهذه الرحلة؟')) onReset();
            }}
          >
            <FiRotateCcw aria-hidden="true" /> إلغاء تسجيل الوصول
          </button>
        </div>
      ) : (
        <button
          type="button"
          className="btn btn--signal btn--xl"
          disabled={busy}
          onClick={() => {
            if (window.confirm('هل وصل الأتوبيس الآن؟ سيتم تسجيل وقت الوصول.')) onArrive();
          }}
        >
          {busy ? <span className="spinner spinner--sm" aria-hidden="true" /> : <FiFlag aria-hidden="true" />}
          وصل الأتوبيس
        </button>
      )}
    </section>
  );
}
