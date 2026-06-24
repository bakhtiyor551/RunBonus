import { useEffect, useRef } from 'react';

const TRACK_COLORS = ['#c3f400', '#00d4ff', '#bf5af2', '#ff9f0a', '#ff453a', '#64d2ff'];

export function trackColor(index) {
  return TRACK_COLORS[index % TRACK_COLORS.length];
}

function formatPopup(track) {
  const dist = Number(track.distance_km || 0).toFixed(2);
  const pts = track.points_count ?? track.points?.length ?? 0;
  const waiting = pts === 0 ? '<br/><em>GPS ожидает сигнал…</em>' : '';
  return `<strong>${track.client_name || 'Клиент'}</strong><br/>${track.phone || ''}<br/>${dist} км · ${pts} точек${waiting}`;
}

export default function WorkoutLiveMap({
  tracks = [],
  height = 420,
  focusWorkoutId = null,
  className = '',
}) {
  const mapRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const layersRef = useRef([]);

  useEffect(() => {
    if (!window.L || !mapRef.current) return undefined;

    if (!mapInstanceRef.current) {
      mapInstanceRef.current = window.L.map(mapRef.current, { zoomControl: true });
      window.L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a>',
        maxZoom: 19,
      }).addTo(mapInstanceRef.current);
    }

    const map = mapInstanceRef.current;
    for (const layer of layersRef.current) {
      map.removeLayer(layer);
    }
    layersRef.current = [];

    const allLatLngs = [];
    tracks.forEach((track, index) => {
      const color = track.color || trackColor(index);
      const points = track.points ?? [];
      if (!points.length) return;

      const latlngs = points.map((p) => [p.lat, p.lng]);
      if (latlngs.length >= 2) {
        const line = window.L.polyline(latlngs, { color, weight: 4, opacity: 0.9 });
        line.addTo(map);
        layersRef.current.push(line);
      }

      const last = latlngs[latlngs.length - 1];
      const marker = window.L.circleMarker(last, {
        radius: 9,
        color: '#131313',
        weight: 2,
        fillColor: color,
        fillOpacity: 1,
      }).bindPopup(formatPopup(track));
      marker.addTo(map);
      layersRef.current.push(marker);
      allLatLngs.push(...latlngs);
    });

    if (!allLatLngs.length) {
      map.setView([38.5598, 68.787], 12);
      return undefined;
    }

    if (focusWorkoutId) {
      const focused = tracks.find((t) => t.workout_id === focusWorkoutId);
      const pts = focused?.points ?? [];
      if (pts.length) {
        const last = pts[pts.length - 1];
        map.setView([last.lat, last.lng], 16);
        return undefined;
      }
    }

    map.fitBounds(window.L.latLngBounds(allLatLngs), { padding: [48, 48], maxZoom: 16 });
    return undefined;
  }, [tracks, focusWorkoutId]);

  useEffect(
    () => () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
      layersRef.current = [];
    },
    []
  );

  return (
    <div
      ref={mapRef}
      className={`workout-live-map ${className}`.trim()}
      style={{ height }}
      aria-label="Карта live GPS"
    />
  );
}
