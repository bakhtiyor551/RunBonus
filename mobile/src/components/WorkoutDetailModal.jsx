import { useEffect, useState } from 'react';
import Icon from './Icon';
import DetailSheet, { StatRow } from './DetailSheet';
import WorkoutMap from './WorkoutMap';
import { api } from '../api';
import { formatDuration } from '../utils/format';
import { formatWorkoutStatus } from '../utils/workoutStats';
import { formatDistance, formatSpeed, getDistanceUnits } from '../services/units';

function formatDateTime(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('ru', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function statusClass(status) {
  if (status === 'approved') return 'rb-detail-sheet__status--ok';
  if (status === 'in_progress') return 'rb-detail-sheet__status--active';
  return 'rb-detail-sheet__status--bad';
}

export default function WorkoutDetailModal({ workout, onClose }) {
  const [points, setPoints] = useState([]);
  const [loadingRoute, setLoadingRoute] = useState(false);
  const units = getDistanceUnits();

  useEffect(() => {
    if (!workout?.id) {
      setPoints([]);
      return;
    }
    setLoadingRoute(true);
    api(`/api/workouts/${workout.id}/points`)
      .then((data) => {
        const list = (data?.points || []).map((p) => ({
          latitude: Number(p.latitude),
          longitude: Number(p.longitude),
          speed: p.speed != null ? Number(p.speed) : null,
          accuracy: p.accuracy != null ? Number(p.accuracy) : null,
          recorded_at: p.recorded_at,
        }));
        setPoints(list);
      })
      .catch(() => setPoints([]))
      .finally(() => setLoadingRoute(false));
  }, [workout?.id]);

  if (!workout) return null;

  const km = workout.distance_km != null ? Number(workout.distance_km) : null;
  const durationSec = Number(workout.duration_seconds) || 0;
  const bonus = workout.calculated_bonus != null ? Number(workout.calculated_bonus) : null;
  const avgSpeed = workout.avg_speed != null ? Number(workout.avg_speed) : null;
  const maxSpeed = workout.max_speed != null ? Number(workout.max_speed) : null;
  const steps = workout.steps_count != null ? Number(workout.steps_count) : null;
  const rejected = workout.status === 'rejected' || workout.status === 'rejected_no_fund';

  return (
    <DetailSheet open title="Тренировка" titleId="workout-detail-title" onClose={onClose}>
      <div className="rb-detail-sheet__status-row">
        <div className="rb-activity-card__icon rb-detail-sheet__list-icon">
          <Icon name="directions_run" />
        </div>
        <div className="rb-detail-sheet__list-text">
          <p className={`rb-detail-sheet__status ${statusClass(workout.status)}`}>
            {formatWorkoutStatus(workout.status)}
          </p>
          <p className="rb-text-muted rb-detail-sheet__list-meta">№ {workout.id}</p>
        </div>
      </div>

      <div className="rb-workout-detail-map">
        {loadingRoute ? (
          <div className="rb-workout-map__placeholder">Загрузка маршрута…</div>
        ) : (
          <WorkoutMap points={points} interactive={false} />
        )}
      </div>

      <div className="rb-detail-sheet__hero">
        <span className="rb-detail-sheet__hero-value font-display">
          {km != null ? formatDistance(km, units) : '—'}
        </span>
        <span className="rb-detail-sheet__hero-label">дистанция</span>
      </div>

      <div className="rb-detail-sheet__grid">
        <StatRow label="Длительность" value={durationSec > 0 ? formatDuration(durationSec) : '—'} />
        <StatRow label="Начало" value={formatDateTime(workout.started_at)} />
        <StatRow label="Завершение" value={formatDateTime(workout.finished_at)} />
        {avgSpeed != null && avgSpeed > 0 && (
          <StatRow label="Средняя скорость" value={formatSpeed(avgSpeed, units)} />
        )}
        {maxSpeed != null && maxSpeed > 0 && (
          <StatRow label="Макс. скорость" value={formatSpeed(maxSpeed, units)} />
        )}
        {steps != null && steps > 0 && <StatRow label="Шаги" value={String(steps)} />}
        <StatRow
          label="Бонус"
          value={
            bonus != null && bonus > 0 ? `+${bonus.toFixed(0)} сомони` : rejected ? 'Не начислен' : '—'
          }
          highlight={bonus != null && bonus > 0}
        />
      </div>

      {workout.reject_reason && (
        <div className="rb-detail-sheet__alert glass-card">
          <span className="rb-label rb-detail-sheet__alert-label">Причина</span>
          <p className="rb-detail-sheet__alert-text">{workout.reject_reason}</p>
        </div>
      )}
    </DetailSheet>
  );
}
