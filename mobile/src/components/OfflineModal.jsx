import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import Icon from './Icon';
import { subscribeConnectivity, subscribeDeviceLink } from '../services/connectivity';
import { getActiveWorkoutId } from '../services/geolocation';
import { getWorkoutSession, subscribeWorkoutSession } from '../services/workoutTracker';

export default function OfflineModal() {
  const [online, setOnline] = useState(true);
  const [deviceLinked, setDeviceLinked] = useState(true);
  const [activeWorkout, setActiveWorkout] = useState(false);
  const [pendingCount, setPendingCount] = useState(0);
  const [syncing, setSyncing] = useState(false);

  useEffect(() => subscribeConnectivity(setOnline), []);
  useEffect(() => subscribeDeviceLink(setDeviceLinked), []);

  useEffect(() => {
    const sync = () => {
      setActiveWorkout(Boolean(getWorkoutSession()?.workoutId ?? getActiveWorkoutId()));
    };
    sync();
    return subscribeWorkoutSession((snap) => {
      sync();
      setPendingCount(snap.pendingBufferCount ?? 0);
      setSyncing(Boolean(snap.syncing));
    });
  }, []);

  const showWorkoutOffline = activeWorkout && !deviceLinked;
  const showBlockingModal = !online && !activeWorkout;

  useEffect(() => {
    if (!showBlockingModal) return undefined;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [showBlockingModal]);

  if (!showWorkoutOffline && !showBlockingModal) return null;

  if (showWorkoutOffline) {
    const queueHint =
      pendingCount > 0
        ? ` — в очереди ${pendingCount} ${pendingCount === 1 ? 'точка' : pendingCount < 5 ? 'точки' : 'точек'}`
        : '';
    const syncHint = syncing ? ' · отправка на сервер…' : '';

    return createPortal(
      <div className="rb-offline-banner" role="status" aria-live="polite">
        <Icon name="wifi_off" style={{ fontSize: 18, flexShrink: 0 }} />
        <span>
          Нет интернета — тренировка продолжается, данные сохраняются локально
          {queueHint}
          {syncHint}
        </span>
      </div>,
      document.body,
    );
  }

  return createPortal(
    <div className="rb-offline-modal" role="alertdialog" aria-modal="true" aria-labelledby="offline-modal-title">
      <div className="rb-offline-modal__backdrop" aria-hidden />
      <div className="rb-offline-modal__panel glass-card">
        <div className="rb-offline-modal__icon">
          <Icon name="wifi_off" filled style={{ fontSize: 40, color: 'var(--rb-neon)' }} />
        </div>
        <h2 id="offline-modal-title" className="rb-offline-modal__title font-display">
          Нет интернета
        </h2>
        <p className="rb-offline-modal__text rb-text-muted">
          Проверьте Wi‑Fi или мобильные данные. Без сети нельзя начать тренировку и обновить баланс — когда связь
          появится, окно закроется само.
        </p>
        <p className="rb-offline-modal__hint rb-label">Ожидание подключения…</p>
      </div>
    </div>,
    document.body,
  );
}
