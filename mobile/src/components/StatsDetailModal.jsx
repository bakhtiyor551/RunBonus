import Icon from './Icon';
import { formatWorkoutDate } from '../utils/format';
import { formatWorkoutStatus, getKmDetailStats, getWorkoutsDetailStats } from '../utils/workoutStats';

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

function WorkoutListItem({ workout, showStatus }) {
  const km = workout.distance_km != null ? Number(workout.distance_km).toFixed(1) : '—';
  const bonus = workout.calculated_bonus != null ? Number(workout.calculated_bonus) : null;

  return (
    <div className="glass-card rb-stats-modal__list-item">
      <div className="rb-activity-card__icon" style={{ width: 40, height: 40 }}>
        <Icon name="directions_run" />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ margin: 0, fontWeight: 600, fontSize: 15 }}>{formatWorkoutDate(workout.started_at)}</p>
        <p className="rb-text-muted" style={{ margin: '4px 0 0', fontSize: 13 }}>
          {km} км
          {showStatus ? ` • ${formatWorkoutStatus(workout.status)}` : ''}
        </p>
      </div>
      {bonus != null && bonus > 0 && (
        <span style={{ color: 'var(--rb-neon)', fontWeight: 600, fontSize: 15 }}>+{bonus.toFixed(0)}</span>
      )}
    </div>
  );
}

export default function StatsDetailModal({ type, workouts, onClose }) {
  if (!type) return null;

  const isKm = type === 'km';
  const title = isKm ? 'Всего км' : 'Тренировки';
  const kmStats = isKm ? getKmDetailStats(workouts) : null;
  const runStats = !isKm ? getWorkoutsDetailStats(workouts) : null;

  const list = isKm
    ? [...workouts]
        .filter((w) => Number(w.distance_km) > 0)
        .sort((a, b) => Number(b.distance_km) - Number(a.distance_km))
    : [...workouts].filter((w) => w.finished_at || w.status === 'approved' || w.status === 'rejected' || w.status === 'rejected_no_fund');

  return (
    <div className="rb-stats-modal" role="dialog" aria-modal="true" aria-labelledby="stats-modal-title">
      <button type="button" className="rb-stats-modal__backdrop" aria-label="Закрыть" onClick={onClose} />
      <div className="rb-stats-modal__sheet glass-card">
        <div className="rb-stats-modal__header">
          <h2 id="stats-modal-title" className="rb-headline font-display" style={{ margin: 0 }}>
            {title}
          </h2>
          <button type="button" className="rb-stats-modal__close" onClick={onClose} aria-label="Закрыть">
            <Icon name="close" />
          </button>
        </div>

        {isKm && kmStats && (
          <div className="rb-stats-modal__summary">
            <div className="rb-stats-modal__hero">
              <span className="rb-display font-display" style={{ fontSize: 40 }}>
                {kmStats.totalKm.toFixed(1)}
              </span>
              <span className="rb-label" style={{ marginTop: 4 }}>километров всего</span>
            </div>
            <div className="rb-stats-modal__grid">
              <StatRow label="Цель" value={`${kmStats.goal} км`} />
              <StatRow label="Прогресс" value={`${Math.round(kmStats.progressPct)}%`} highlight />
              <StatRow label="Средняя дистанция" value={`${kmStats.avgKm.toFixed(1)} км`} />
              <StatRow label="Самая длинная" value={`${kmStats.maxKm.toFixed(1)} км`} />
              <StatRow label="За этот месяц" value={`${kmStats.monthKm.toFixed(1)} км`} />
              <StatRow label="Зачтено (одобрено)" value={`${kmStats.approvedKm.toFixed(1)} км`} />
            </div>
          </div>
        )}

        {!isKm && runStats && (
          <div className="rb-stats-modal__summary">
            <div className="rb-stats-modal__hero">
              <span className="rb-display font-display" style={{ fontSize: 40 }}>
                {runStats.totalRuns}
              </span>
              <span className="rb-label" style={{ marginTop: 4 }}>тренировок завершено</span>
            </div>
            <div className="rb-stats-modal__grid">
              <StatRow label="Цель" value={runStats.goal} />
              <StatRow label="Прогресс" value={`${Math.round(runStats.progressPct)}%`} highlight />
              <StatRow label="Зачтено" value={runStats.approved} />
              <StatRow label="Отклонено" value={runStats.rejected} />
              {runStats.inProgress > 0 && (
                <StatRow label="В процессе" value={runStats.inProgress} />
              )}
              <StatRow label="Бонусов всего" value={`+${runStats.totalBonus.toFixed(0)} сомони`} highlight />
              <StatRow label="Среднее время" value={runStats.avgDuration} />
              <StatRow label="Средняя дистанция" value={`${runStats.avgKm.toFixed(1)} км`} />
            </div>
          </div>
        )}

        <h3 className="rb-label" style={{ margin: '20px 0 12px' }}>
          {isKm ? 'По дистанции' : 'История'}
        </h3>
        <div className="rb-stats-modal__list">
          {list.length > 0 ? (
            list.map((w) => <WorkoutListItem key={w.id} workout={w} showStatus={!isKm} />)
          ) : (
            <p className="rb-text-muted" style={{ margin: 0 }}>Пока нет данных</p>
          )}
        </div>
      </div>
    </div>
  );
}
