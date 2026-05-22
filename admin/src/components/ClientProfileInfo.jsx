import { useEffect, useState } from 'react';
import { adminApi } from '../api';
import Icon from './Icon';
import { formatMoney } from '../utils/format';
import { ClientDeviceInfo } from './ClientDeviceInfo';

function ClientProfileCard({ profile, children }) {
  const blocked = profile.status === 'blocked';
  const registered = profile.created_at
    ? new Date(profile.created_at).toLocaleDateString('ru')
    : '—';
  const activatedAt = profile.shoe?.activated_at
    ? new Date(profile.shoe.activated_at).toLocaleString('ru')
    : '—';

  return (
    <div className="client-profile-card">
      <div className="client-profile-card__hero">
        <div className="client-profile-card__identity">
          <div className="entity-card__icon">
            <Icon name="person" />
          </div>
          <div className="client-profile-card__identity-text">
            <h3 className="client-profile-card__name">{profile.name || 'Без имени'}</h3>
            <p className="client-profile-card__line">
              <Icon name="call" />
              {profile.phone}
            </p>
            <p className="client-profile-card__line">
              <Icon name="location_on" />
              {profile.city || 'Не указан'}
            </p>
            <p className="client-profile-card__id">ID {profile.id}</p>
          </div>
        </div>
        <span className={`chip client-profile-card__status ${blocked ? 'entity-card__status--bad' : 'entity-card__status--ok'}`}>
          {blocked ? 'Заблокирован' : 'Активен'}
        </span>
      </div>

      <div className="client-profile-card__balance entity-card__highlight">
        <span className="entity-card__highlight-label">Баланс</span>
        <span className="entity-card__highlight-value">
          {formatMoney(profile.wallet.balance)}
        </span>
      </div>

      {profile.device != null && (
        <ClientDeviceInfo user={profile} device={profile.device} />
      )}

      <div className="client-profile-card__stats">
        <div className="client-profile-card__stat">
          <span className="client-profile-card__stat-label">Тренировок</span>
          <strong>{profile.workouts.total}</strong>
        </div>
        <div className="client-profile-card__stat">
          <span className="client-profile-card__stat-label">Регистрация</span>
          <strong>{registered}</strong>
        </div>
        <div className="client-profile-card__stat">
          <span className="client-profile-card__stat-label">Активация QR</span>
          <strong>{profile.shoe ? activatedAt : '—'}</strong>
        </div>
      </div>

      <details className="client-profile-card__more">
        <summary>Подробнее: кошелёк и статистика</summary>

        <h4 className="client-profile-info__section">Кошелёк</h4>
        <div className="client-profile-info__grid client-profile-info__grid--wallet">
          <div className="client-profile-info__item">
            <span className="client-profile-info__label">Доступно</span>
            <strong>{formatMoney(profile.wallet.available_balance)}</strong>
          </div>
          <div className="client-profile-info__item">
            <span className="client-profile-info__label">Заблокировано</span>
            <strong>{formatMoney(profile.wallet.blocked_balance)}</strong>
          </div>
          <div className="client-profile-info__item">
            <span className="client-profile-info__label">Заработано</span>
            <strong>{formatMoney(profile.wallet.total_earned)}</strong>
          </div>
          <div className="client-profile-info__item">
            <span className="client-profile-info__label">Потрачено</span>
            <strong>{formatMoney(profile.wallet.total_spent)}</strong>
          </div>
          <div className="client-profile-info__item">
            <span className="client-profile-info__label">Выведено</span>
            <strong>{formatMoney(profile.wallet.total_withdrawn)}</strong>
          </div>
        </div>

        {profile.level_info?.current_level && (
          <>
            <h4 className="client-profile-info__section">Уровень клиента</h4>
            <div className="client-profile-info__grid">
              <div className="client-profile-info__item">
                <span className="client-profile-info__label">Текущий уровень</span>
                <strong>{profile.level_info.current_level}</strong>
              </div>
              <div className="client-profile-info__item">
                <span className="client-profile-info__label">Км по паре</span>
                <strong>{Number(profile.level_info.total_km).toFixed(1)}</strong>
              </div>
              <div className="client-profile-info__item">
                <span className="client-profile-info__label">Бонус по паре</span>
                <strong>{formatMoney(profile.level_info.total_bonus)}</strong>
              </div>
              <div className="client-profile-info__item">
                <span className="client-profile-info__label">Следующий</span>
                <strong>{profile.level_info.next_level || '—'}</strong>
              </div>
            </div>
            {profile.level_info.level_transitions?.length > 0 && (
              <>
                <h4 className="client-profile-info__section">История переходов</h4>
                <ul className="hint" style={{ margin: 0, paddingLeft: 18 }}>
                  {profile.level_info.level_transitions.slice(0, 8).map((t) => (
                    <li key={`${t.level_name}-${t.reached_at}`}>
                      {t.level_name} — {Number(t.reached_km).toFixed(1)} км (
                      {new Date(t.reached_at).toLocaleDateString('ru-RU')})
                    </li>
                  ))}
                </ul>
              </>
            )}
          </>
        )}

        <h4 className="client-profile-info__section">Кроссовки</h4>
        {profile.shoe ? (
          <div className="client-profile-info__grid">
            <div className="client-profile-info__item">
              <span className="client-profile-info__label">Код QR</span>
              <strong>{profile.shoe.unique_id}</strong>
            </div>
            <div className="client-profile-info__item">
              <span className="client-profile-info__label">Модель</span>
              <strong>{profile.shoe.model_name}</strong>
            </div>
            <div className="client-profile-info__item">
              <span className="client-profile-info__label">Статус</span>
              <strong>{profile.shoe.status}</strong>
            </div>
          </div>
        ) : (
          <p className="hint">Кроссовки не привязаны</p>
        )}

        <h4 className="client-profile-info__section">Статистика тренировок</h4>
        <div className="client-profile-info__grid">
          <div className="client-profile-info__item">
            <span className="client-profile-info__label">Одобрено</span>
            <strong>{profile.workouts.approved}</strong>
          </div>
          <div className="client-profile-info__item">
            <span className="client-profile-info__label">Отклонено</span>
            <strong>{profile.workouts.rejected}</strong>
          </div>
          <div className="client-profile-info__item">
            <span className="client-profile-info__label">В процессе</span>
            <strong>{profile.workouts.in_progress}</strong>
          </div>
          <div className="client-profile-info__item">
            <span className="client-profile-info__label">Всего км</span>
            <strong>{Number(profile.workouts.total_km).toFixed(2)}</strong>
          </div>
          <div className="client-profile-info__item">
            <span className="client-profile-info__label">Заявок на вывод</span>
            <strong>
              {profile.withdrawals.total}
              {profile.withdrawals.active > 0 ? ` (${profile.withdrawals.active} актив.)` : ''}
            </strong>
          </div>
        </div>
      </details>

      {children}
    </div>
  );
}

