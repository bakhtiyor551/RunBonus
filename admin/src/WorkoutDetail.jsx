import { useCallback, useEffect, useMemo, useState } from 'react';
import { adminApi } from './api';
import WorkoutLiveMap, { trackColor } from './components/WorkoutLiveMap';
import Icon from './components/Icon';
import { useLiveTracking } from './context/LiveTrackingContext';

function formatDuration(seconds) {
  const s = Math.max(0, Number(seconds) || 0);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return [h, m, sec].map((n) => String(n).padStart(2, '0')).join(':');
}

export default function WorkoutDetail({ workoutId, onClose }) {
  const [data, setData] = useState(null);
  const [liveRest, setLiveRest] = useState(null);
  const { live: liveSnapshot, status: wsStatus } = useLiveTracking();
  const [error, setError] = useState('');

  const live = useMemo(() => {
    const fromWs = liveSnapshot.workouts?.find((w) => w.workout_id === Number(workoutId));
    if (fromWs) return fromWs;
    if (liveRest?.workout_id === Number(workoutId)) return liveRest;
    return null;
  }, [liveSnapshot.workouts, liveRest, workoutId]);

  const loadLiveRest = useCallback(async () => {
    if (!workoutId) return;
    try {
      const payload = await adminApi('/api/admin/workouts/live');
      const row = payload.workouts?.find((w) => w.workout_id === Number(workoutId));
      setLiveRest(row ?? null);
    } catch {
      /* ignore */
    }
  }, [workoutId]);

  const loadDetail = useCallback(async () => {
    if (!workoutId) return;
    try {
      const next = await adminApi(`/api/admin/workouts/${workoutId}`);
      setData(next);
      setError('');
    } catch (e) {
      setError(e.message);
    }
  }, [workoutId]);

  useEffect(() => {
    if (!workoutId) return undefined;
    setError('');
    setData(null);
    loadDetail();
  }, [workoutId, loadDetail]);

  const isLive = data?.workout?.status === 'in_progress';

  useEffect(() => {
    if (!workoutId || !isLive || wsStatus === 'connected') return undefined;
    loadLiveRest();
    const timer = window.setInterval(loadLiveRest, 4000);
    return () => window.clearInterval(timer);
  }, [workoutId, isLive, wsStatus, loadLiveRest]);

  useEffect(() => {
    if (!workoutId || !isLive) return undefined;
    const timer = window.setInterval(loadDetail, 30000);
    return () => window.clearInterval(timer);
  }, [workoutId, isLive, loadDetail]);

  const mapTrack = useMemo(() => {
    const rawPoints = live?.points?.length
      ? live.points
      : live?.last_position
        ? [{ lat: live.last_position.lat, lng: live.last_position.lng }]
        : data?.points ?? [];

    const points = rawPoints.map((p) => ({
      lat: Number(p.lat ?? p.latitude),
      lng: Number(p.lng ?? p.longitude),
    })).filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lng));

    if (!points.length) return [];
    return [
      {
        workout_id: Number(workoutId),
        client_name: data?.workout?.client_name,
        phone: data?.workout?.phone,
        distance_km: live?.distance_km ?? data?.workout?.distance_km,
        points_count: points.length,
        points,
        color: trackColor(0),
      },
    ];
  }, [live, data, workoutId]);

  if (!workoutId) return null;
  if (error && !data) {
    return (
      <div className="sub-card">
        <p className="error-text">{error}</p>
      </div>
    );
  }
  if (!data) {
    return (
      <div className="sub-card">
        <p>Загрузка…</p>
      </div>
    );
  }

  const w = data.workout;
  const lim = data.limits;
  const distanceKm = live?.distance_km ?? w.distance_km;
  const elapsed = live?.elapsed_seconds ?? w.duration_seconds;
  const pointsCount = live?.points_count ?? data.points.length;
  const hasMapPosition = mapTrack.length > 0;

  return (
    <div className="sub-card workout-detail">
      <button type="button" className="btn btn--ghost btn--sm" onClick={onClose}>
        <Icon name="arrow_back" />
        Назад к списку
      </button>

      <div className="workout-detail__head">
        <h3>
          Тренировка #{w.id} — {w.client_name}
          {isLive && (
            <span className="chip workout-card__status--live workout-detail__live-badge">
              <span className="stat-card__live-dot" />
              Live
            </span>
          )}
        </h3>
        <p>
          Телефон: {w.phone} · Кроссовки: {w.shoe_unique_id} ({w.shoe_model})
        </p>
      </div>

      <div className="workout-detail__map-wrap">
        <WorkoutLiveMap
          tracks={mapTrack}
          focusWorkoutId={Number(workoutId)}
          height={320}
        />
        {isLive && !hasMapPosition && (
          <div className="workout-detail__map-overlay">
            <Icon name="my_location" />
            <span>GPS клиента ожидает сигнал…</span>
          </div>
        )}
      </div>

      <div className="workout-detail__metrics">
        <div>
          <span className="workout-card__metric-label">Дистанция</span>
          <strong>{Number(distanceKm).toFixed(2)} км</strong>
        </div>
        <div>
          <span className="workout-card__metric-label">Время</span>
          <strong>{formatDuration(elapsed)}</strong>
        </div>
        <div>
          <span className="workout-card__metric-label">GPS-точек</span>
          <strong>{pointsCount}</strong>
        </div>
        <div>
          <span className="workout-card__metric-label">Шаги</span>
          <strong>{live?.steps_count ?? w.steps_count ?? '—'}</strong>
        </div>
      </div>

      <p>
        {new Date(w.started_at).toLocaleString('ru')}
        {w.finished_at && ` — ${new Date(w.finished_at).toLocaleString('ru')}`}
      </p>
      <p>
        ср. {w.avg_speed ?? '—'} км/ч · макс. {w.max_speed ?? '—'} км/ч · Статус: {w.status}
      </p>
      <p>
        Цена за км: <strong>{w.price_per_km ?? '—'}</strong> · Расчёт:{' '}
        <strong>{w.calculated_bonus ?? '—'}</strong> · Начислено:{' '}
        <strong>{data.bonus_earned}</strong>
      </p>
      {w.reject_reason && <p className="error-text">Причина: {w.reject_reason}</p>}
      <p className="hint">
        Дневной лимит: {lim.daily_earned} / {lim.daily_limit} · По паре:{' '}
        {lim.shoe_total_earned} / {lim.shoe_limit}
        {isLive && (
          <>
            {' '}
            · Live: {wsStatus === 'connected' ? 'WebSocket' : wsStatus === 'reconnecting' ? 'переподключение…' : 'REST'}
          </>
        )}
      </p>

      <h4>GPS-точки</h4>
      <div className="points-scroll">
        <table>
          <thead>
            <tr>
              <th>Время</th>
              <th>lat</th>
              <th>lng</th>
              <th>км/ч</th>
              <th>точность</th>
            </tr>
          </thead>
          <tbody>
            {(live?.points ?? data.points).map((p, idx) => (
              <tr key={p.id ?? `${p.recorded_at}-${idx}`}>
                <td>{new Date(p.recorded_at).toLocaleTimeString('ru')}</td>
                <td>{p.lat}</td>
                <td>{p.lng}</td>
                <td>{p.speed ?? '—'}</td>
                <td>{p.accuracy ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
