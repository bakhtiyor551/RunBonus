import { useEffect, useState } from 'react';
import { adminApi } from './api';
import Icon from './components/Icon';
import { ClientProfileDetail } from './components/ClientProfileInfo';
import { formatMoney } from './utils/format';

function ClientCard({ user, selected, onOpen, onTopup, onBlock }) {
  const blocked = user.status === 'blocked';

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
        <span className="entity-card__highlight-label">Баланс</span>
        <span className="entity-card__highlight-value">{formatMoney(user.balance)}</span>
      </div>
      <p className="entity-card__meta">
        <Icon name="steps" />
        {user.activated_shoe_id || 'Кроссовки не привязаны'}
      </p>
      <div className="entity-card__actions" onClick={(e) => e.stopPropagation()}>
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
      </div>
      <span className="entity-card__link">
        Информация о клиенте <Icon name="arrow_forward" />
      </span>
    </article>
  );
}

export default function ClientsTab({ onFundChange }) {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [topupLoading, setTopupLoading] = useState(false);
  const [blockLoading, setBlockLoading] = useState(false);
  const [topupForm, setTopupForm] = useState({ phone: '', amount: '', comment: '' });
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

  const selectForTopup = (user) => {
    setTopupForm((f) => ({ ...f, phone: user.phone }));
    document.querySelector('.clients-page__topup')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const topupFromProfile = (profile) => {
    setSelectedUserId(null);
    setTopupForm((f) => ({ ...f, phone: profile.phone }));
    requestAnimationFrame(() => {
      document.querySelector('.clients-page__topup')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
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

  if (selectedUserId) {
    return (
      <div className="entity-page">
        <ClientProfileDetail
          userId={selectedUserId}
          onClose={() => setSelectedUserId(null)}
          onTopup={topupFromProfile}
          onBlock={blockUser}
          blockLoading={blockLoading}
        />
      </div>
    );
  }

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
            <p className="hint">
              {searchQuery.trim()
                ? `${filteredUsers.length} из ${users.length}`
                : `${users.length} зарегистрировано`}
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
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
