import { useCallback, useEffect, useRef, useState } from 'react';
import { claimBusLocation, publishBusPosition, releaseBusLocation, type Fix } from '../services/busLocationService';
import type { Bus, Employee } from '../types';
import { AppError, makeError, toAppError } from '../utils/errors';

/** Firestore writes are throttled: one position every 15 s (plus the first one immediately). */
const SEND_EVERY_MS = 15_000;

const toFix = (p: GeolocationPosition): Fix => {
  const n = (v: number | null) => (v !== null && Number.isFinite(v) ? v : null);
  return {
    lat: p.coords.latitude,
    lng: p.coords.longitude,
    accuracy: n(p.coords.accuracy),
    speed: n(p.coords.speed),
    heading: n(p.coords.heading),
  };
};

const geoMessage = (e: GeolocationPositionError) =>
  e.code === e.PERMISSION_DENIED
    ? 'يجب السماح للتطبيق بالوصول إلى موقعك من إعدادات المتصفح.'
    : e.code === e.TIMEOUT
      ? 'انتهت مهلة تحديد الموقع. تأكد من تشغيل الـ GPS وحاول مرة أخرى.'
      : 'تعذر تحديد موقعك. تأكد من تشغيل الـ GPS.';

const getPosition = () =>
  new Promise<GeolocationPosition>((resolve, reject) =>
    navigator.geolocation.getCurrentPosition(resolve, (e) => reject(makeError('unknown', geoMessage(e))), {
      enableHighAccuracy: true,
      timeout: 20_000,
      maximumAge: 0,
    }),
  );

/**
 * Shares THIS device's GPS position as the bus location while the page is open.
 * Browsers pause GPS for background tabs / locked screens, so the sharer keeps the page open.
 */
export function useLocationSharing(bus: Bus | null, me: Employee | null) {
  const [sharing, setSharing] = useState(false);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const watchId = useRef<number | null>(null);
  const lastSent = useRef(0);
  const ctx = useRef({ busId: bus?.id ?? null, me });
  ctx.current = { busId: bus?.id ?? null, me };

  const stopWatching = useCallback(() => {
    if (watchId.current !== null) {
      navigator.geolocation.clearWatch(watchId.current);
      watchId.current = null;
    }
    setSharing(false);
  }, []);

  const stop = useCallback(async () => {
    const { busId } = ctx.current;
    stopWatching();
    // Fails harmlessly when someone else already took over.
    if (busId) await releaseBusLocation(busId).catch(() => undefined);
  }, [stopWatching]);

  const start = useCallback(async () => {
    const { busId, me: employee } = ctx.current;
    if (!busId || !employee || watchId.current !== null) return;
    if (!('geolocation' in navigator)) {
      setError('هذا المتصفح لا يدعم تحديد الموقع.');
      return;
    }
    setStarting(true);
    setError(null);
    try {
      const first = await getPosition(); // asks the browser for permission
      await claimBusLocation(busId, employee, toFix(first));
      lastSent.current = Date.now();
      watchId.current = navigator.geolocation.watchPosition(
        (p) => {
          const now = Date.now();
          if (now - lastSent.current < SEND_EVERY_MS) return;
          lastSent.current = now;
          publishBusPosition(busId, toFix(p)).catch((err) => {
            stopWatching();
            setError(
              err instanceof AppError && err.code === 'permission-denied'
                ? 'توقفت مشاركة موقعك لأن زميلاً آخر بدأ المشاركة.'
                : toAppError(err).message,
            );
          });
        },
        (e) => {
          // Timeouts / weak signal are transient; only a revoked permission ends the sharing.
          if (e.code === e.PERMISSION_DENIED) {
            void stop();
            setError(geoMessage(e));
          }
        },
        { enableHighAccuracy: true, maximumAge: 5_000, timeout: 30_000 },
      );
      setSharing(true);
    } catch (err) {
      setError(toAppError(err).message);
    } finally {
      setStarting(false);
    }
  }, [stop, stopWatching]);

  // Leaving the page (logout / navigation) ends an active sharing.
  useEffect(
    () => () => {
      if (watchId.current === null) return;
      navigator.geolocation.clearWatch(watchId.current);
      watchId.current = null;
      const { busId } = ctx.current;
      if (busId) void releaseBusLocation(busId).catch(() => undefined);
    },
    [],
  );

  return { sharing, starting, error, start, stop, clearError: () => setError(null) };
}
