import WorkoutTracking from '../plugins/workoutNative';

const DAILY_STEPS_KEY = 'runbonus_daily_steps';
const DAILY_STEPS_DATE_KEY = 'runbonus_daily_steps_date';

let pollingId = null;
let sessionBaseline = 0;
let sessionSteps = 0;
let dailySteps = 0;

function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

function loadDailySteps() {
  const date = localStorage.getItem(DAILY_STEPS_DATE_KEY);
  if (date !== todayKey()) {
    dailySteps = 0;
    localStorage.setItem(DAILY_STEPS_DATE_KEY, todayKey());
    localStorage.setItem(DAILY_STEPS_KEY, '0');
    return;
  }
  dailySteps = Number(localStorage.getItem(DAILY_STEPS_KEY)) || 0;
}

function persistDailySteps() {
  localStorage.setItem(DAILY_STEPS_DATE_KEY, todayKey());
  localStorage.setItem(DAILY_STEPS_KEY, String(dailySteps));
}

async function pollSteps() {
  try {
    const data = await WorkoutTracking.getSteps();
    const total = Number(data?.steps) || 0;
    if (sessionBaseline === 0 && total > 0) {
      sessionBaseline = total;
    }
    sessionSteps = Math.max(0, total - sessionBaseline);

    try {
      const daily = await WorkoutTracking.getDailySteps();
      if (daily?.steps != null) {
        dailySteps = Math.max(0, Number(daily.steps) || 0);
        persistDailySteps();
      }
    } catch {
      dailySteps = Math.max(dailySteps, sessionSteps);
      persistDailySteps();
    }
  } catch {
    /* sensor unavailable */
  }
}

export async function startStepCounter() {
  loadDailySteps();
  sessionBaseline = 0;
  sessionSteps = 0;
  try {
    await WorkoutTracking.startSession();
    await pollSteps();
    if (sessionBaseline === 0) {
      sessionBaseline = Number((await WorkoutTracking.getSteps())?.steps) || 0;
    }
  } catch {
    /* web / permission denied */
  }
  clearInterval(pollingId);
  pollingId = setInterval(pollSteps, 2000);
}

export function stopStepCounter() {
  clearInterval(pollingId);
  pollingId = null;
  WorkoutTracking.stopSession().catch(() => {});
}

export function getSessionSteps() {
  return sessionSteps;
}

export function getDailySteps() {
  loadDailySteps();
  return dailySteps;
}

export function restoreSessionSteps(steps) {
  sessionSteps = Math.max(0, Number(steps) || 0);
}
