import { useCallback, useEffect, useState } from 'react';
import { adminApi } from '../api';
import Icon from './Icon';
import WorkoutLiveMap, { trackColor } from './WorkoutLiveMap';

const LIVE_POLL_MS = 4000;

function formatDuration(seconds) {
  const s = Math.max(0, Number(seconds) || 0);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return [h, m, sec].map((n) => String(n).padStart(2, '0')).join(':');
}

export default function WorkoutsLivePanel({ onOpenWorkout, focusWorkoutId = null }) {
  const [live, setLive] = useState({ workouts: [], updated_at: null });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const loadLive = useCallback(async () => {
    try {
      const data = await adminApi('/api/admin/workouts/live');
      setLive(data);
      setError('');
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadLive();
    const timer = setInterval(loadLive, LIVE_POLL_MS);
    return () => clearInterval(timer);
  }, [loadLive]);

  const tracks = live.workouts.map((w, index) => ({
    ...w,
    color: trackColor(index),
  }));

  if (loading) {
    return (
      <section className="glass-card card workouts-live">
        <p className="hint">Загрузка live GPS…</p>
      </section>
    );
  }

  if (!live.workouts.length) {
    return null;
  }

  return (
    <section className="glass-card card workouts-live">
      <div className="workouts-live__head">
        <div>
          <h3 className="workouts-live__title">
            <span className="stat-card__live-dot" />
            Live GPS
          </h3>
          <p className="hint workouts-live__sub">
            {live.workouts.length} активн{live.workouts.length === 1 ? 'ая' : 'ых'} тренировк
            {live.workouts.length === 1 ? 'а' : live.workouts.length < 5 ? 'и' : ''}
            {live.updated_at && (
              <> · обновлено {new Date(live.updated_at).toLocaleTimeString('ru')}</>
            )}
          </p>
        </div>
        <button type="button" className="btn btn--outline btn--sm" onClick={loadLive}>
          <Icon name="refresh" />
          Обновить
        </button>
      </div>

      {error && <p className="error-text">{error}</p>}

      <WorkoutLiveMap tracks={tracks} focusWorkoutId={focusWorkoutId} height={380} />

      <div className="workouts-live__list">
        {live.workouts.map((w, index) => (
          <button
            key={w.workout_id}
            type="button"
            className="workouts-live__item"
            onClick={() => onOpenWorkout?.(w.workout_id)}
          >
            <span
              className="workouts-live__dot"
              style={{ background: trackColor(index) }}
              aria-hidden
            />
            <span className="workouts-live__item-main">
              <strong>{w.client_name || 'Без имени'}</strong>
              <span className="hint">{w.phone}</span>
            </span>
            <span className="workouts-live__item-metrics">
              <span>{Number(w.distance_km || 0).toFixed(2)} км</span>
              <span>{formatDuration(w.elapsed_seconds)}</span>
              <span className={w.points_count > 0 ? '' : 'workouts-live__waiting'}>
                {w.points_count > 0 ? `${w.points_count} GPS` : 'нет GPS'}
              </span>
            </span>
            <Icon name="arrow_forward" />
          </button>
        ))}
      </div>
    </section>
  );
}
