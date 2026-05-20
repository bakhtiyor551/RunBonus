import { useEffect, useState } from 'react';
import { adminApi } from './api';

const STATUS_OPTIONS = [
  { value: '', label: 'Все' },
  { value: 'pending', label: 'Ожидает' },
  { value: 'processing', label: 'В обработке' },
  { value: 'success', label: 'Успешно' },
  { value: 'rejected', label: 'Отклонено' },
];

const STATUS_CLASS = {
  pending: 'withdraw-status--pending',
  processing: 'withdraw-status--processing',
  success: 'withdraw-status--success',
  rejected: 'withdraw-status--bad',
  cancelled: 'withdraw-status--bad',
};

export default function WithdrawalsTab() {
  const [list, setList] = useState([]);
  const [filter, setFilter] = useState('');
  const [selected, setSelected] = useState(null);
  const [detail, setDetail] = useState(null);
  const [settings, setSettings] = useState({ enabled: true, min_amount: 20, max_daily_amount: 100 });
  const [settingsForm, setSettingsForm] = useState({ enabled: true, min_amount: 20, max_daily_amount: 100 });
  const [adminComment, setAdminComment] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  const loadList = async (status = filter) => {
    const q = status ? `?status=${status}` : '';
    const rows = await adminApi(`/api/admin/withdrawals${q}`);
    setList(rows);
  };

  const loadSettings = async () => {
    const data = await adminApi('/api/admin/withdrawals/settings');
    setSettings(data.settings);
    setSettingsForm(data.settings);
  };

  useEffect(() => {
    Promise.all([loadList(), loadSettings()])
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  const openDetail = async (id) => {
    setSelected(id);
    setAdminComment('');
    const data = await adminApi(`/api/admin/withdrawals/${id}`);
    setDetail(data);
  };

  const action = async (path) => {
    if (!selected) return;
    setError('');
    try {
      await adminApi(`/api/admin/withdrawals/${selected}/${path}`, {
        method: 'POST',
        body: JSON.stringify({ admin_comment: adminComment || undefined }),
      });
      await loadList();
      await openDetail(selected);
      setAdminComment('');
      alert('Готово');
    } catch (e) {
      setError(e.message);
    }
  };

  const saveSettings = async (e) => {
    e.preventDefault();
    try {
      const data = await adminApi('/api/admin/withdrawals/settings', {
        method: 'PUT',
        body: JSON.stringify(settingsForm),
      });
      setSettings(data.settings);
      alert('Настройки сохранены');
    } catch (e) {
      setError(e.message);
    }
  };

  return (
    <div className="withdrawals-page">
      <div className="glass-card card" style={{ marginBottom: 16 }}>
        <h2>Настройки вывода</h2>
        <form className="settings-form" onSubmit={saveSettings}>
          <label>
            <input
              type="checkbox"
              checked={settingsForm.enabled}
              onChange={(e) => setSettingsForm({ ...settingsForm, enabled: e.target.checked })}
            />
            {' '}Вывод средств включён
          </label>
          <label>
            Минимальная сумма (сомони)
            <input
              type="number"
              min={1}
              value={settingsForm.min_amount}
              onChange={(e) => setSettingsForm({ ...settingsForm, min_amount: e.target.value })}
            />
          </label>
          <label>
            Максимум в день на клиента (сомони)
            <input
              type="number"
              min={1}
              value={settingsForm.max_daily_amount}
              onChange={(e) => setSettingsForm({ ...settingsForm, max_daily_amount: e.target.value })}
            />
          </label>
          <button type="submit" className="btn btn--primary">
            Сохранить настройки
          </button>
        </form>
        <p className="hint">Мин. {settings.min_amount} сом. · Макс. в день {settings.max_daily_amount} сом.</p>
      </div>

      <div className="glass-card card">
        <div className="withdrawals-toolbar">
          <h2>Заявки на вывод</h2>
          <select value={filter} onChange={(e) => { setFilter(e.target.value); loadList(e.target.value); }}>
            {STATUS_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
          <button type="button" className="btn btn--outline" onClick={() => loadList()}>
            Обновить
          </button>
        </div>
        {error && <p className="error-text">{error}</p>}
        {loading ? (
          <p className="hint">Загрузка…</p>
        ) : (
          <div className="withdrawals-layout">
            <div className="withdrawals-table-wrap custom-scrollbar">
              <table>
                <thead>
                  <tr>
                    <th>ID</th>
                    <th>Дата</th>
                    <th>Клиент</th>
                    <th>Телефон</th>
                    <th>Кошелёк</th>
                    <th>Номер</th>
                    <th>Сумма</th>
                    <th>Статус</th>
                  </tr>
                </thead>
                <tbody>
                  {list.map((r) => (
                    <tr
                      key={r.id}
                      className={selected === r.id ? 'selected-row' : ''}
                      onClick={() => openDetail(r.id)}
                      style={{ cursor: 'pointer' }}
                    >
                      <td>{r.id}</td>
                      <td>{new Date(r.created_at).toLocaleString('ru')}</td>
                      <td>{r.user_name}</td>
                      <td>{r.user_phone}</td>
                      <td>{r.wallet_name}</td>
                      <td>{r.wallet_number}</td>
                      <td><strong>{r.amount}</strong></td>
                      <td>
                        <span className={`withdraw-status ${STATUS_CLASS[r.status] || ''}`}>
                          {r.status_label}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {!list.length && <p className="hint">Заявок нет</p>}
            </div>

            {detail && (
              <div className="glass-card withdrawals-detail">
                <h3>Заявка #{detail.id}</h3>
                <p><strong>{detail.user_name}</strong> · {detail.user_phone}</p>
                <p>Кошелёк: {detail.wallet_name} · {detail.wallet_number}</p>
                <p>Сумма: <strong>{detail.amount}</strong> сомони</p>
                <p>
                  Баланс: {detail.wallet?.balance} · Доступно: {detail.wallet?.available_balance} ·
                  Заблокировано: {detail.wallet?.blocked_balance}
                </p>
                <p>
                  Статус:{' '}
                  <span className={`withdraw-status ${STATUS_CLASS[detail.status] || ''}`}>
                    {detail.status_label}
                  </span>
                </p>
                {detail.client_comment && <p className="hint">Клиент: {detail.client_comment}</p>}
                {detail.admin_comment && <p className="hint">Админ: {detail.admin_comment}</p>}

                <label className="withdraw-field" style={{ display: 'block', marginTop: 12 }}>
                  Комментарий админа
                  <input
                    value={adminComment}
                    onChange={(e) => setAdminComment(e.target.value)}
                    placeholder="Комментарий к действию"
                  />
                </label>

                <div className="withdrawals-actions">
                  {detail.status === 'pending' && (
                    <button type="button" className="btn btn--primary" onClick={() => action('processing')}>
                      Взять в обработку
                    </button>
                  )}
                  {(detail.status === 'pending' || detail.status === 'processing') && (
                    <>
                      <button type="button" className="btn btn--primary" onClick={() => action('success')}>
                        Успешно
                      </button>
                      <button type="button" className="btn btn--outline" onClick={() => action('reject')}>
                        Отклонить
                      </button>
                    </>
                  )}
                </div>

                {detail.logs?.length > 0 && (
                  <div className="sub-card">
                    <h4>Журнал</h4>
                    <ul className="withdraw-logs">
                      {detail.logs.map((l) => (
                        <li key={l.id}>
                          {new Date(l.created_at).toLocaleString('ru')} — {l.old_status || '—'} → {l.new_status}
                          {l.admin_login ? ` (${l.admin_login})` : ''}
                          {l.comment ? `: ${l.comment}` : ''}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
