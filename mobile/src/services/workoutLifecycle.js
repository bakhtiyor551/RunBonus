import { Capacitor } from '@capacitor/core';
import { App } from '@capacitor/app';
import { getActiveWorkoutId } from './geolocation';
import { getWorkoutSession, resumeWorkoutSession, persistWorkoutSession } from './workoutTracker';
import { ensureWorkoutLiveActivity } from './liveActivity';

let initialized = false;

function workoutLiveSnapshot() {
  const session = getWorkoutSession();
  if (!session) return null;
  return {
    seconds: session.seconds,
    distance: session.distance,
    currentSpeed: session.currentSpeed,
    steps: session.steps,
    paused: session.paused,
  };
}

/**
 * Системная «Назад» при активной тренировке — только свернуть приложение.
 * Остановка GPS только через «Завершить тренировку».
 */
export function initWorkoutLifecycle() {
  if (initialized || !Capacitor.isNativePlatform()) return;
  initialized = true;

  App.addListener('backButton', () => {
    const activeId = getActiveWorkoutId();
    const session = getWorkoutSession();
    if (activeId && session?.workoutId === activeId) {
      persistWorkoutSession();
      const snapshot = workoutLiveSnapshot();
      if (snapshot) ensureWorkoutLiveActivity(snapshot).catch(() => {});
      App.minimizeApp();
      return;
    }
    if (window.history.length > 1) {
      window.history.back();
    } else {
      App.minimizeApp();
    }
  });

  App.addListener('appStateChange', ({ isActive }) => {
    const activeId = getActiveWorkoutId();
    if (!activeId) return;
    if (isActive) {
      resumeWorkoutSession().catch(() => {});
    } else {
      persistWorkoutSession();
      const snapshot = workoutLiveSnapshot();
      if (snapshot) ensureWorkoutLiveActivity(snapshot).catch(() => {});
    }
  });
}
