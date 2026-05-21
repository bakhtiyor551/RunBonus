import Icon from './Icon';
import { formatDuration } from '../utils/format';
import { formatWorkoutStatus } from '../utils/workoutStats';

function StatRow({ label, value, highlight }) {
  return (
    <div className="rb-stats-modal__row">
      <span className="rb-label" style={{ textTransform: 'none', letterSpacing: 0 }}>{label}</span>
      <span
        className={highlight ? 'rb-headline font-tabular' : ''}
        style={highlight ? { color: 'var(--rb-neon)', fontSize: 18 } : { fontWeight: 600 }}
      >
        {value}
      </span>
    </div>
  );
}

function formatDateTime(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('ru', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function statusTone(status) {
  if (status === 'approved') return 'var(--rb-neon)';
  if (status === 'in_progress') return '#64b5f6';
  return 'var(--rb-error)';
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
    <div className="rb-stats-modal" role="dialog" aria-modal="true" aria-labelledby="workout-modal-title">
      <button type="button" className="rb-stats-modal__backdrop" aria-label="Закрыть" onClick={onClose} />
      <div className="rb-stats-modal__sheet glass-card">
        <div className="rb-stats-modal__header">
          <h2 id="workout-modal-title" className="rb-headline font-display" style={{ margin: 0 }}>
            Тренировка
          </h2>
          <button type="button" className="rb-stats-modal__close" onClick={onClose} aria-label="Закрыть">
            <Icon name="close" />
          </button>
        </div>

        <div className="rb-stats-modal__summary">
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
            <div className="rb-activity-card__icon">
              <Icon name="directions_run" />
            </div>
            <div>
              <p
                style={{
                  margin: 0,
                  fontWeight: 700,
                  fontSize: 15,
                  color: statusTone(workout.status),
                }}
              >
                {formatWorkoutStatus(workout.status)}
              </p>
              <p className="rb-text-muted" style={{ margin: '4px 0 0', fontSize: 13 }}>
                № {workout.id}
              </p>
            </div>
          </div>

          <div className="rb-stats-modal__hero">
            <span className="rb-display font-display" style={{ fontSize: 40 }}>
              {km != null ? km.toFixed(1) : '—'}
            </span>
            <span className="rb-label" style={{ marginTop: 4 }}>километров</span>
          </div>

          <div className="rb-stats-modal__grid">
            <StatRow
              label="Длительность"
              value={durationSec > 0 ? formatDuration(durationSec) : '—'}
            />
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
                bonus != null && bonus > 0
                  ? `+${bonus.toFixed(0)} сомони`
                  : rejected
                    ? 'Не начислен'
                    : '—'
              }
              highlight={bonus != null && bonus > 0}
            />
          </div>

          {workout.reject_reason && (
            <div
              className="glass-card"
              style={{
                marginTop: 16,
                padding: 14,
                borderColor: 'rgba(255, 180, 171, 0.35)',
              }}
            >
              <span className="rb-label" style={{ display: 'block', marginBottom: 6 }}>
                Причина
              </span>
              <p style={{ margin: 0, fontSize: 14, lineHeight: 1.45 }}>{workout.reject_reason}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
