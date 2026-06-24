import { useCallback, useEffect, useRef, useState } from 'react';

const RECONNECT_MS = 5000;
const WS_PATH = '/admin/live-tracking';

function resolveWsBase() {
  const fromEnv = import.meta.env.VITE_API_URL;
  if (fromEnv) return fromEnv.replace(/\/$/, '');

  if (import.meta.env.PROD) {
    return 'https://runbonus.online';
  }

  if (typeof window !== 'undefined') {
    const port = window.location.port;
    if (port === '5174' || port === '4174') {
      const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      return `${proto}//${window.location.host}`;
    }
  }

  return 'https://runbonus.online';
}

function buildWsUrl(token) {
  const base = resolveWsBase();
  const wsBase = base.replace(/^http/i, 'ws');
  return `${wsBase}${WS_PATH}?token=${encodeURIComponent(token)}`;
}

function applyPointReceived(workouts, event) {
  const id = Number(event.workout_id);
  const idx = workouts.findIndex((w) => w.workout_id === id);
  const incoming = (event.points || []).map((p) => ({
    lat: Number(p.lat ?? p.latitude),
    lng: Number(p.lng ?? p.longitude),
    speed: p.speed,
    accuracy: p.accuracy,
    recorded_at: p.recorded_at,
  }));

  if (!incoming.length) return workouts;

  if (idx === -1) {
    const last = incoming[incoming.length - 1];
    return [
      ...workouts,
      {
        workout_id: id,
        distance_km: event.distance_km ?? 0,
        points_count: incoming.length,
        last_position: { lat: last.lat, lng: last.lng },
        points: incoming,
        client_name: event.client_name || 'Бегун',
        phone: event.phone || '',
        elapsed_seconds: 0,
      },
    ];
  }

  const next = [...workouts];
  const row = { ...next[idx] };
  const existing = row.points ?? [];
  row.points = [...existing, ...incoming];
  row.points_count = row.points.length;
  row.distance_km = event.distance_km ?? row.distance_km;
  const last = incoming[incoming.length - 1];
  row.last_position = { lat: last.lat, lng: last.lng };
  row.last_point_at = last.recorded_at;
  next[idx] = row;
  return next;
}

/**
 * WebSocket live-трекинг для админки.
 * @param {boolean} enabled — подключаться только когда вкладка Live GPS активна
 */
export function useWorkoutLiveSocket(enabled = true) {
  const [live, setLive] = useState({ workouts: [], updated_at: null });
  const [status, setStatus] = useState('idle');
  const [error, setError] = useState('');
  const wsRef = useRef(null);
  const reconnectRef = useRef(null);
  const enabledRef = useRef(enabled);

  enabledRef.current = enabled;

  const connect = useCallback(() => {
    if (!enabledRef.current) return;

    const token = localStorage.getItem('adminToken');
    if (!token) {
      setStatus('error');
      setError('Нет токена администратора');
      return;
    }

    if (wsRef.current?.readyState === WebSocket.OPEN) return;

    setStatus((s) => (s === 'connected' ? s : 'connecting'));

    const ws = new WebSocket(buildWsUrl(token));
    wsRef.current = ws;

    ws.onopen = () => {
      setStatus('connected');
      setError('');
    };

    ws.onmessage = (ev) => {
      let msg;
      try {
        msg = JSON.parse(ev.data);
      } catch {
        return;
      }

      if (msg.type === 'live_snapshot') {
        setLive({
          workouts: msg.workouts ?? [],
          updated_at: msg.updated_at ?? new Date().toISOString(),
        });
        return;
      }

      if (msg.type === 'point_received') {
        setLive((prev) => ({
          workouts: applyPointReceived(prev.workouts ?? [], msg),
          updated_at: new Date().toISOString(),
        }));
        return;
      }

      if (msg.type === 'workout_started' && msg.workout) {
        setLive((prev) => {
          const exists = prev.workouts?.some((w) => w.workout_id === msg.workout.workout_id);
          if (exists) return prev;
          return {
            workouts: [msg.workout, ...(prev.workouts ?? [])],
            updated_at: new Date().toISOString(),
          };
        });
        return;
      }

      if (msg.type === 'workout_closed') {
        setLive((prev) => ({
          workouts: (prev.workouts ?? []).filter((w) => w.workout_id !== msg.workout_id),
          updated_at: new Date().toISOString(),
        }));
      }
    };

    ws.onerror = () => {
      setError('Ошибка WebSocket');
    };

    ws.onclose = () => {
      wsRef.current = null;
      if (!enabledRef.current) {
        setStatus('idle');
        return;
      }
      setStatus('reconnecting');
      clearTimeout(reconnectRef.current);
      reconnectRef.current = setTimeout(connect, RECONNECT_MS);
    };
  }, []);

  const disconnect = useCallback(() => {
    clearTimeout(reconnectRef.current);
    if (wsRef.current) {
      wsRef.current.onclose = null;
      wsRef.current.close();
      wsRef.current = null;
    }
    setStatus('idle');
  }, []);

  useEffect(() => {
    if (enabled) {
      connect();
    } else {
      disconnect();
    }
    return () => disconnect();
  }, [enabled, connect, disconnect]);

  return { live, status, error, reconnect: connect };
}

export { RECONNECT_MS };
