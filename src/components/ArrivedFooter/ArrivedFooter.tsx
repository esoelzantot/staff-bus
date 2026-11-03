import { FiCheck, FiFlag, FiX } from 'react-icons/fi';
import { useConfirm } from '../../hooks/useConfirm';
import type { BusTrip } from '../../types';
import { cairoMinutes, formatMinutes, isLate } from '../../utils/arrivals';
import { ArrivalBadge } from '../common/ArrivalBadge';

interface Props {
  /** Today's going trip (null until someone records the arrival). */
  trip: BusTrip | null;
  loading: boolean;
  busy: boolean;
  /** Only the employee who recorded the arrival sees the X. */
  canCancel: boolean;
  onArrive: () => void;
  onCancel: () => void;
}

/** The little bus of the road animation (same drawing as the app icon). */
function BusGlyph() {
  return (
    <svg className="arriveCta__bus" viewBox="0 0 64 64" aria-hidden="true">
      <rect x="8" y="12" width="48" height="34" rx="8" />
      <rect x="14" y="18" width="36" height="12" rx="2" className="arriveCta__window" />
      <circle cx="20" cy="50" r="6" />
      <circle cx="44" cy="50" r="6" />
    </svg>
  );
}

/**
 * Before the arrival: "وصلنا" – a red trip card, a bus driving along a road towards the flag, one big button.
 * After it (for EVERYONE on the bus): "حمد لله على السلامة 😇😇" – a ticket with the rabbit on its stub, the time with
 * its بدري / متأخر badge, and who recorded it.
 */
export function ArrivedFooter({ trip, loading, busy, canCancel, onArrive, onCancel }: Props) {
  const arrivedAt = trip?.arrivalTime ? trip.arrivalTime.toDate() : null;
  const { confirm, dialog } = useConfirm();

  if (arrivedAt) {
    const minutes = cairoMinutes(arrivedAt);
    return (
      <section className={`arrivedTicket${isLate(minutes) ? ' is-late' : ''}`} role="status" aria-label="تم تسجيل الوصول">
        {dialog}
        <div className="arrivedTicket__body">
          <span className="arrivedTicket__check" aria-hidden="true">
            <FiCheck />
          </span>
          <strong className="arrivedTicket__title">حمد لله على السلامة 😇😇</strong>
          <p className="arrivedTicket__line">
            وصل الباص الساعة
            <span className="arrivedTicket__time">
              <bdi>{formatMinutes(minutes)}</bdi>
            </span>
            <ArrivalBadge minutes={minutes} />
          </p>
          {trip?.arrivedByName && (
            <span className="arrivedTicket__by">
              🏁 سجّل الوصول: <bdi dir="auto">{trip.arrivedByName}</bdi>
            </span>
          )}
        </div>

        <div className="arrivedTicket__stub" aria-hidden="true">
          <img src="/brand/rabbit.png" alt="" width={287} height={398} />
        </div>

        {canCancel && (
          <button
            type="button"
            className="arrivedTicket__close"
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
      </section>
    );
  }

  return (
    <section className="arriveCta" aria-labelledby="arrive-title">
      {dialog}
      <div className="arriveCta__road" aria-hidden="true">
        <BusGlyph />
        <span className="arriveCta__flag">🏁</span>
      </div>
      <h2 id="arrive-title" className="arriveCta__title">
        الباص وصل؟
      </h2>
      <p className="arriveCta__hint">أول واحد يدوس «وصلنا» بيسجّل الوصول لكل الزملاء.</p>
      <button
        type="button"
        className="arriveCta__btn"
        disabled={busy || loading}
        onClick={async () => {
          const ok = await confirm({
            title: 'وصلنا؟',
            message: 'هل وصل الباص الآن؟ سيظهر الوصول لكل الموظفين.',
            confirmLabel: 'نعم، وصلنا',
            cancelLabel: 'لسه',
          });
          if (ok) onArrive();
        }}
      >
        {busy ? <span className="spinner spinner--sm" aria-hidden="true" /> : <FiFlag aria-hidden="true" />}
        وصلنا
      </button>
    </section>
  );
}
