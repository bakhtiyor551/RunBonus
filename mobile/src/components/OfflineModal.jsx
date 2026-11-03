import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import Icon from './Icon';
import SplashScreen from './SplashScreen';
import { subscribeConnectivity } from '../services/connectivity';
import { getActiveWorkoutId } from '../services/geolocation';
import { getWorkoutSession, subscribeWorkoutSession } from '../services/workoutTracker';

export default function OfflineModal() {
  const [online, setOnline] = useState(true);
  const [activeWorkout, setActiveWorkout] = useState(false);

  useEffect(() => subscribeConnectivity(setOnline), []);

  useEffect(() => {
    const sync = () => setActiveWorkout(Boolean(getWorkoutSession()?.workoutId ?? getActiveWorkoutId()));
    sync();
    return subscribeWorkoutSession(sync);
  }, []);

  useEffect(() => {
    if (online || activeWorkout) return undefined;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [online, activeWorkout]);

  if (online) return null;

  if (activeWorkout) {
    return createPortal(
      <div className="rb-offline-banner" role="status" aria-live="polite">
        <Icon name="wifi_off" style={{ fontSize: 18, flexShrink: 0 }} />
        <span>Нет интернета — тренировка продолжается, данные сохранятся локально</span>
      </div>,
      document.body,
    );
  }

  return createPortal(
    <div
      className="rb-offline-splash"
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="offline-splash-title"
    >
      <span id="offline-splash-title" className="sr-only">
        Нет интернета
      </span>
      <SplashScreen mode="offline" />
    </div>,
    document.body,
  );
}
