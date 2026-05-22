import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import Icon from './Icon';
import { subscribeConnectivity } from '../services/connectivity';

export default function OfflineModal() {
  const [online, setOnline] = useState(true);

  useEffect(() => subscribeConnectivity(setOnline), []);

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
