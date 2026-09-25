import { useEffect, useRef } from 'react';
import AppleMaps from '../plugins/appleMaps';

function rectPayload(el) {
  const r = el.getBoundingClientRect();
  return {
    x: r.left,
    y: r.top,
    width: r.width,
    height: r.height,
  };
}

function toNativePoints(points = [], livePosition = null) {
  const out = [];
  for (const p of points) {
    const lat = Number(p.latitude);
    const lng = Number(p.longitude);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
    out.push({ latitude: lat, longitude: lng });
  }
  if (
    livePosition &&
    Number.isFinite(livePosition.latitude) &&
    Number.isFinite(livePosition.longitude)
  ) {
    const last = out[out.length - 1];
    if (
      !last ||
      last.latitude !== livePosition.latitude ||
      last.longitude !== livePosition.longitude
    ) {
      out.push({
        latitude: livePosition.latitude,
        longitude: livePosition.longitude,
      });
    }
  }
  return out;
}

/**
 * iOS: нативная Apple Maps (MKMapView) поверх WebView.
 * Без Carto / Esri / OSM / Leaflet.
 */
export default function NativeAppleWorkoutMap({
  points = [],
  livePosition = null,
  followUser = true,
  className = '',
}) {
  const hostRef = useRef(null);
  const readyRef = useRef(false);
  const lastRouteKey = useRef('');

  useEffect(() => {
    let cancelled = false;
    let raf = 0;
    const el = hostRef.current;
    if (!el) return undefined;

    const syncFrame = async () => {
      if (!readyRef.current || !hostRef.current) return;
      try {
        await AppleMaps.setFrame(rectPayload(hostRef.current));
      } catch {
        /* ignore */
      }
    };

    const boot = async () => {
      try {
        const frame = rectPayload(el);
        await AppleMaps.create({
          ...frame,
          followUser,
          points: toNativePoints(points, livePosition),
        });
        if (cancelled) {
          await AppleMaps.destroy().catch(() => {});
          return;
        }
        readyRef.current = true;
        lastRouteKey.current = '';
        await syncFrame();
      } catch (err) {
        console.warn('[AppleMaps] create failed', err);
      }
    };

    boot();

    const onScroll = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(syncFrame);
    };
    window.addEventListener('resize', onScroll);
    window.addEventListener('scroll', onScroll, true);
    document.addEventListener('ionScroll', onScroll, true);

    let ro;
    if (typeof ResizeObserver !== 'undefined') {
      ro = new ResizeObserver(onScroll);
      ro.observe(el);
    }

    return () => {
      cancelled = true;
      readyRef.current = false;
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', onScroll);
      window.removeEventListener('scroll', onScroll, true);
      document.removeEventListener('ionScroll', onScroll, true);
      ro?.disconnect();
      AppleMaps.destroy().catch(() => {});
    };
    // mount once per screen
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!readyRef.current) return;
    AppleMaps.setFollowUser({ follow: followUser }).catch(() => {});
  }, [followUser]);

  useEffect(() => {
    if (!readyRef.current) return;
    const nativePoints = toNativePoints(points, livePosition);
    const key = nativePoints.map((p) => `${p.latitude.toFixed(5)},${p.longitude.toFixed(5)}`).join('|');
    if (key === lastRouteKey.current) return;
    lastRouteKey.current = key;
    AppleMaps.setRoute({ points: nativePoints, fit: !followUser }).catch(() => {});
  }, [points, livePosition, followUser]);

  useEffect(() => {
    const hide = () => AppleMaps.setVisible({ visible: false }).catch(() => {});
    const show = () => AppleMaps.setVisible({ visible: true }).catch(() => {});
    document.addEventListener('ionViewWillLeave', hide);
    document.addEventListener('ionViewDidEnter', show);
    return () => {
      document.removeEventListener('ionViewWillLeave', hide);
      document.removeEventListener('ionViewDidEnter', show);
    };
  }, []);

  return (
    <div
      ref={hostRef}
      className={`rb-workout-map rb-workout-map--apple ${className}`.trim()}
      aria-label="Apple Maps"
    >
      <div className="rb-workout-map__apple-slot" />
    </div>
  );
}
