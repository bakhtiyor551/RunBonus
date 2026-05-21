import Icon from './Icon';
import DetailSheet, { StatRow } from './DetailSheet';
import { formatWorkoutDate } from '../utils/format';
import { formatWorkoutStatus, getKmDetailStats, getWorkoutsDetailStats } from '../utils/workoutStats';

function WorkoutListItem({ workout, showStatus }) {
  const km = workout.distance_km != null ? Number(workout.distance_km).toFixed(1) : '—';
  const bonus = workout.calculated_bonus != null ? Number(workout.calculated_bonus) : null;

  return (
    <div className="glass-card rb-detail-sheet__list-item">
      <div className="rb-activity-card__icon rb-detail-sheet__list-icon">
        <Icon name="directions_run" />
      </div>
      <div className="rb-detail-sheet__list-text">
        <p className="rb-detail-sheet__list-title">{formatWorkoutDate(workout.started_at)}</p>
        <p className="rb-text-muted rb-detail-sheet__list-meta">
          {km} км
          {showStatus ? ` • ${formatWorkoutStatus(workout.status)}` : ''}
        </p>
      </div>
      {bonus != null && bonus > 0 && (
        <span className="rb-detail-sheet__row-value--accent">+{bonus.toFixed(0)}</span>
      )}
    </div>
  );
}

export default function StatsDetailModal({ type, workouts, onClose }) {
  if (!type) return null;

  const isKm = type === 'km';
  const title = isKm ? 'Всего км' : 'Тренировки';
  const titleId = 'stats-detail-title';
  const kmStats = isKm ? getKmDetailStats(workouts) : null;
  const runStats = !isKm ? getWorkoutsDetailStats(workouts) : null;

  const list = isKm
    ? [...workouts]
        .filter((w) => Number(w.distance_km) > 0)
        .sort((a, b) => Number(b.distance_km) - Number(a.distance_km))
    : [...workouts].filter(
        (w) =>
          w.finished_at ||
          w.status === 'approved' ||
          w.status === 'rejected' ||
          w.status === 'rejected_no_fund',
      );

  return (
    <DetailSheet open title={title} titleId={titleId} onClose={onClose}>
      {isKm && kmStats && (
        <>
          <div className="rb-detail-sheet__hero">
            <span className="rb-detail-sheet__hero-value font-display">{kmStats.totalKm.toFixed(1)}</span>
            <span className="rb-detail-sheet__hero-label">километров всего</span>
          </div>
          <div className="rb-detail-sheet__grid">
            <StatRow label="Цель" value={`${kmStats.goal} км`} />
            <StatRow label="Прогресс" value={`${Math.round(kmStats.progressPct)}%`} highlight />
            <StatRow label="Средняя дистанция" value={`${kmStats.avgKm.toFixed(1)} км`} />
            <StatRow label="Самая длинная" value={`${kmStats.maxKm.toFixed(1)} км`} />
            <StatRow label="За этот месяц" value={`${kmStats.monthKm.toFixed(1)} км`} />
            <StatRow label="Зачтено (одобрено)" value={`${kmStats.approvedKm.toFixed(1)} км`} />
          </div>
        </>
      )}

      {!isKm && runStats && (
        <>
          <div className="rb-detail-sheet__hero">
            <span className="rb-detail-sheet__hero-value font-display">{runStats.totalRuns}</span>
            <span className="rb-detail-sheet__hero-label">тренировок завершено</span>
          </div>
          <div className="rb-detail-sheet__grid">
            <StatRow label="Цель" value={runStats.goal} />
            <StatRow label="Прогресс" value={`${Math.round(runStats.progressPct)}%`} highlight />
            <StatRow label="Зачтено" value={runStats.approved} />
            <StatRow label="Отклонено" value={runStats.rejected} />
            {runStats.inProgress > 0 && <StatRow label="В процессе" value={runStats.inProgress} />}
            <StatRow label="Бонусов всего" value={`+${runStats.totalBonus.toFixed(0)} сомони`} highlight />
            <StatRow label="Среднее время" value={runStats.avgDuration} />
            <StatRow label="Средняя дистанция" value={`${runStats.avgKm.toFixed(1)} км`} />
          </div>
        </>
      )}

      <h3 className="rb-detail-sheet__section-title">{isKm ? 'По дистанции' : 'История'}</h3>
      <div className="rb-detail-sheet__list">
        {list.length > 0 ? (
          list.map((w) => <WorkoutListItem key={w.id} workout={w} showStatus={!isKm} />)
        ) : (
          <p className="rb-text-muted rb-detail-sheet__empty">Пока нет данных</p>
        )}
      </div>
    </DetailSheet>
  );
}
