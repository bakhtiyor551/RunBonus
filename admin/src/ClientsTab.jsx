import { useEffect, useState } from 'react';
import { adminApi } from './api';
import Icon from './components/Icon';
import { formatMoney } from './utils/format';

function ClientCard({ user, onBlock }) {
  const blocked = user.status === 'blocked';

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
      <div className="entity-card__actions">
        <button
          type="button"
          className="btn btn--ghost btn--sm"
          onClick={() => onBlock(user.id, !blocked)}
        >
          <Icon name={blocked ? 'lock_open' : 'block'} />
          {blocked ? 'Разблокировать' : 'Заблокировать'}
        </button>
      </div>
    </article>
  );
}

export default function ClientsTab() {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

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

  return (
    <div className="entity-page">
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
        {error && <p className="error-text">{error}</p>}
        {loading ? (
          <p className="entity-page__empty">Загрузка…</p>
        ) : users.length === 0 ? (
          <p className="entity-page__empty">Клиентов пока нет</p>
        ) : (
          <div className="entity-cards-grid">
            {users.map((u) => (
              <ClientCard key={u.id} user={u} onBlock={blockUser} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
