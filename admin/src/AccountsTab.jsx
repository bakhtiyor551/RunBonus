import { useState, useEffect } from 'react';
import { adminApi } from './api';
import Icon from './components/Icon';
import { formatMoney } from './utils/format';

const TYPE_LABELS = {
  bonus_fund: 'Бонусный фонд',
  cash: 'Касса',
  bank: 'Банк',
};

const TYPE_ICONS = {
  bonus_fund: 'account_balance_wallet',
  cash: 'payments',
  bank: 'account_balance',
};

const STATUS_LABELS = {
  active: 'Активен',
  blocked: 'Заблокирован',
  closed: 'Закрыт',
};

const STATUS_CLASS = {
  active: 'entity-card__status--ok',
  blocked: 'entity-card__status--bad',
  closed: 'entity-card__status--muted',
};

function AccountCard({ account, selected, onSelect }) {
  return (
    <article
      className={`account-card glass-card${selected ? ' entity-card--selected' : ''}`}
      role="button"
      tabIndex={0}
      onClick={() => onSelect(account.id)}
      onKeyDown={(e) => e.key === 'Enter' && onSelect(account.id)}
    >
      <div className="entity-card__head">
        <div className="entity-card__icon">
          <Icon name={TYPE_ICONS[account.type] || 'account_balance'} />
        </div>
        <span className={`chip ${STATUS_CLASS[account.status] || ''}`}>
          {STATUS_LABELS[account.status] || account.status}
        </span>
      </div>
      <h3 className="entity-card__title">{account.name}</h3>
      <p className="entity-card__sub">{TYPE_LABELS[account.type] || account.type}</p>
      <div className="entity-card__highlight">
        <span className="entity-card__highlight-label">Остаток</span>
        <span className="entity-card__highlight-value">
          {formatMoney(account.current_balance, account.currency)}
        </span>
      </div>
      <p className="entity-card__meta">Начальный: {formatMoney(account.initial_balance, account.currency)}</p>
      <span className="entity-card__link">
        История <Icon name="arrow_forward" />
      </span>
    </article>
  );
}

function TransactionCard({ tx }) {
  const isDebit = tx.type === 'bonus_to_client';
  return (
    <article className="tx-card glass-card">
      <div className="entity-card__head">
        <span className="entity-card__tx-type">{tx.type}</span>
        <span className={`entity-card__tx-amount${isDebit ? ' entity-card__tx-amount--out' : ''}`}>
          {isDebit ? `−${tx.amount}` : `+${tx.amount}`}
        </span>
      </div>
      <p className="entity-card__meta">{new Date(tx.created_at).toLocaleString('ru')}</p>
      <p className="entity-card__meta">
        {tx.balance_before} → <strong>{tx.balance_after}</strong>
      </p>
      {tx.user_name && (
        <p className="entity-card__meta">
          <Icon name="person" />
          {tx.user_name} ({tx.user_phone})
        </p>
      )}
      {tx.comment && <p className="entity-card__sub">{tx.comment}</p>}
    </article>
  );
}

