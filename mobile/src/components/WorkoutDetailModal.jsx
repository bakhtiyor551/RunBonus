import Icon from './Icon';
import DetailSheet, { StatRow } from './DetailSheet';
import { formatDuration } from '../utils/format';
import { formatWorkoutStatus } from '../utils/workoutStats';

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
  if (!workout) return null;

  const km = workout.distance_km != null ? Number(workout.distance_km) : null;
  const durationSec = Number(workout.duration_seconds) || 0;
  const bonus = workout.calculated_bonus != null ? Number(workout.calculated_bonus) : null;
  const avgSpeed = workout.avg_speed != null ? Number(workout.avg_speed) : null;
  const maxSpeed = workout.max_speed != null ? Number(workout.max_speed) : null;
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

      <div className="rb-detail-sheet__hero">
        <span className="rb-detail-sheet__hero-value font-display">{km != null ? km.toFixed(1) : '—'}</span>
        <span className="rb-detail-sheet__hero-label">километров</span>
      </div>

      <div className="rb-detail-sheet__grid">
        <StatRow label="Длительность" value={durationSec > 0 ? formatDuration(durationSec) : '—'} />
        <StatRow label="Начало" value={formatDateTime(workout.started_at)} />
        <StatRow label="Завершение" value={formatDateTime(workout.finished_at)} />
        {avgSpeed != null && avgSpeed > 0 && (
          <StatRow label="Средняя скорость" value={`${avgSpeed.toFixed(1)} км/ч`} />
        )}
        {maxSpeed != null && maxSpeed > 0 && (
          <StatRow label="Макс. скорость" value={`${maxSpeed.toFixed(1)} км/ч`} />
        )}
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
