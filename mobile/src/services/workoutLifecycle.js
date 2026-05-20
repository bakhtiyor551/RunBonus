import { Capacitor } from '@capacitor/core';
import { App } from '@capacitor/app';
import { getActiveWorkoutId } from './geolocation';
import { getWorkoutSession, resumeWorkoutSession, persistWorkoutSession } from './workoutTracker';

let initialized = false;

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
    }
  });
}