export default function AccountsTab() {
  const [accounts, setAccounts] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [transactions, setTransactions] = useState([]);
  const [createForm, setCreateForm] = useState({
    name: 'Бонусный фонд RunBonus',
    type: 'bonus_fund',
    initial_balance: 10000,
    currency: 'TJS',
    comment: 'Основной счёт для начисления бонусов',
  });
  const [topupForm, setTopupForm] = useState({ amount: '', comment: '' });
  const [error, setError] = useState('');

  const loadAccounts = async () => {
    setError('');
    const list = await adminApi('/api/admin/accounts');
    setAccounts(list);
    if (selectedId) {
      const tx = await adminApi(`/api/admin/accounts/${selectedId}/transactions`);
      setTransactions(tx.transactions);
    }
  };

  useEffect(() => {
    loadAccounts().catch((e) => setError(e.message));
  }, []);

  const selectAccount = async (id) => {
    setSelectedId(id);
    const tx = await adminApi(`/api/admin/accounts/${id}/transactions`);
    setTransactions(tx.transactions);
  };

  const createAccount = async (e) => {
    e.preventDefault();
    setError('');
    try {
      await adminApi('/api/admin/accounts', {
        method: 'POST',
        body: JSON.stringify({
          ...createForm,
          initial_balance: Number(createForm.initial_balance),
        }),
      });
      await loadAccounts();
      alert('Счёт создан');
    } catch (err) {
      setError(err.message);
    }
  };

  const topup = async (e) => {
    e.preventDefault();
    if (!selectedId) return;
    setError('');
    try {
      await adminApi(`/api/admin/accounts/${selectedId}/topup`, {
        method: 'POST',
        body: JSON.stringify({
          amount: Number(topupForm.amount),
          comment: topupForm.comment,
        }),
      });
      setTopupForm({ amount: '', comment: '' });
      await loadAccounts();
      await selectAccount(selectedId);
      alert('Счёт пополнен');
    } catch (err) {
      setError(err.message);
    }
  };

  const setStatus = async (status) => {
    if (!selectedId) return;
    if (!confirm(`Изменить статус счёта на «${STATUS_LABELS[status]}»?`)) return;
    await adminApi(`/api/admin/accounts/${selectedId}/status`, {
      method: 'POST',
      body: JSON.stringify({ status }),
    });
    await loadAccounts();
    await selectAccount(selectedId);
  };

  const selected = accounts.find((a) => a.id === selectedId);

  return (
    <div className="entity-page">
      <div className="glass-card card">
        <h2>Бонусные счета</h2>
        <p className="hint">
          Бонусы клиентам списываются с бонусного фонда компании. Если на счёте нет средств — начисление не выполняется.
        </p>
        {error && <p className="error-text">{error}</p>}

        <h3>Открыть счёт</h3>
        <form className="inline-form" onSubmit={createAccount}>
          <input
            placeholder="Название"
            value={createForm.name}
            onChange={(e) => setCreateForm({ ...createForm, name: e.target.value })}
            required
          />
          <select
            value={createForm.type}
            onChange={(e) => setCreateForm({ ...createForm, type: e.target.value })}
          >
            <option value="bonus_fund">Бонусный фонд</option>
            <option value="cash">Касса</option>
            <option value="bank">Банк</option>
          </select>
          <input
            type="number"
            min={0}
            placeholder="Начальный баланс"
            value={createForm.initial_balance}
            onChange={(e) => setCreateForm({ ...createForm, initial_balance: e.target.value })}
          />
          <input
            placeholder="Комментарий"
            value={createForm.comment}
            onChange={(e) => setCreateForm({ ...createForm, comment: e.target.value })}
          />
          <button className="primary" type="submit">Открыть счёт</button>
        </form>

        <div className="entity-page__header" style={{ marginTop: 24 }}>
          <h3>Список счетов</h3>
          <button type="button" className="btn btn--ghost btn--sm" onClick={loadAccounts}>
            Обновить
          </button>
        </div>
        <div className="entity-cards-grid">
          {accounts.map((a) => (
            <AccountCard
              key={a.id}
              account={a}
              selected={selectedId === a.id}
              onSelect={selectAccount}
            />
          ))}
        </div>
      </div>

      {selectedId && selected && (
        <div className="glass-card card">
          <h3>Операции · {selected.name}</h3>
          <form className="inline-form" onSubmit={topup}>
            <input
              type="number"
              min={1}
              placeholder="Сумма пополнения"
              value={topupForm.amount}
              onChange={(e) => setTopupForm({ ...topupForm, amount: e.target.value })}
              required
            />
            <input
              placeholder="Комментарий"
              value={topupForm.comment}
              onChange={(e) => setTopupForm({ ...topupForm, comment: e.target.value })}
            />
            <button className="primary" type="submit">Пополнить</button>
            <button type="button" onClick={() => setStatus('blocked')}>Заблокировать</button>
            <button type="button" onClick={() => setStatus('active')}>Активировать</button>
            <button type="button" onClick={() => setStatus('closed')}>Закрыть</button>
          </form>

          {transactions.length === 0 ? (
            <p className="entity-page__empty">Операций пока нет</p>
          ) : (
            <div className="entity-cards-grid entity-cards-grid--tx">
              {transactions.map((t) => (
                <TransactionCard key={t.id} tx={t} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
