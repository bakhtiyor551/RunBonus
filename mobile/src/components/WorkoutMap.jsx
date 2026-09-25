import { memo, useEffect, useRef } from 'react';
import { MapContainer, TileLayer, Polyline, CircleMarker, useMap } from 'react-leaflet';
import { Capacitor } from '@capacitor/core';
import 'leaflet/dist/leaflet.css';

function FollowLive({ lat, lng, interactive }) {
  const map = useMap();
  const fittedRef = useRef(false);

  useEffect(() => {
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
    if (!fittedRef.current) {
      map.setView([lat, lng], interactive ? 16 : 15, { animate: false });
      fittedRef.current = true;
      return;
    }
    map.panTo([lat, lng], { animate: true, duration: 0.4 });
  }, [lat, lng, map, interactive]);

  return null;
}

function WorkoutMap({ points = [], livePosition = null, interactive = true, className = '' }) {
  const track = points.filter((p) => Number.isFinite(p.latitude) && Number.isFinite(p.longitude));
  const hasLive =
    livePosition &&
    Number.isFinite(livePosition.latitude) &&
    Number.isFinite(livePosition.longitude);
  const displayTrack = track.length > 0 ? track : hasLive ? [livePosition] : [];
  const last = displayTrack[displayTrack.length - 1];
  const positions = displayTrack.map((p) => [p.latitude, p.longitude]);
  const center = last ? [last.latitude, last.longitude] : [38.5598, 68.787];
  const followLat = hasLive ? livePosition.latitude : last?.latitude;
  const followLng = hasLive ? livePosition.longitude : last?.longitude;

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
        preferCanvas
        style={{ height: '100%', width: '100%' }}
      >
        <TileLayer
          attribution='&copy; Apple / OSM'
          url={
            Capacitor.getPlatform() === 'ios'
              ? 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png'
              : 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png'
          }
          subdomains="abcd"
        />
        {positions.length >= 2 && (
          <Polyline
            positions={positions}
            pathOptions={{ color: '#c3f400', weight: 4, opacity: 0.95 }}
          />
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
        <FollowLive lat={followLat} lng={followLng} interactive={interactive} />
      </MapContainer>
      {!displayTrack.length && (
        <div className="rb-workout-map__placeholder">
          <span>GPS ожидает сигнал…</span>
        </div>
      )}
    </div>
  );
}

export default memo(WorkoutMap);
