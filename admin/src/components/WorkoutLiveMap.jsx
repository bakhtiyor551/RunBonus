import { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

const TRACK_COLORS = ['#c3f400', '#00d4ff', '#bf5af2', '#ff9f0a', '#ff453a', '#64d2ff'];
const DEFAULT_CENTER = [38.5598, 68.787];

export function trackColor(index) {
  return TRACK_COLORS[index % TRACK_COLORS.length];
}

function formatPopup(track) {
  const dist = Number(track.distance_km || 0).toFixed(2);
  const pts = track.points_count ?? track.points?.length ?? 0;
  const waiting = pts === 0 ? '<br/><em>GPS ожидает сигнал…</em>' : '';
  return `<strong>${track.client_name || 'Клиент'}</strong><br/>${track.phone || ''}<br/>${dist} км · ${pts} точек${waiting}`;
}

function pointKey(p) {
  return `${p.lat},${p.lng},${p.recorded_at ?? ''}`;
}

export default function WorkoutLiveMap({
  tracks = [],
  height = 420,
  focusWorkoutId = null,
  className = '',
}) {
  const mapRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const trackLayersRef = useRef(new Map());

  useEffect(() => {
    if (!mapRef.current) return undefined;

    if (!mapInstanceRef.current) {
      mapInstanceRef.current = L.map(mapRef.current, { zoomControl: true });
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a>',
        maxZoom: 19,
      }).addTo(mapInstanceRef.current);
    }

    const map = mapInstanceRef.current;
    const activeIds = new Set(tracks.map((t) => t.workout_id));

    for (const [id, layers] of trackLayersRef.current.entries()) {
      if (!activeIds.has(id)) {
        layers.line?.remove();
        layers.marker?.remove();
        trackLayersRef.current.delete(id);
      }
    }

    const allLatLngs = [];

    tracks.forEach((track, index) => {
      const color = track.color || trackColor(index);
      const points = track.points ?? [];
      if (!points.length) return;

      const latlngs = points.map((p) => [p.lat, p.lng]);
      allLatLngs.push(...latlngs);

      let layers = trackLayersRef.current.get(track.workout_id);
      if (!layers) {
        const line = L.polyline([], { color, weight: 4, opacity: 0.9 }).addTo(map);
        const marker = L.circleMarker(latlngs[0], {
          radius: 9,
          color: '#131313',
          weight: 2,
          fillColor: color,
          fillOpacity: 1,
        })
          .bindPopup(formatPopup(track))
          .addTo(map);
        layers = { line, marker, lastCount: 0, seen: new Set() };
        trackLayersRef.current.set(track.workout_id, layers);
      }

      layers.marker.setPopupContent(formatPopup(track));

      if (points.length < layers.lastCount) {
        layers.line.setLatLngs(latlngs);
        layers.seen = new Set(points.map(pointKey));
        layers.lastCount = points.length;
      } else if (points.length > layers.lastCount) {
        const newPoints = points.slice(layers.lastCount);
        for (const p of newPoints) {
          const key = pointKey(p);
          if (layers.seen.has(key)) continue;
          layers.seen.add(key);
          const ll = [p.lat, p.lng];
          const current = layers.line.getLatLngs();
          layers.line.setLatLngs([...current, ll]);
        }
        layers.lastCount = points.length;
      } else if (points.length === 1 && layers.lastCount === 1) {
        layers.marker.setLatLng(latlngs[0]);
      }

      const last = latlngs[latlngs.length - 1];
      layers.marker.setLatLng(last);
    });

    window.setTimeout(() => map.invalidateSize(), 0);

    if (!allLatLngs.length) {
      map.setView(DEFAULT_CENTER, 12);
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

    if (tracks.length === 1 && allLatLngs.length <= 3) {
      const last = allLatLngs[allLatLngs.length - 1];
      map.setView(last, 15);
    }

    return undefined;
  }, [tracks, focusWorkoutId]);

  useEffect(
    () => () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
      trackLayersRef.current.clear();
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
