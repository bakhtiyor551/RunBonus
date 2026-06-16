import WorkoutTracking from '../plugins/workoutNative';

const DAILY_GOAL = 10000;
const POLL_MS = 30000;

let dailySteps = 0;
let pollId = null;
const listeners = new Set();

export function getDailyStepGoal() {
  return DAILY_GOAL;
}

export function getDailyStepsValue() {
  return dailySteps;
}

export function subscribeDailySteps(fn) {
  listeners.add(fn);
  fn(dailySteps);
  return () => listeners.delete(fn);
}

function emit() {
  listeners.forEach((fn) => fn(dailySteps));
}

export async function refreshDailySteps() {
  try {
    const data = await WorkoutTracking.getDailySteps();
    dailySteps = Math.max(0, Math.floor(Number(data?.steps) || 0));
  } catch {
    /* sensor unavailable on web */
  }
  emit();
  return dailySteps;
}

export function startDailyStepsPolling() {
  refreshDailySteps();
  clearInterval(pollId);
  pollId = setInterval(refreshDailySteps, POLL_MS);
}

export function stopDailyStepsPolling() {
  clearInterval(pollId);
  pollId = null;
}

export function getDailyStepsProgress() {
  return Math.min(100, (dailySteps / DAILY_GOAL) * 100);
}
