import { useEffect, useState } from 'react';
import { adminApi } from './api';
import Icon from './components/Icon';
import { ClientProfileDetail } from './components/ClientProfileInfo';
import { ClientDeviceInfo } from './components/ClientDeviceInfo';

function ClientCard({ user, selected, onOpen, onTopup, onBlock, onResetDevice, resetLoadingId }) {
  const blocked = user.status === 'blocked';
  const device = user.device;

  return (
    <article
      className={`client-card glass-card client-card--clickable${blocked ? ' client-card--blocked' : ''}${selected ? ' entity-card--selected' : ''}`}
      role="button"
      tabIndex={0}
      onClick={() => onOpen(user)}
      onKeyDown={(e) => e.key === 'Enter' && onOpen(user)}
    >
      <div className="entity-card__head">
        <div className="entity-card__icon">
          <Icon name="person" />
        </div>
        <span className={`chip ${blocked ? 'entity-card__status--bad' : 'entity-card__status--ok'}`}>
          {blocked ? 'Заблокирован' : 'Активен'}
        </span>
      </div>
      <h3 className="entity-card__title">{user.name || 'Без имени'}</h3>
      <p className="entity-card__sub">
        <Icon name="call" />
        {user.phone}
      </p>
      <div className="entity-card__highlight">
        <span className="entity-card__highlight-label">Километры</span>
        <span className="entity-card__highlight-value">
          {(Number(user.total_distance_km) || Number(user.total_km) || 0).toFixed(1)} км
        </span>
      </div>
      <p className="entity-card__meta">
        <Icon name="steps" />
        {user.activated_shoe_id || 'Кроссовки не привязаны'}
      </p>
      <ClientDeviceInfo
        user={user}
        device={device}
        compact
        onResetDevice={onResetDevice}
        resetLoading={resetLoadingId === user.id}
      />
      <div className="entity-card__actions" onClick={(e) => e.stopPropagation()}>
        <button
          type="button"
          className="btn btn--primary btn--sm"
          onClick={() => onTopup(user)}
          disabled={blocked}
          title={blocked ? 'Клиент заблокирован' : 'Синхронизировать награды'}
        >
          <Icon name="sync" />
          Sync награды
        </button>
        <button
          type="button"
          className="btn btn--ghost btn--sm"
          onClick={() => onBlock(user.id, !blocked)}
        >
          <Icon name={blocked ? 'lock_open' : 'block'} />
          {blocked ? 'Разблокировать' : 'Заблокировать'}
        </button>
      </div>
      <span className="entity-card__link">
        Информация о клиенте <Icon name="arrow_forward" />
      </span>
    </article>
  );
}

export default function ClientsTab() {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [topupLoading, setTopupLoading] = useState(false);
  const [blockLoading, setBlockLoading] = useState(false);
  const [resetLoadingId, setResetLoadingId] = useState(null);
  const [selectedUserId, setSelectedUserId] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');

  const filteredUsers = users.filter((u) => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return true;
    return (
      (u.name || '').toLowerCase().includes(q) ||
      (u.phone || '').toLowerCase().includes(q) ||
      String(u.id).includes(q)
    );
  });

  const loadUsers = async () => {
    setLoading(true);
    setError('');
    try {
      setUsers(await adminApi('/api/admin/users'));
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadUsers();
  }, []);

  const blockUser = async (id, blocked) => {
    setBlockLoading(true);
    try {
      await adminApi('/api/admin/users/block', {
        method: 'POST',
        body: JSON.stringify({ user_id: id, blocked }),
      });
      await loadUsers();
    } finally {
      setBlockLoading(false);
    }
  };

  const resetDevice = async (user) => {
    const label = user.name || user.phone;
    if (
      !window.confirm(
        `Сбросить привязку устройства для «${label}»?\n\nКлиент сможет заново активировать QR на другом телефоне после входа в приложение.`
      )
    ) {
      return;
    }
    setResetLoadingId(user.id);
    setError('');
    try {
      const data = await adminApi('/api/admin/users/reset-device', {
        method: 'POST',
        body: JSON.stringify({ user_id: user.id }),
      });
      alert(data.message || 'Привязка сброшена');
      await loadUsers();
    } catch (e) {
      setError(e.message);
    } finally {
      setResetLoadingId(null);
    }
  };

  const selectForTopup = async (user) => {
    setTopupLoading(true);
    setError('');
    try {
      const data = await adminApi(`/api/admin/rewards/users/${user.id}/sync`, {
        method: 'POST',
        body: '{}',
      });
      alert(
        `Прогресс синхронизирован.\n${user.name || user.phone}: ${Number(data.totalDistance || 0).toFixed(2)} км\nОткрыто наград: ${(data.unlocked || []).length}`
      );
      await loadUsers();
    } catch (err) {
      setError(err.message);
    } finally {
      setTopupLoading(false);
    }
  };

  const topupFromProfile = (profile) => {
    selectForTopup({ id: profile.id, name: profile.name, phone: profile.phone });
  };

  if (selectedUserId) {
    return (
      <div className="entity-page">
        <ClientProfileDetail
          userId={selectedUserId}
          onClose={() => setSelectedUserId(null)}
          onTopup={topupFromProfile}
          onBlock={blockUser}
          blockLoading={blockLoading}
          onResetDevice={resetDevice}
          resetLoadingId={resetLoadingId}
        />
      </div>
    );
  }

  return (
    <div className="entity-page">
      {error && <p className="error-text">{error}</p>}

      <div className="glass-card card">
        <div className="entity-page__header">
          <div>
            <h2>Клиенты</h2>
            <p className="hint">
              {searchQuery.trim()
                ? `${filteredUsers.length} из ${users.length}`
                : `${users.length} зарегистрировано`}
              {' · '}программа лояльности (км → награды)
            </p>
          </div>
          <button type="button" className="btn btn--ghost btn--sm" onClick={loadUsers}>
            Обновить
          </button>
        </div>

        <label className="clients-page__search">
          <span className="workouts-filters__label">Поиск</span>
          <input
            type="search"
            placeholder="Имя, телефон или ID"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </label>

        {loading ? (
          <p className="entity-page__empty">Загрузка…</p>
        ) : filteredUsers.length === 0 ? (
          <p className="entity-page__empty">
            {searchQuery.trim() ? 'Ничего не найдено' : 'Клиентов пока нет'}
          </p>
        ) : (
          <div className="entity-cards-grid">
            {filteredUsers.map((u) => (
              <ClientCard
                key={u.id}
                user={u}
                selected={false}
                onOpen={(user) => setSelectedUserId(user.id)}
                onTopup={selectForTopup}
                onBlock={blockUser}
                onResetDevice={resetDevice}
                resetLoadingId={resetLoadingId}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
