import { lazy, Suspense, useEffect, useState } from 'react';
import { FiMapPin, FiNavigation, FiRadio, FiStopCircle } from 'react-icons/fi';
import { useBusLocation } from '../../hooks/useBusData';
import { useLocationSharing } from '../../hooks/useLocationSharing';
import { isLocationFresh } from '../../services/busLocationService';
import type { Bus, Employee } from '../../types';
import { formatAge } from '../../utils/date/format';
import { ErrorBanner } from '../common/ErrorBanner';
import { Spinner } from '../common/Spinner';

// Leaflet is loaded only when someone opens the map.
const BusMap = lazy(() => import('./BusMap'));

interface Props {
  bus: Bus;
  me: Employee;
  /** Today's going trip has arrived → the sharer's GPS is switched off automatically. */
  arrived: boolean;
}

export function BusTracker({ bus, me, arrived }: Props) {
  const location = useBusLocation(bus.id);
  const share = useLocationSharing(bus, me);
  const [mapOpen, setMapOpen] = useState(false);
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1_000);
    return () => clearInterval(timer);
  }, []);

  // Only on the moment the arrival gets recorded (not when someone starts sharing later).
  useEffect(() => {
    if (arrived && share.sharing) void share.stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [arrived]);

  const loc = location.data;
  const active = Boolean(loc?.active);
  const fresh = loc ? isLocationFresh(loc, now) : false;
  const isMine = loc?.sharedById === me.id;
  const age = loc ? formatAge(now - loc.updatedAt.toMillis()) : '';
  const someoneElseSharing = active && !isMine && fresh;

  let status: string;
  if (share.sharing) status = 'أنت تشارك موقع الأتوبيس الآن. اترك هذه الصفحة مفتوحة.';
  else if (active && isMine) status = 'مشاركة موقعك متوقفة (ربما أُعيد تحميل الصفحة). اضغط استئناف لمتابعة المشاركة.';
  else if (someoneElseSharing) status = `${loc?.sharedByName} يشارك موقع الأتوبيس · آخر تحديث ${age}`;
  else if (active) status = `توقف تحديث الموقع من ${loc?.sharedByName} (${age}). يظهر آخر موقع معروف.`;
  else status = 'لا أحد يشارك موقع الأتوبيس حالياً.';

  return (
    <section className="section tracker" aria-labelledby="tracker-title">
      <div className="section__head">
        <h2 id="tracker-title">تتبع الأتوبيس</h2>
      </div>

      <ErrorBanner message={share.error ?? location.error} onDismiss={share.clearError} />

      {location.loading ? (
        <Spinner label="جارٍ تحميل موقع الأتوبيس…" />
      ) : (
        <>
          <p className="tracker__status" role="status">
            {status}
          </p>

          <div className="tracker__actions">
            {active && (
              <button type="button" className="btn btn--signal" onClick={() => setMapOpen((open) => !open)}>
                <FiMapPin aria-hidden="true" /> {mapOpen ? 'إخفاء الخريطة' : 'تتبع الأتوبيس'}
              </button>
            )}
            {!share.sharing && !someoneElseSharing && (
              <button type="button" className="btn btn--ghost" disabled={share.starting} onClick={() => void share.start()}>
                {share.starting ? <span className="spinner spinner--sm" aria-hidden="true" /> : <FiRadio aria-hidden="true" />}
                {active && isMine ? 'استئناف المشاركة' : 'ابدأ مشاركة موقع الأتوبيس'}
              </button>
            )}
            {(share.sharing || (active && isMine)) && (
              <button type="button" className="btn btn--ghost" onClick={() => void share.stop()}>
                <FiStopCircle aria-hidden="true" /> إيقاف المشاركة
              </button>
            )}
          </div>

          {!share.sharing && !someoneElseSharing && (
            <p className="tracker__note">
              عند بدء المشاركة يظهر موقع هاتفك لموظفي هذا الأتوبيس إلى أن توقفها أو يصل الأتوبيس.
            </p>
          )}

          {mapOpen && loc && active && (
            <div className="tracker__map">
              <Suspense fallback={<Spinner label="جارٍ تحميل الخريطة…" />}>
                <BusMap lat={loc.lat} lng={loc.lng} speed={loc.speed} info={`${loc.sharedByName} · ${age}`} />
              </Suspense>
              <a
                className="btn btn--ghost"
                href={`https://www.google.com/maps/dir/?api=1&destination=${loc.lat},${loc.lng}&travelmode=driving`}
                target="_blank"
                rel="noopener noreferrer"
              >
                <FiNavigation aria-hidden="true" /> فتح في خرائط جوجل
              </a>
            </div>
          )}
        </>
      )}
    </section>
  );
}
