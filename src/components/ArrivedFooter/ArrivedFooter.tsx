import { FiCheckCircle, FiFlag, FiX } from 'react-icons/fi';
import type { BusTrip } from '../../types';
import { formatClock } from '../../utils/date/format';

interface Props {
  /** Today's trip for the active direction (null until someone records the arrival). */
  trip: BusTrip | null;
  loading: boolean;
  busy: boolean;
  /** Only the employee who recorded the arrival sees the X. */
  canCancel: boolean;
  onArrive: () => void;
  onCancel: () => void;
}

/**
 * Page footer. Before arrival: the "وصلنا" button. After anyone on the bus pressed it:
 * a small card for EVERYONE with the exact time (from the server) and who recorded it.
 */
export function ArrivedFooter({ trip, loading, busy, canCancel, onArrive, onCancel }: Props) {
  const arrivedAt = trip?.arrivalTime ? trip.arrivalTime.toDate() : null;

  return (
    <footer className="footer">
      {arrivedAt ? (
        <div className="arrivedCard" role="status">
          <FiCheckCircle aria-hidden="true" className="arrivedCard__icon" />
          <div className="arrivedCard__body">
            <strong>الحمد لله على السلامة</strong>
            <span className="arrivedCard__time">
              <bdi className="num">{formatClock(arrivedAt)}</bdi>
            </span>
            {trip?.arrivedByName && (
              <span className="arrivedCard__by">
                سجّل الوصول: <bdi dir="auto">{trip.arrivedByName}</bdi>
              </span>
            )}
          </div>
          {canCancel && (
            <button
              type="button"
              className="arrivedCard__close"
              aria-label="إلغاء تسجيل الوصول"
              title="إلغاء تسجيل الوصول"
              disabled={busy}
              onClick={() => {
                if (window.confirm('هل تريد إلغاء تسجيل الوصول؟ سيختفي من عند كل الموظفين.')) onCancel();
              }}
            >
              {busy ? <span className="spinner spinner--sm" aria-hidden="true" /> : <FiX aria-hidden="true" />}
            </button>
          )}
        </div>
      ) : (
        <button
          type="button"
          className="btn btn--signal btn--xl"
          disabled={busy || loading}
          onClick={() => {
            if (window.confirm('هل وصل الأتوبيس الآن؟ سيظهر الوصول لكل الموظفين.')) onArrive();
          }}
        >
          {busy ? <span className="spinner spinner--sm" aria-hidden="true" /> : <FiFlag aria-hidden="true" />}
          وصلنا
        </button>
      )}
    </footer>
  );
}
