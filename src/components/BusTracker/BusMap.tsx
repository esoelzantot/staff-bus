import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { useCallback, useEffect, useRef, useState } from 'react';
import { FiCrosshair, FiMaximize, FiMinimize, FiNavigation } from 'react-icons/fi';

// A divIcon avoids Leaflet's default marker images, which bundlers do not resolve.
const busIcon = L.divIcon({
  className: '',
  html: '<div class="busMarker">🚌</div>',
  iconSize: [40, 40],
  iconAnchor: [20, 20],
});

/** The marker glides to each new position over about the gap between two updates (clamped). */
const MIN_GLIDE_MS = 800;
const MAX_GLIDE_MS = 3_000;

interface Props {
  lat: number;
  lng: number;
  /** GPS speed in m/s (null when unknown). */
  speed: number | null;
  /** Short status line shown on the map, e.g. "أحمد · الآن". */
  info: string;
}

/**
 * Live map (OpenStreetMap tiles):
 *  - the bus marker glides smoothly between updates
 *  - the map follows the bus; dragging the map pauses following, the 🎯 button resumes it
 *  - full-screen button (Fullscreen API where supported, CSS full-viewport everywhere else, e.g. iPhone)
 */
export default function BusMap({ lat, lng, speed, info }: Props) {
  const wrap = useRef<HTMLDivElement>(null);
  const box = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const marker = useRef<L.Marker | null>(null);
  const frame = useRef(0);
  const lastUpdate = useRef(performance.now());
  const followRef = useRef(true);
  const [following, setFollowing] = useState(true);
  const [full, setFull] = useState(false);

  const setFollow = useCallback((value: boolean) => {
    followRef.current = value;
    setFollowing(value);
  }, []);

  // ── create the map once ────────────────────────────────────────────────
  useEffect(() => {
    if (!box.current) return;
    const m = L.map(box.current).setView([lat, lng], 17);
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    }).addTo(m);
    marker.current = L.marker([lat, lng], { icon: busIcon, title: 'الأتوبيس' }).addTo(m);
    map.current = m;

    m.on('dragstart', () => setFollow(false)); // the user wants to look around
    const resize = new ResizeObserver(() => m.invalidateSize()); // full-screen / rotation
    resize.observe(box.current);

    return () => {
      cancelAnimationFrame(frame.current);
      resize.disconnect();
      m.remove();
      map.current = null;
      marker.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── every new position: glide the marker, keep the bus centred ─────────
  useEffect(() => {
    const m = map.current;
    const mk = marker.current;
    if (!m || !mk) return;
    cancelAnimationFrame(frame.current);

    const from = mk.getLatLng();
    const to = L.latLng(lat, lng);
    const startedAt = performance.now();
    const glide = Math.min(Math.max(startedAt - lastUpdate.current, MIN_GLIDE_MS), MAX_GLIDE_MS);
    lastUpdate.current = startedAt;

    const meters = from.distanceTo(to);
    if (meters < 0.5) return;
    if (meters > 1_000) {
      // far jump (e.g. resumed after a long pause): no point in gliding
      mk.setLatLng(to);
      if (followRef.current) m.panTo(to, { animate: false });
      return;
    }

    const step = () => {
      const k = Math.min(1, (performance.now() - startedAt) / glide);
      const p = L.latLng(from.lat + (to.lat - from.lat) * k, from.lng + (to.lng - from.lng) * k);
      mk.setLatLng(p);
      if (followRef.current) m.panTo(p, { animate: false });
      if (k < 1) frame.current = requestAnimationFrame(step);
    };
    frame.current = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame.current);
  }, [lat, lng]);

  const recenter = () => {
    setFollow(true);
    const mk = marker.current;
    if (mk) map.current?.panTo(mk.getLatLng());
  };

  // ── full screen ────────────────────────────────────────────────────────
  const enterFull = () => {
    setFull(true);
    try {
      void Promise.resolve(wrap.current?.requestFullscreen()).catch(() => undefined);
    } catch {
      /* not supported (iPhone Safari): the CSS full-viewport mode is enough */
    }
  };

  const exitFull = useCallback(() => {
    setFull(false);
    if (document.fullscreenElement) void document.exitFullscreen().catch(() => undefined);
  }, []);

  // the user left the browser's full-screen mode (Esc / back gesture)
  useEffect(() => {
    const onChange = () => {
      if (!document.fullscreenElement) setFull(false);
    };
    document.addEventListener('fullscreenchange', onChange);
    return () => {
      document.removeEventListener('fullscreenchange', onChange);
      if (document.fullscreenElement && document.fullscreenElement === wrap.current) {
        void document.exitFullscreen().catch(() => undefined);
      }
    };
  }, []);

  useEffect(() => {
    if (!full) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') exitFull();
    };
    document.addEventListener('keydown', onKey);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden'; // no page scrolling behind the map
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = previousOverflow;
    };
  }, [full, exitFull]);

  const kmh = speed !== null ? Math.round(speed * 3.6) : null;

  return (
    <div ref={wrap} className={`busMapWrap${full ? ' busMapWrap--full' : ''}`}>
      <div ref={box} className="busMap" dir="ltr" role="img" aria-label="خريطة موقع الأتوبيس" />

      <div className="busMapBtns">
        <button
          type="button"
          className="busMapBtn"
          onClick={full ? exitFull : enterFull}
          aria-label={full ? 'إغلاق ملء الشاشة' : 'ملء الشاشة'}
          title={full ? 'إغلاق ملء الشاشة' : 'ملء الشاشة'}
        >
          {full ? <FiMinimize aria-hidden="true" /> : <FiMaximize aria-hidden="true" />}
        </button>
        {!following && (
          <button
            type="button"
            className="busMapBtn busMapBtn--accent"
            onClick={recenter}
            aria-label="العودة لتتبع الأتوبيس"
            title="العودة لتتبع الأتوبيس"
          >
            <FiCrosshair aria-hidden="true" />
          </button>
        )}
        {full && (
          <a
            className="busMapBtn"
            href={`https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}&travelmode=driving`}
            target="_blank"
            rel="noopener noreferrer"
            aria-label="فتح في خرائط جوجل"
            title="فتح في خرائط جوجل"
          >
            <FiNavigation aria-hidden="true" />
          </a>
        )}
      </div>

      <div className="busMapInfo">
        {info}
        {kmh !== null && (
          <>
            {' · '}
            <bdi>{kmh} كم/س</bdi>
          </>
        )}
      </div>
    </div>
  );
}