/** Профиль из данных кроссовка (QR вкладка) */
export function ClientProfileFromShoe({ shoe }) {
  const profile = {
    id: shoe.activated_by_user_id,
    name: shoe.activated_by_name,
    phone: shoe.activated_by_phone,
    city: shoe.activated_by_city,
    status: shoe.activated_by_status || 'active',
    created_at: shoe.activated_by_registered_at,
    wallet: {
      balance: shoe.activated_by_balance ?? 0,
      available_balance: shoe.activated_by_balance ?? 0,
      blocked_balance: 0,
      total_earned: 0,
      total_spent: 0,
      total_withdrawn: 0,
    },
    shoe: {
      unique_id: shoe.unique_id,
      model_name: shoe.model_name,
      status: shoe.status,
      activated_at: shoe.activated_at,
    },
    workouts: {
      total: shoe.activated_by_workouts ?? 0,
      approved: 0,
      rejected: 0,
      in_progress: 0,
      total_km: 0,
    },
    withdrawals: { total: 0, active: 0 },
  };

  return <ClientProfileCard profile={profile} />;
}

export function ClientProfileInfo({ profile, children }) {
  return (
    <div className="client-profile-info">
      <ClientProfileCard profile={profile}>{children}</ClientProfileCard>
    </div>
  );
}

export function ClientProfileDetail({
  userId,
  onClose,
  onTopup,
  onBlock,
  blockLoading,
  onResetDevice,
  resetLoadingId,
}) {
  const [profile, setProfile] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  const load = () => {
    if (!userId) return;
    setLoading(true);
    setError('');
    return adminApi(`/api/admin/users/${userId}`)
      .then(setProfile)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, [userId]);

  const blocked = profile?.status === 'blocked';

  return (
    <div className="glass-card card client-profile-detail">
      <button type="button" className="btn btn--ghost btn--sm" onClick={onClose}>
        <Icon name="arrow_back" />
        Назад к списку
      </button>

      <h2 className="client-profile-detail__title">Информация о клиенте</h2>

      {loading && <p className="hint">Загрузка…</p>}
      {error && <p className="error-text">{error}</p>}

      {profile && (
        <ClientProfileInfo profile={profile}>
          <div className="client-profile-card__actions entity-card__actions">
            <button
              type="button"
              className="btn btn--primary btn--sm"
              disabled={blocked}
              onClick={() => onTopup?.(profile)}
            >
              <Icon name="add_card" />
              Пополнить баланс
            </button>
            <button
              type="button"
              className="btn btn--ghost btn--sm"
              disabled={blockLoading}
              onClick={async () => {
                await onBlock?.(profile.id, !blocked);
                await load();
              }}
            >
              <Icon name={blocked ? 'lock_open' : 'block'} />
              {blocked ? 'Разблокировать' : 'Заблокировать'}
            </button>
            {onResetDevice && (profile.device?.bound || profile.device_id) && (
              <button
                type="button"
                className="btn btn--ghost btn--sm"
                disabled={resetLoadingId === profile.id}
                onClick={async () => {
                  await onResetDevice(profile);
                  await load();
                }}
              >
                <Icon name="phonelink_erase" />
                {resetLoadingId === profile.id ? 'Сброс…' : 'Сброс устройства'}
              </button>
            )}
          </div>
        </ClientProfileInfo>
      )}
    </div>
  );
}
