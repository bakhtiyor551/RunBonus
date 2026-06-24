import { useEffect } from 'react';
import { MapContainer, TileLayer, Polyline, CircleMarker, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

function FitRoute({ points, interactive }) {
  const map = useMap();

  useEffect(() => {
    if (!points?.length) return;
    if (points.length === 1) {
      map.setView([points[0].latitude, points[0].longitude], interactive ? 16 : 15);
      return;
    }
    const bounds = L.latLngBounds(points.map((p) => [p.latitude, p.longitude]));
    map.fitBounds(bounds, { padding: [24, 24], maxZoom: interactive ? 17 : 16 });
  }, [points, map, interactive]);

  return null;
}

export default function WorkoutMap({ points = [], livePosition = null, interactive = true, className = '' }) {
  const track = points.filter((p) => Number.isFinite(p.latitude) && Number.isFinite(p.longitude));
  const hasLive =
    livePosition &&
    Number.isFinite(livePosition.latitude) &&
    Number.isFinite(livePosition.longitude);
  const displayTrack =
    track.length > 0 ? track : hasLive ? [livePosition] : [];
  const positions = displayTrack.map((p) => [p.latitude, p.longitude]);
  const center = displayTrack.length
    ? [displayTrack[displayTrack.length - 1].latitude, displayTrack[displayTrack.length - 1].longitude]
    : [38.5598, 68.787];

  return (
    <div className={`rb-workout-map ${className}`.trim()}>
      <MapContainer
        center={center}
        zoom={15}
        scrollWheelZoom={interactive}
        dragging={interactive}
        zoomControl={interactive}
        touchZoom={interactive}
        doubleClickZoom={interactive}
        style={{ height: '100%', width: '100%' }}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        {positions.length >= 2 && (
          <Polyline positions={positions} pathOptions={{ color: '#c3f400', weight: 4, opacity: 0.95 }} />
        )}
        {track.length > 0 && (
          <CircleMarker
            center={[track[track.length - 1].latitude, track[track.length - 1].longitude]}
            radius={7}
            pathOptions={{ color: '#131313', weight: 2, fillColor: '#c3f400', fillOpacity: 1 }}
          />
        )}
        {track.length === 0 && hasLive && (
          <CircleMarker
            center={[livePosition.latitude, livePosition.longitude]}
            radius={8}
            pathOptions={{ color: '#131313', weight: 2, fillColor: '#00d4ff', fillOpacity: 0.9 }}
          />
        )}
        <FitRoute points={displayTrack} interactive={interactive} />
      </MapContainer>
      {!displayTrack.length && (
        <div className="rb-workout-map__placeholder">
          <span>GPS ожидает сигнал…</span>
        </div>
      )}
    </div>
  );
}
