import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { useEffect, useRef } from 'react';

// A divIcon avoids Leaflet's default marker images, which bundlers do not resolve.
const busIcon = L.divIcon({
  className: '',
  html: '<div class="busMarker">🚌</div>',
  iconSize: [40, 40],
  iconAnchor: [20, 20],
});

/** Live map (OpenStreetMap tiles). The marker moves as new positions arrive. */
export default function BusMap({ lat, lng }: { lat: number; lng: number }) {
  const box = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const marker = useRef<L.Marker | null>(null);

  useEffect(() => {
    if (!box.current) return;
    const m = L.map(box.current).setView([lat, lng], 16);
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    }).addTo(m);
    marker.current = L.marker([lat, lng], { icon: busIcon, title: 'الأتوبيس' }).addTo(m);
    map.current = m;
    return () => {
      m.remove();
      map.current = null;
      marker.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    marker.current?.setLatLng([lat, lng]);
    const m = map.current;
    // Follow the bus only when it leaves the visible area, so manual panning is not fought.
    if (m && !m.getBounds().contains([lat, lng])) m.panTo([lat, lng]);
  }, [lat, lng]);

  return <div ref={box} className="busMap" dir="ltr" role="img" aria-label="خريطة موقع الأتوبيس" />;
}
