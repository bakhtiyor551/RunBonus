import { memo, useEffect, useMemo } from 'react';
import { MapContainer, TileLayer, Polyline, CircleMarker, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';

const GRADIENT = ['#ff2d55', '#ff6b2d', '#ffcc00', '#c3f400', '#00e5bc', '#00d4ff'];

function FitTrack({ positions }) {
  const map = useMap();
  useEffect(() => {
    if (!positions?.length) return;
    if (positions.length === 1) {
      map.setView(positions[0], 15, { animate: false });
      return;
    }
    map.fitBounds(positions, { padding: [48, 48], maxZoom: 16, animate: false });
  }, [map, positions]);
  return null;
}

function segmentColor(i, total) {
  if (total <= 1) return GRADIENT[GRADIENT.length - 1];
  const t = i / (total - 1);
  const idx = Math.min(GRADIENT.length - 1, Math.floor(t * (GRADIENT.length - 1)));
  return GRADIENT[idx];
}

/**
 * Карта результата: тёмные тайлы + градиентный трек.
 */
function WorkoutResultMap({ points = [], className = '' }) {
  const track = useMemo(
    () => points.filter((p) => Number.isFinite(p.latitude) && Number.isFinite(p.longitude)),
    [points]
  );
  const positions = useMemo(() => track.map((p) => [p.latitude, p.longitude]), [track]);
  const center = positions[0] || [38.5598, 68.787];
  const start = positions[0];
  const end = positions[positions.length - 1];

  const segments = useMemo(() => {
    if (positions.length < 2) return [];
    const out = [];
    const step = Math.max(1, Math.floor(positions.length / 40));
    for (let i = 0; i < positions.length - 1; i += step) {
      const j = Math.min(positions.length - 1, i + step);
      out.push({
        key: `${i}-${j}`,
        positions: positions.slice(i, j + 1),
        color: segmentColor(i, positions.length),
      });
    }
    return out;
  }, [positions]);

  return (
    <div className={`rb-workout-map rb-result-map ${className}`.trim()}>
      <MapContainer
        center={center}
        zoom={14}
        scrollWheelZoom={false}
        dragging
        zoomControl={false}
        touchZoom
        doubleClickZoom={false}
        preferCanvas
        style={{ height: '100%', width: '100%' }}
        attributionControl={false}
      >
        <TileLayer
          url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
          subdomains="abcd"
        />
        {segments.map((seg) => (
          <Polyline
            key={seg.key}
            positions={seg.positions}
            pathOptions={{ color: seg.color, weight: 5, opacity: 0.95, lineCap: 'round' }}
          />
        ))}
        {start && (
          <CircleMarker
            center={start}
            radius={8}
            pathOptions={{ color: '#fff', weight: 3, fillColor: '#ff2d55', fillOpacity: 1 }}
          />
        )}
        {end && (
          <CircleMarker
            center={end}
            radius={10}
            pathOptions={{ color: '#c3f400', weight: 3, fillColor: '#111', fillOpacity: 1 }}
          />
        )}
        <FitTrack positions={positions} />
      </MapContainer>
    </div>
  );
}

export default memo(WorkoutResultMap);
