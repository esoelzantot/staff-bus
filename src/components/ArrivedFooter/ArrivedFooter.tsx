import { FiCheckCircle, FiFlag, FiX } from 'react-icons/fi';
import { useConfirm } from '../../hooks/useConfirm';
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
  const { confirm, dialog } = useConfirm();

  return (
    <footer className="footer">
      {dialog}
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
              onClick={async () => {
                const ok = await confirm({
                  title: 'إلغاء تسجيل الوصول',
                  message: 'هل تريد إلغاء تسجيل الوصول؟ سيختفي من عند كل الموظفين.',
                  confirmLabel: 'نعم، إلغاء الوصول',
                  cancelLabel: 'تراجع',
                  destructive: true,
                });
                if (ok) onCancel();
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
          onClick={async () => {
            const ok = await confirm({
              title: 'وصلنا؟',
              message: 'هل وصل الأتوبيس الآن؟ سيظهر الوصول لكل الموظفين.',
              confirmLabel: 'نعم، وصلنا',
              cancelLabel: 'لسه',
            });
            if (ok) onArrive();
          }}
        >
          {busy ? <span className="spinner spinner--sm" aria-hidden="true" /> : <FiFlag aria-hidden="true" />}
          وصلنا
        </button>
      )}
    </footer>
  );
}
