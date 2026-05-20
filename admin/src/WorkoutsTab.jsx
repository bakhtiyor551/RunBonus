import { useEffect, useState } from 'react';
import { adminApi } from './api';
import WorkoutDetail from './WorkoutDetail';
import Icon from './components/Icon';
import { formatMoney, timeAgo } from './utils/format';

const STATUS = {
  in_progress: { label: 'В процессе', className: 'workout-card__status--live' },
  approved: { label: 'Одобрено', className: 'workout-card__status--ok' },
  rejected: { label: 'Отклонено', className: 'workout-card__status--bad' },
};

function formatDuration(seconds) {
  if (seconds == null) return '—';
  const s = Number(seconds);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h} ч ${m} мин`;
  if (m > 0) return `${m} мин ${sec > 0 ? `${sec} с` : ''}`.trim();
  return `${sec} с`;
}

function WorkoutCard({ workout, onOpen }) {
  const meta = STATUS[workout.status] ?? { label: workout.status, className: '' };
  const isLive = workout.status === 'in_progress';

  return (
    <article
      className={`workout-card glass-card${isLive ? ' workout-card--live' : ''}`}
      role="button"
      tabIndex={0}
      onClick={() => onOpen(workout.id)}
      onKeyDown={(e) => e.key === 'Enter' && onOpen(workout.id)}
    >
      <div className="workout-card__head">
        <div className="workout-card__icon">
          <Icon name="directions_run" />
        </div>
        <span className={`workout-card__status chip ${meta.className}`}>
          {isLive && <span className="stat-card__live-dot" />}
          {meta.label}
        </span>
      </div>
      <h3 className="workout-card__name">{workout.client_name}</h3>
      <p className="workout-card__phone">{workout.phone}</p>
      <div className="workout-card__metrics">
        <div className="workout-card__metric">
          <span className="workout-card__metric-value">{workout.distance_km}</span>
          <span className="workout-card__metric-label">км</span>
        </div>
        <div className="workout-card__metric">
          <span className="workout-card__metric-value">{formatDuration(workout.duration_seconds)}</span>
          <span className="workout-card__metric-label">время</span>
        </div>
        <div className="workout-card__metric workout-card__metric--bonus">
          <span className="workout-card__metric-value">
            {workout.bonus > 0 ? `+${formatMoney(workout.bonus)}` : '—'}
          </span>
          <span className="workout-card__metric-label">бонус</span>
        </div>
      </div>
      <div className="workout-card__footer">
        <span className="workout-card__date">{new Date(workout.started_at).toLocaleString('ru')}</span>
        <span className="workout-card__ago">{timeAgo(workout.started_at)}</span>
      </div>
      {workout.reject_reason && (
        <p className="workout-card__reject">{workout.reject_reason}</p>
      )}
      <span className="workout-card__action">
        Детали <Icon name="arrow_forward" />
      </span>
    </article>
  );
}

export default function WorkoutsTab() {
  const [workouts, setWorkouts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [detailId, setDetailId] = useState(null);

  const load = async () => {
    setError('');
    try {
      setWorkouts(await adminApi('/api/admin/workouts'));
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const active = workouts.filter((w) => w.status === 'in_progress').length;

  return (
    <div className="workouts-page">
      <div className="workouts-page__header glass-card">
        <div>
          <h2>Тренировки</h2>
          <p className="hint workouts-page__hint">
            {loading ? 'Загрузка…' : `${workouts.length} записей`}
            {!loading && active > 0 && (
              <span className="workouts-page__live">
                <span className="stat-card__live-dot" />
                {active} в процессе
              </span>
            )}
          </p>
        </div>
        {!detailId && (
          <button type="button" className="btn btn--outline" onClick={load} disabled={loading}>
            <Icon name="refresh" />
            Обновить
          </button>
        )}
      </div>

      {error && <p className="error-text">{error}</p>}

      {detailId ? (
        <div className="glass-card card">
          <WorkoutDetail workoutId={detailId} onClose={() => setDetailId(null)} />
        </div>
      ) : loading ? (
        <p className="hint">Загрузка тренировок…</p>
      ) : workouts.length === 0 ? (
        <div className="glass-card workouts-empty">
          <Icon name="directions_run" />
          <p>Тренировок пока нет</p>
        </div>
      ) : (
        <div className="workout-cards-grid">
          {workouts.map((w) => (
            <WorkoutCard key={w.id} workout={w} onOpen={setDetailId} />
          ))}
        </div>
      )}
    </div>
  );
}
