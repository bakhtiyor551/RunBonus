import { useState, useEffect } from 'react';
import { adminApi } from './api';

const TYPE_LABELS = {
  bonus_fund: 'Бонусный фонд',
  cash: 'Касса',
  bank: 'Банк',
};

const STATUS_LABELS = {
  active: 'Активен',
  blocked: 'Заблокирован',
  closed: 'Закрыт',
};

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

  return (
    <div className="glass-card card">
      <h2>Бонусные счета</h2>
      <p className="hint">
        Бонусы клиентам списываются с бонусного фонда компании. Если на счёте нет средств — начисление не выполняется.
      </p>
      {error && <p style={{ color: 'crimson' }}>{error}</p>}

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

      <h3>Список счетов</h3>
      <table>
        <thead>
          <tr>
            <th>ID</th>
            <th>Название</th>
            <th>Тип</th>
            <th>Начальный</th>
            <th>Остаток</th>
            <th>Статус</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {accounts.map((a) => (
            <tr key={a.id} className={selectedId === a.id ? 'selected-row' : ''}>
              <td>{a.id}</td>
              <td>{a.name}</td>
              <td>{TYPE_LABELS[a.type] || a.type}</td>
              <td>{a.initial_balance}</td>
              <td><strong>{a.current_balance}</strong> {a.currency}</td>
              <td>{STATUS_LABELS[a.status] || a.status}</td>
              <td>
                <button type="button" onClick={() => selectAccount(a.id)}>История</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {selectedId && (
        <div className="sub-card">
          <h3>Операции по счёту #{selectedId}</h3>
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

          <table>
            <thead>
              <tr>
                <th>Дата</th>
                <th>Тип</th>
                <th>Сумма</th>
                <th>До</th>
                <th>После</th>
                <th>Клиент</th>
                <th>Комментарий</th>
              </tr>
            </thead>
            <tbody>
              {transactions.map((t) => (
                <tr key={t.id}>
                  <td>{new Date(t.created_at).toLocaleString('ru')}</td>
                  <td>{t.type}</td>
                  <td>{t.type === 'bonus_to_client' ? `−${t.amount}` : t.amount}</td>
                  <td>{t.balance_before}</td>
                  <td>{t.balance_after}</td>
                  <td>{t.user_name ? `${t.user_name} (${t.user_phone})` : '—'}</td>
                  <td>{t.comment || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
