import { useEffect, useState } from 'react';
import { adminApi } from './api';
import Icon from './components/Icon';
import { formatMoney } from './utils/format';

function formatDeviceBound(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleString('ru');
}

function ClientCard({ user, onTopup, onBlock, onResetDevice, resetLoadingId }) {
  const blocked = user.status === 'blocked';
  const hasDevice = Boolean(user.device_id);

  return (
    <article className={`client-card glass-card${blocked ? ' client-card--blocked' : ''}`}>
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
        <span className="entity-card__highlight-label">Баланс</span>
        <span className="entity-card__highlight-value">{formatMoney(user.balance)}</span>
      </div>
      <p className="entity-card__meta">
        <Icon name="steps" />
        {user.activated_shoe_id || 'Кроссовки не привязаны'}
      </p>
      <p className="entity-card__meta">
        <Icon name="smartphone" />
        {hasDevice
          ? `Устройство привязано${user.device_bound_at ? ` · ${formatDeviceBound(user.device_bound_at)}` : ''}`
          : 'Устройство не привязано'}
      </p>
      <div className="entity-card__actions">
        <button
          type="button"
          className="btn btn--primary btn--sm"
          onClick={() => onTopup(user)}
          disabled={blocked}
          title={blocked ? 'Клиент заблокирован' : 'Пополнить баланс'}
        >
          <Icon name="add_card" />
          Пополнить
        </button>
        <button
          type="button"
          className="btn btn--ghost btn--sm"
          onClick={() => onBlock(user.id, !blocked)}
        >
          <Icon name={blocked ? 'lock_open' : 'block'} />
          {blocked ? 'Разблокировать' : 'Заблокировать'}
        </button>
        {hasDevice && (
          <button
            type="button"
            className="btn btn--ghost btn--sm"
            onClick={() => onResetDevice(user)}
            disabled={resetLoadingId === user.id}
            title="Сбросить привязку — клиент сможет сканировать QR на новом телефоне"
          >
            <Icon name="phonelink_erase" />
            {resetLoadingId === user.id ? 'Сброс…' : 'Сброс устройства'}
          </button>
        )}
      </div>
    </article>
  );
}

export default function ClientsTab({ onFundChange }) {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [topupLoading, setTopupLoading] = useState(false);
  const [resetLoadingId, setResetLoadingId] = useState(null);
  const [topupForm, setTopupForm] = useState({ phone: '', amount: '', comment: '' });

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
    await adminApi('/api/admin/users/block', {
      method: 'POST',
      body: JSON.stringify({ user_id: id, blocked }),
    });
    await loadUsers();
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

  const selectForTopup = (user) => {
    setTopupForm((f) => ({ ...f, phone: user.phone }));
    document.querySelector('.clients-page__topup')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const topupBalance = async (e) => {
    e.preventDefault();
    setTopupLoading(true);
    setError('');
    try {
      const data = await adminApi('/api/admin/bonus/topup', {
        method: 'POST',
        body: JSON.stringify({
          phone: topupForm.phone.trim(),
          amount: Number(topupForm.amount),
          comment: topupForm.comment.trim() || undefined,
        }),
      });
      alert(
        `Баланс пополнен.\n${data.name || data.phone}: ${formatMoney(data.balance_after)}\nОстаток фонда: ${formatMoney(data.fund_after)}`
      );
      setTopupForm({ phone: '', amount: '', comment: '' });
      await loadUsers();
      onFundChange?.();
    } catch (err) {
      setError(err.message);
    } finally {
      setTopupLoading(false);
    }
  };

  return (
    <div className="entity-page">
      <div className="glass-card card clients-page__topup">
        <h2>Пополнение баланса клиента</h2>
        <p className="hint">
          Сумма списывается с бонусного фонда компании и зачисляется на кошелёк клиента.
        </p>
        <form className="settings-form" onSubmit={topupBalance}>
          <label>
            Телефон клиента
            <input
              placeholder="+992…"
              value={topupForm.phone}
              onChange={(e) => setTopupForm({ ...topupForm, phone: e.target.value })}
              required
            />
          </label>
          <label>
            Сумма (сомони)
            <input
              type="number"
              min={0.01}
              step={0.01}
              placeholder="0"
              value={topupForm.amount}
              onChange={(e) => setTopupForm({ ...topupForm, amount: e.target.value })}
              required
            />
          </label>
          <label>
            Комментарий
            <input
              placeholder="Необязательно"
              value={topupForm.comment}
              onChange={(e) => setTopupForm({ ...topupForm, comment: e.target.value })}
            />
          </label>
          <button className="btn btn--primary" type="submit" disabled={topupLoading}>
            {topupLoading ? 'Пополнение…' : 'Пополнить баланс'}
          </button>
        </form>
        {error && <p className="error-text">{error}</p>}
      </div>

      <div className="glass-card card">
        <div className="entity-page__header">
          <div>
            <h2>Клиенты</h2>
            <p className="hint">{users.length} зарегистрировано</p>
          </div>
          <button type="button" className="btn btn--ghost btn--sm" onClick={loadUsers}>
            Обновить
          </button>
        </div>
        {loading ? (
          <p className="entity-page__empty">Загрузка…</p>
        ) : users.length === 0 ? (
          <p className="entity-page__empty">Клиентов пока нет</p>
        ) : (
          <div className="entity-cards-grid">
            {users.map((u) => (
              <ClientCard
                key={u.id}
                user={u}
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
