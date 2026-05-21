import { useEffect, useState } from 'react';
import { adminApi } from './api';
import Icon from './components/Icon';
import { formatMoney } from './utils/format';

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

const ACCOUNT_TYPE_LABELS = {
  bonus_fund: 'Бонусный фонд',
  cash: 'Касса',
  bank: 'Банк',
};

function formatAccountOption(a) {
  const type = ACCOUNT_TYPE_LABELS[a.type] || a.type;
  return `${a.name} (${type}) — ${formatMoney(a.current_balance)}`;
}

function PayoutAccountDisplay({ account, title }) {
  if (!account) return null;
  return (
    <div className="withdraw-payout-account withdraw-payout-account--done">
      <h4 className="withdraw-payout-account__title">{title}</h4>
      <div className="withdraw-payout-account__body">
        <div className="entity-card__icon">
          <Icon name="account_balance" />
        </div>
        <div>
          <strong>{account.name}</strong>
          <p className="hint">
            {account.type_label || ACCOUNT_TYPE_LABELS[account.type] || account.type}
          </p>
          {account.current_balance != null && (
            <p className="withdraw-payout-account__balance">
              Остаток на счёте: <strong>{formatMoney(account.current_balance)}</strong>
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

function PayoutAccountSelect({ accounts, value, onChange, amount }) {
  const selected = accounts.find((a) => String(a.id) === String(value));
  const insufficient =
    selected && amount > 0 && Number(selected.current_balance) < Number(amount);

  return (
    <div className="withdraw-payout-account withdraw-payout-account--select">
      <h4 className="withdraw-payout-account__title">
        <Icon name="account_balance_wallet" />
        Счёт для списания выплаты *
      </h4>
      <p className="hint withdraw-payout-account__hint">
        При «Успешно» сумма {formatMoney(amount)} спишется с выбранного счёта компании и с кошелька
        клиента.
      </p>
      <label className="withdraw-field">
        <select value={value} onChange={(e) => onChange(e.target.value)} required>
          <option value="">— выберите счёт —</option>
          {accounts.map((a) => (
            <option key={a.id} value={a.id}>
              {formatAccountOption(a)}
            </option>
          ))}
        </select>
      </label>
      {insufficient && (
        <p className="error-text">На счёте недостаточно средств для выплаты</p>
      )}
      {selected && !insufficient && (
        <p className="hint">
          После списания останется:{' '}
          <strong>
            {formatMoney(Math.max(0, Number(selected.current_balance) - Number(amount)))}
          </strong>
        </p>
      )}
    </div>
  );
}

function WithdrawalCard({ item, selected, onSelect }) {
  return (
    <article
      className={`withdraw-card glass-card${selected ? ' entity-card--selected' : ''}`}
      role="button"
      tabIndex={0}
      onClick={() => onSelect(item.id)}
      onKeyDown={(e) => e.key === 'Enter' && onSelect(item.id)}
    >
      <div className="entity-card__head">
        <div className="entity-card__icon">
          <Icon name="south_west" />
        </div>
        <span className={`withdraw-status ${STATUS_CLASS[item.status] || ''}`}>
          {item.status_label}
        </span>
      </div>
      <h3 className="entity-card__title">{item.user_name}</h3>
      <p className="entity-card__sub">
        <Icon name="call" />
        {item.user_phone}
      </p>
      <div className="entity-card__highlight">
        <span className="entity-card__highlight-label">Сумма</span>
        <span className="entity-card__highlight-value">{formatMoney(item.amount)}</span>
      </div>
      <p className="entity-card__meta">
        <Icon name="account_balance_wallet" />
        Клиент: {item.wallet_name} · {item.wallet_number}
      </p>
      {item.payout_account_name && (
        <p className="entity-card__meta">
          <Icon name="account_balance" />
          Списано с: {item.payout_account_name}
        </p>
      )}
      <p className="entity-card__meta entity-card__meta--muted">
        #{item.id} · {new Date(item.created_at).toLocaleString('ru')}
      </p>
      {item.admin_login && (
        <p className="entity-card__meta">
          <Icon name="admin_panel_settings" />
          Админ: {item.admin_login}
        </p>
      )}
      {item.admin_comment && <p className="entity-card__sub">{item.admin_comment}</p>}
      <span className="entity-card__link">
        Заявка <Icon name="arrow_forward" />
      </span>
    </article>
  );
}

function WalletSummaryCard({ wallet, title }) {
  if (!wallet) return null;
  return (
    <div className="entity-card__highlight withdraw-client-wallet">
      <span className="entity-card__highlight-label">{title}</span>
      <div className="withdraw-wallet-grid">
        <div>
          <span className="withdraw-wallet-grid__label">Баланс</span>
          <strong>{formatMoney(wallet.balance)}</strong>
        </div>
        <div>
          <span className="withdraw-wallet-grid__label">Доступно</span>
          <strong className="withdraw-wallet-grid__accent">{formatMoney(wallet.available_balance)}</strong>
        </div>
        <div>
          <span className="withdraw-wallet-grid__label">Заблокировано</span>
          <strong>{formatMoney(wallet.blocked_balance)}</strong>
        </div>
        <div>
          <span className="withdraw-wallet-grid__label">Всего выведено</span>
          <strong>{formatMoney(wallet.total_withdrawn)}</strong>
        </div>
      </div>
    </div>
  );
}

export default function WithdrawalsTab() {
  const [list, setList] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [filter, setFilter] = useState('');
  const [selected, setSelected] = useState(null);
  const [detail, setDetail] = useState(null);
  const [settings, setSettings] = useState({ enabled: true, min_amount: 20, max_daily_amount: 100 });
  const [settingsForm, setSettingsForm] = useState({ enabled: true, min_amount: 20, max_daily_amount: 100 });
  const [adminComment, setAdminComment] = useState('');
  const [payoutAccountId, setPayoutAccountId] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  const loadAccounts = async () => {
    const rows = await adminApi('/api/admin/accounts');
    setAccounts(rows.filter((a) => a.status === 'active'));
  };

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
    Promise.all([loadList(), loadSettings(), loadAccounts()])
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  const openDetail = async (id) => {
    setSelected(id);
    setAdminComment('');
    setError('');
    try {
      const data = await adminApi(`/api/admin/withdrawals/${id}`);
      setDetail(data);
      const active = accounts.length ? accounts : await adminApi('/api/admin/accounts').then((r) => r.filter((a) => a.status === 'active'));
      if (!accounts.length) setAccounts(active);
      const defaultFund = active.find((a) => a.type === 'bonus_fund') || active[0];
      setPayoutAccountId(
        data.payout_account?.id ? String(data.payout_account.id) : defaultFund ? String(defaultFund.id) : ''
      );
    } catch (e) {
      setError(e.message);
      setDetail(null);
    }
  };

  const canComplete =
    payoutAccountId &&
    accounts.find((a) => String(a.id) === payoutAccountId) &&
    Number(accounts.find((a) => String(a.id) === payoutAccountId).current_balance) >=
      Number(detail?.amount || 0);

  const action = async (path) => {
    if (!selected) return;
    if (path === 'success' && !payoutAccountId) {
      setError('Выберите счёт для списания выплаты');
      return;
    }
    setError('');
    try {
      const body =
        path === 'success'
          ? { admin_comment: adminComment || undefined, account_id: Number(payoutAccountId) }
          : { admin_comment: adminComment || undefined };
      const data = await adminApi(`/api/admin/withdrawals/${selected}/${path}`, {
        method: 'POST',
        body: JSON.stringify(body),
      });
      await loadList();
      await loadAccounts();
      await openDetail(selected);
      setAdminComment('');
      const w = data.wallet || data.request?.wallet;
      const pa = data.payout_account || data.request?.payout_account;
      const amount = data.request?.amount ?? detail?.amount;
      if (path === 'success' && w) {
        alert(
          `${data.message || 'Готово'}\n\n` +
            `Списано с клиента: ${formatMoney(amount)}\n` +
            `Счёт компании: ${pa?.name || '—'}\n` +
            `Остаток на счёте: ${pa ? formatMoney(pa.current_balance) : '—'}\n` +
            `Баланс клиента: ${formatMoney(w.balance)}`
        );
      } else if (path === 'reject' && w) {
        alert(
          `${data.message || 'Готово'}\n\n` +
            `Возврат клиенту: ${formatMoney(amount)}\n` +
            `Баланс клиента: ${formatMoney(w.balance)}`
        );
      } else {
        alert(data.message || 'Готово');
      }
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

  const showPayoutSelect =
    detail && (detail.status === 'pending' || detail.status === 'processing');

  return (
    <div className="entity-page withdrawals-page">
      <div className="glass-card card">
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
        <div className="entity-page__header withdrawals-toolbar">
          <div>
            <h2>Заявки на вывод</h2>
            <p className="hint">{list.length} заявок</p>
          </div>
          <div className="inline-form">
            <select value={filter} onChange={(e) => { setFilter(e.target.value); loadList(e.target.value); }}>
              {STATUS_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
            <button type="button" className="btn btn--outline" onClick={() => { loadList(); loadAccounts(); }}>
              Обновить
            </button>
          </div>
        </div>
        {error && <p className="error-text">{error}</p>}
        {loading ? (
          <p className="entity-page__empty">Загрузка…</p>
        ) : list.length === 0 ? (
          <p className="entity-page__empty">Заявок нет</p>
        ) : (
          <div className="entity-cards-grid">
            {list.map((r) => (
              <WithdrawalCard
                key={r.id}
                item={r}
                selected={selected === r.id}
                onSelect={openDetail}
              />
            ))}
          </div>
        )}
      </div>

      {detail && (
        <div className="glass-card card withdrawals-detail">
          <h3>Заявка #{detail.id}</h3>
          <p><strong>{detail.user_name}</strong> · {detail.user_phone}</p>
          <p>
            Кошелёк клиента для перевода: <strong>{detail.wallet_name}</strong> ·{' '}
            {detail.wallet_number}
          </p>
          <p>Сумма выплаты: <strong>{formatMoney(detail.amount)}</strong></p>

          {detail.payout_account ? (
            <PayoutAccountDisplay
              account={detail.payout_account}
              title="Счёт списания (компания)"
            />
          ) : showPayoutSelect && accounts.length > 0 ? (
            <PayoutAccountSelect
              accounts={accounts}
              value={payoutAccountId}
              onChange={setPayoutAccountId}
              amount={detail.amount}
            />
          ) : showPayoutSelect ? (
            <p className="error-text">Нет активных счетов компании. Создайте счёт в разделе «Счета».</p>
          ) : null}

          <WalletSummaryCard
            wallet={detail.wallet}
            title={
              detail.status === 'success'
                ? 'Кошелёк клиента (после списания)'
                : detail.status === 'rejected'
                  ? 'Кошелёк клиента (средства возвращены)'
                  : 'Кошелёк клиента'
            }
          />

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
            {showPayoutSelect && (
              <>
                <button
                  type="button"
                  className="btn btn--primary"
                  onClick={() => action('success')}
                  disabled={!canComplete}
                  title={!canComplete ? 'Выберите счёт с достаточным остатком' : undefined}
                >
                  Успешно (списать)
                </button>
                <button type="button" className="btn btn--outline" onClick={() => action('reject')}>
                  Отклонить
                </button>
              </>
            )}
          </div>

          {detail.logs?.length > 0 && (
            <div className="sub-card" style={{ marginTop: 16 }}>
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
  );
}
