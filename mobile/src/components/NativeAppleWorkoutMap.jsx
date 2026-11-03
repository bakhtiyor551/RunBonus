import { useEffect, useRef } from 'react';
import AppleMaps from '../plugins/appleMaps';

function slotEl(el) {
  return (
    el?.closest('.rb-workout-live__map') ||
    el?.closest('.rb-workout-layout__map') ||
    el?.closest('.rb-result-screen__map') ||
    el?.closest('.rb-workout-detail-map') ||
    el
  );
}

/** Точный rect HTML-слота = frame нативной карты (1:1). */
function rectPayload(el) {
  const slot = slotEl(el);
  if (!slot) return null;
  const r = slot.getBoundingClientRect();
  if (r.width < 8 || r.height < 8) return null;

  // Для fullscreen-карты берём реальную высоту слота
  const height = Math.min(Math.max(Math.round(r.height), 160), Math.round(window.innerHeight));

  return {
    x: Math.max(0, Math.round(r.left)),
    y: Math.max(0, Math.round(r.top)),
    width: Math.round(r.width) || Math.round(window.innerWidth),
    height,
    maxHeight: height,
  };
}

export function toFlatCoords(points = [], livePosition = null, { includeLive = true } = {}) {
  const coords = [];
  let lastLat = null;
  let lastLng = null;
  const push = (lat, lng) => {
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
    if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return;
    if (lastLat != null && Math.abs(lastLat - lat) < 1e-7 && Math.abs(lastLng - lng) < 1e-7) return;
    coords.push(lat, lng);
    lastLat = lat;
    lastLng = lng;
  };
  for (const p of points) {
    push(Number(p.latitude ?? p.lat), Number(p.longitude ?? p.lng ?? p.lon));
  }
  if (includeLive && livePosition) {
    push(Number(livePosition.latitude), Number(livePosition.longitude));
  }
  return coords;
}

function routeKey(coords) {
  if (!coords.length) return '';
  const n = coords.length;
  return `${n}:${coords[0].toFixed(5)},${coords[1].toFixed(5)}:${coords[n - 2].toFixed(5)},${coords[n - 1].toFixed(5)}`;
}

export default function NativeAppleWorkoutMap({
  points = [],
  livePosition = null,
  followUser = true,
  includeLive = true,
  className = '',
}) {
  const hostRef = useRef(null);
  const readyRef = useRef(false);
  const lastRouteKey = useRef('');
  const lastFrameKey = useRef('');
  const latestRef = useRef({ points, livePosition, followUser, includeLive });
  latestRef.current = { points, livePosition, followUser, includeLive };

  useEffect(() => {
    let cancelled = false;
    let raf = 0;
    let pollId = 0;
    const el = hostRef.current;
    if (!el) return undefined;

    const syncFrame = async (force = false) => {
      if (!readyRef.current || !hostRef.current) return;
      const frame = rectPayload(hostRef.current);
      if (!frame) return;

      const onScreen = frame.y < window.innerHeight - 40 && frame.y + frame.height > 40;
      try {
        await AppleMaps.setVisible({ visible: onScreen });
      } catch {
        /* ignore */
      }
      if (!onScreen) return;

      const key = `${frame.x},${frame.y},${frame.width},${frame.height}`;
      if (!force && key === lastFrameKey.current) return;
      lastFrameKey.current = key;
      try {
        await AppleMaps.setFrame(frame);
      } catch {
        /* ignore */
      }
    };

    const pushRoute = async (fit) => {
      const { points: pts, livePosition: live, followUser: follow, includeLive: withLive } =
        latestRef.current;
      const coords = toFlatCoords(pts, live, { includeLive: withLive !== false });
      const key = routeKey(coords);
      if (key === lastRouteKey.current && !fit) return;
      lastRouteKey.current = key;
      try {
        await AppleMaps.setRoute({ coords, fit: fit ?? !follow });
      } catch {
        /* ignore */
      }
    };

    const boot = async () => {
      try {
        await new Promise((r) => setTimeout(r, 150));
        await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
        if (cancelled || !hostRef.current) return;

        const frame = rectPayload(hostRef.current);
        if (!frame) return;

        const { points: pts, livePosition: live, followUser: follow, includeLive: withLive } =
          latestRef.current;
        const coords = toFlatCoords(pts, live, { includeLive: withLive !== false });

        await AppleMaps.create({ ...frame, followUser: follow, coords });
        if (cancelled) {
          await AppleMaps.destroy().catch(() => {});
          return;
        }
        readyRef.current = true;
        lastFrameKey.current = `${frame.x},${frame.y},${frame.width},${frame.height}`;
        lastRouteKey.current = routeKey(coords);
        await syncFrame(true);
        await pushRoute(!follow);
      } catch (err) {
        console.warn('[AppleMaps] create failed', err);
      }
    };

    boot();

    const onLayout = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => syncFrame(false));
    };
    window.addEventListener('resize', onLayout);
    window.addEventListener('scroll', onLayout, true);
    document.addEventListener('ionScroll', onLayout, true);

    let ro;
    if (typeof ResizeObserver !== 'undefined') {
      ro = new ResizeObserver(onLayout);
      const slot = slotEl(el);
      if (slot) ro.observe(slot);
    }

    pollId = window.setInterval(() => syncFrame(false), 350);
    const stopPoll = window.setTimeout(() => {
      clearInterval(pollId);
      pollId = 0;
    }, 8000);

    return () => {
      cancelled = true;
      readyRef.current = false;
      cancelAnimationFrame(raf);
      clearInterval(pollId);
      clearTimeout(stopPoll);
      window.removeEventListener('resize', onLayout);
      window.removeEventListener('scroll', onLayout, true);
      document.removeEventListener('ionScroll', onLayout, true);
      ro?.disconnect();
      AppleMaps.destroy().catch(() => {});
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!readyRef.current) return;
    AppleMaps.setFollowUser({ follow: followUser }).catch(() => {});
  }, [followUser]);

  useEffect(() => {
    if (!readyRef.current) return;
    const coords = toFlatCoords(points, livePosition, { includeLive });
    const key = routeKey(coords);
    if (key === lastRouteKey.current) return;
    lastRouteKey.current = key;
    AppleMaps.setRoute({ coords, fit: !followUser }).catch(() => {});
  }, [points, livePosition, followUser, includeLive]);

  return (
    <div
      ref={hostRef}
      className={`rb-workout-map rb-workout-map--apple ${className}`.trim()}
      aria-label="Apple Maps"
    />
  );
}
