import { useCallback, useEffect, useRef, useState } from 'react';
import { claimBusLocation, publishBusPosition, releaseBusLocation, type Fix } from '../services/busLocationService';
import type { Bus, Employee } from '../types';
import { AppError, makeError, toAppError } from '../utils/errors';

/**
 * Firestore writes are adaptive so the map feels live without burning the free quota:
 *  - moving (≥ 8 m since the last sent position): a write every 2 s at most
 *  - parked: only a heartbeat every 15 s, so the sharer still counts as "fresh" (rules: stale after 90 s)
 */
const MIN_INTERVAL_MS = 5_000;
const HEARTBEAT_MS = 15_000;
const MIN_MOVE_M = 8;

/** Haversine distance in metres. */
const distanceM = (a: Fix, b: Fix) => {
  const rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad;
  const dLng = (b.lng - a.lng) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2;
  return 12_742_000 * Math.asin(Math.sqrt(h));
};

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
  const lastFix = useRef<Fix | null>(null);
  const sending = useRef(false);
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
      const first = toFix(await getPosition()); // asks the browser for permission
      await claimBusLocation(busId, employee, first);
      lastSent.current = Date.now();
      lastFix.current = first;
      sending.current = false;
      watchId.current = navigator.geolocation.watchPosition(
        (p) => {
          const fix = toFix(p);
          const elapsed = Date.now() - lastSent.current;
          const moved = lastFix.current === null || distanceM(lastFix.current, fix) >= MIN_MOVE_M;
          // One write at a time (slow networks); while moving ≥ every 2 s, parked → heartbeat only.
          if (sending.current || elapsed < MIN_INTERVAL_MS || (!moved && elapsed < HEARTBEAT_MS)) return;
          sending.current = true;
          lastSent.current = Date.now();
          lastFix.current = fix;
          publishBusPosition(busId, fix)
            .catch((err) => {
              stopWatching();
              setError(
                err instanceof AppError && err.code === 'permission-denied'
                  ? 'توقفت مشاركة موقعك لأن زميلاً آخر بدأ المشاركة.'
                  : toAppError(err).message,
              );
            })
            .finally(() => {
              sending.current = false;
            });
        },
        (e) => {
          // Timeouts / weak signal are transient; only a revoked permission ends the sharing.
          if (e.code === e.PERMISSION_DENIED) {
            void stop();
            setError(geoMessage(e));
          }
        },
        { enableHighAccuracy: true, maximumAge: 0, timeout: 30_000 },
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
