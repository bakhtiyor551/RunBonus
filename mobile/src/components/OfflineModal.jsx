import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Capacitor } from '@capacitor/core';
import { App } from '@capacitor/app';
import Icon from './Icon';

function readOnline() {
  return typeof navigator !== 'undefined' ? navigator.onLine : true;
}

export default function OfflineModal() {
  const [online, setOnline] = useState(readOnline);

  useEffect(() => {
    const sync = () => setOnline(readOnline());
    window.addEventListener('online', sync);
    window.addEventListener('offline', sync);
    document.addEventListener('visibilitychange', sync);

    let removeAppListener;
    if (Capacitor.isNativePlatform()) {
      App.addListener('appStateChange', ({ isActive }) => {
        if (isActive) sync();
      }).then((h) => {
        removeAppListener = () => h.remove();
      });
    }

    return () => {
      window.removeEventListener('online', sync);
      window.removeEventListener('offline', sync);
      document.removeEventListener('visibilitychange', sync);
      removeAppListener?.();
    };
  }, []);

  useEffect(() => {
    if (online) return undefined;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [online]);

  if (online) return null;

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
