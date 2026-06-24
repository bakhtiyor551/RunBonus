import { useEffect } from 'react';
import { MapContainer, TileLayer, Polyline, CircleMarker, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

function FitRoute({ points, trackKey }) {
  const map = useMap();

  useEffect(() => {
    if (!points.length) return;
    const timer = window.setTimeout(() => {
      map.invalidateSize();
      if (points.length === 1) {
        map.setView(points[0], 16);
        return;
      }
      map.fitBounds(L.latLngBounds(points), { padding: [32, 32], maxZoom: 17 });
    }, 0);
    return () => window.clearTimeout(timer);
  }, [points, trackKey, map]);

  return null;
}

function toPosition(point) {
  const lat = Number(point.lat ?? point.latitude);
  const lng = Number(point.lng ?? point.longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return [lat, lng];
}

export default function WorkoutRouteMap({ points = [], live = false, className = '' }) {
  const positions = points.map(toPosition).filter(Boolean);

  if (!positions.length) {
    return (
      <div className={`workout-route-map workout-route-map--empty ${className}`.trim()}>
        {live && (
          <span className="workout-route-map__live-badge">
            <span className="stat-card__live-dot" />
            Live GPS
          </span>
        )}
        <p className="hint">
          {live
            ? 'Ожидание GPS-сигнала… точки появятся на карте автоматически'
            : 'Нет координат для отображения на карте'}
        </p>
      </div>
    );
  }

  const start = positions[0];
  const end = positions[positions.length - 1];
  const trackKey = positions.map((p) => p.join(',')).join('|');

  return (
    <div className={`workout-route-map ${className}`.trim()}>
      {live && (
        <span className="workout-route-map__live-badge">
          <span className="stat-card__live-dot" />
          Live GPS
        </span>
      )}
      <MapContainer
        center={end}
        zoom={15}
        scrollWheelZoom
        style={{ height: '100%', width: '100%' }}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        {positions.length >= 2 && (
          <Polyline
            positions={positions}
            pathOptions={{ color: '#c3f400', weight: 4, opacity: 0.95 }}
          />
        )}
        <CircleMarker
          center={start}
          radius={6}
          pathOptions={{ color: '#e2e2e2', weight: 2, fillColor: '#22c55e', fillOpacity: 1 }}
        />
        {positions.length > 1 && (
          <CircleMarker
            center={end}
            radius={7}
            pathOptions={{ color: '#131313', weight: 2, fillColor: '#c3f400', fillOpacity: 1 }}
          />
        )}
        <FitRoute points={positions} trackKey={trackKey} />
      </MapContainer>
      <div className="workout-route-map__legend">
        <span className="workout-route-map__legend-item workout-route-map__legend-item--start">Старт</span>
        <span className="workout-route-map__legend-item workout-route-map__legend-item--end">Финиш</span>
      </div>
    </div>
  );
}
