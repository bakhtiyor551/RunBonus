import { formatDuration } from './format';

export function countFinishedWorkouts(workouts) {
  return workouts.filter((w) => w.status === 'approved' || w.finished_at).length;
}

export function formatWorkoutStatus(status) {
  const labels = {
    approved: 'Зачтена',
    rejected: 'Отклонена',
    rejected_no_fund: 'Без начисления',
    in_progress: 'В процессе',
  };
  return labels[status] || status || '—';
}

function kmGoal(totalKm) {
  return Math.max(100, Math.ceil(totalKm / 50) * 50);
}

function runsGoal(totalRuns) {
  return Math.max(10, Math.ceil(totalRuns / 5) * 5);
}

export function getKmDetailStats(workouts) {
  const totalKm = workouts.reduce((s, w) => s + (Number(w.distance_km) || 0), 0);
  const finished = workouts.filter((w) => w.finished_at || Number(w.distance_km) > 0);
  const count = finished.length || workouts.length;
  const goal = kmGoal(totalKm);
  const distances = finished.map((w) => Number(w.distance_km) || 0).filter((d) => d > 0);
  const maxKm = distances.length ? Math.max(...distances) : 0;
  const avgKm = count > 0 ? totalKm / count : 0;

  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const monthKm = workouts
    .filter((w) => w.started_at && new Date(w.started_at) >= monthStart)
    .reduce((s, w) => s + (Number(w.distance_km) || 0), 0);

  const approvedKm = workouts
    .filter((w) => w.status === 'approved')
    .reduce((s, w) => s + (Number(w.distance_km) || 0), 0);

  return {
    totalKm,
    goal,
    progressPct: goal > 0 ? Math.min(100, (totalKm / goal) * 100) : 0,
    avgKm,
    maxKm,
    monthKm,
    approvedKm,
    workoutCount: count,
  };
}

export function getWorkoutsDetailStats(workouts) {
  const totalRuns = countFinishedWorkouts(workouts);
  const approved = workouts.filter((w) => w.status === 'approved').length;
  const rejected = workouts.filter((w) => w.status === 'rejected' || w.status === 'rejected_no_fund').length;
  const inProgress = workouts.filter((w) => w.status === 'in_progress').length;
  const totalBonus = workouts.reduce((s, w) => s + (Number(w.calculated_bonus) || 0), 0);
  const goal = runsGoal(totalRuns);

  const withDuration = workouts.filter((w) => w.duration_seconds > 0);
  const avgDurationSec = withDuration.length
    ? withDuration.reduce((s, w) => s + Number(w.duration_seconds), 0) / withDuration.length
    : 0;

  const totalKm = workouts.reduce((s, w) => s + (Number(w.distance_km) || 0), 0);
  const avgKm = totalRuns > 0 ? totalKm / totalRuns : 0;

  return {
    totalRuns,
    goal,
    progressPct: goal > 0 ? Math.min(100, (totalRuns / goal) * 100) : 0,
    approved,
    rejected,
    inProgress,
    totalBonus,
    avgDuration: avgDurationSec > 0 ? formatDuration(Math.round(avgDurationSec)) : '—',
    avgKm,
  };
}
