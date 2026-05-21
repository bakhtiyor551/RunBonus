import { useState } from 'react';
import Icon from './Icon';

function buildDeviceFromUser(user) {
  if (user?.device && typeof user.device === 'object') return user.device;
  const id = user?.device_id ? String(user.device_id).trim() : '';
  const bound = Boolean(id);
  const boundAt = user?.device_bound_at ? new Date(user.device_bound_at) : null;
  const boundAtValid = boundAt && !Number.isNaN(boundAt.getTime());
  return {
    bound,
    device_id: id || null,
    device_id_short: id ? (id.length > 12 ? `${id.slice(0, 8)}…${id.slice(-4)}` : id) : null,
    device_bound_at: boundAtValid ? boundAt.toISOString() : null,
    device_bound_at_label: boundAtValid ? boundAt.toLocaleString('ru') : null,
    days_bound: boundAtValid ? Math.floor((Date.now() - boundAt.getTime()) / 86400000) : null,
    status_label: bound ? 'Привязано' : 'Не привязано',
    status_hint: bound
      ? 'QR и активация кроссовок только с этого телефона.'
      : 'Привязка появится после входа клиента в приложение.',
    qr_rule: 'ID фиксируется при первом входе или регистрации в приложении.',
    reset_hint: 'Сброс — для переноса аккаунта на другой телефон.',
  };
}

export function ClientDeviceInfo({
  user,
  device: deviceProp,
  compact = false,
  onResetDevice,
  resetLoading = false,
}) {
  const [copied, setCopied] = useState(false);
  const device = deviceProp || buildDeviceFromUser(user);

  const copyId = async () => {
    if (!device.device_id) return;
    try {
      await navigator.clipboard.writeText(device.device_id);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* ignore */
    }
  };

  return (
    <section
      className={`client-device${compact ? ' client-device--compact' : ''}${device.bound ? ' client-device--bound' : ' client-device--unbound'}`}
    >
      <div className="client-device__head">
        <div className="client-device__icon-wrap">
          <Icon name={device.bound ? 'phonelink_lock' : 'phonelink_off'} />
        </div>
        <div>
          <h4 className="client-device__title">Привязка устройства</h4>
          <span className={`client-device__badge${device.bound ? ' client-device__badge--ok' : ''}`}>
            {device.status_label}
          </span>
        </div>
      </div>

      <p className="client-device__hint">{device.status_hint}</p>

      {!compact && (
        <ul className="client-device__rules">
          <li>{device.qr_rule}</li>
          <li>{device.reset_hint}</li>
        </ul>
      )}

      <div className="client-device__grid">
        <div className="client-device__field">
          <span className="client-device__label">ID устройства</span>
          {device.device_id ? (
            <div className="client-device__id-row">
              <code className="client-device__id" title={device.device_id}>
                {device.device_id}
              </code>
              <button
                type="button"
                className="btn btn--ghost btn--sm client-device__copy"
                onClick={copyId}
                title="Скопировать полный ID"
              >
                <Icon name="content_copy" />
                {copied ? 'Скопировано' : 'Копировать'}
              </button>
            </div>
          ) : (
            <strong className="client-device__empty">— не задан</strong>
          )}
        </div>

        <div className="client-device__field">
          <span className="client-device__label">Краткий ID</span>
          <strong>{device.device_id_short || '—'}</strong>
        </div>

        <div className="client-device__field">
          <span className="client-device__label">Дата привязки</span>
          <strong>{device.device_bound_at_label || '—'}</strong>
        </div>

        <div className="client-device__field">
          <span className="client-device__label">Дней с привязки</span>
          <strong>
            {device.days_bound != null ? `${device.days_bound} дн.` : '—'}
          </strong>
        </div>
      </div>

      {onResetDevice && device.bound && (
        <div className="client-device__actions">
          <button
            type="button"
            className="btn btn--outline btn--sm"
            disabled={resetLoading}
            onClick={() => onResetDevice(user)}
          >
            <Icon name="phonelink_erase" />
            {resetLoading ? 'Сброс…' : 'Сбросить привязку устройства'}
          </button>
        </div>
      )}
    </section>
  );
}

export default ClientDeviceInfo;
