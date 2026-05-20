import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { IonPage, IonContent } from '@ionic/react';
import { api } from '../api';
import AppHeader from '../components/AppHeader';
import BottomNav from '../components/BottomNav';
import Icon from '../components/Icon';
import { formatBalance } from '../utils/format';

const STATUS_CLASS = {
  pending: 'withdraw-status--pending',
  processing: 'withdraw-status--processing',
  success: 'withdraw-status--success',
  rejected: 'withdraw-status--bad',
  cancelled: 'withdraw-status--bad',
};

export default function WithdrawPage({ user, setUser }) {
  const navigate = useNavigate();
  const [methods, setMethods] = useState([]);
  const [settings, setSettings] = useState({ min_amount: 20, enabled: true, max_daily_amount: 100 });
  const [wallet, setWallet] = useState({
    balance: user?.balance ?? 0,
    blocked_balance: user?.blocked_balance ?? 0,
    available_balance: user?.available_balance ?? user?.balance ?? 0,
  });
  const [history, setHistory] = useState([]);
  const [form, setForm] = useState({
    method_id: '',
    wallet_number: '',
    amount: '',
    client_comment: '',
  });
  const [error, setError] = useState('');
  const [loadError, setLoadError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const load = async () => {
    setLoadError('');
    try {
      const [m, s, w, h] = await Promise.all([
        api('/api/withdrawal/methods'),
        api('/api/withdrawal/settings'),
        api('/api/withdrawal/wallet-summary'),
        api('/api/withdrawal/my-requests'),
      ]);
      setMethods(Array.isArray(m) ? m : []);
      setSettings(s);
      setWallet(w);
      setHistory(Array.isArray(h) ? h : []);
      if (setUser) {
        const profile = await api('/api/auth/me');
        setUser(profile);
      }
    } catch (err) {
      setLoadError(err.message || 'Не удалось загрузить данные для вывода');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const hasActiveRequest = history.some((item) => item.status === 'pending' || item.status === 'processing');

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    if (!methods.length) {
      setError('Список кошельков недоступен. Обновите страницу или обратитесь в поддержку.');
      return;
    }
    if (hasActiveRequest) {
      setError('У вас уже есть заявка в обработке. Дождитесь решения администратора.');
      return;
    }

    const amount = Number(form.amount);
    if (!form.method_id) {
      setError('Выберите кошелёк');
      return;
    }
    if (!form.wallet_number.trim()) {
      setError('Укажите номер кошелька');
      return;
    }
    if (!amount || amount <= 0) {
      setError('Сумма должна быть больше 0');
      return;
    }
    if (amount > wallet.available_balance) {
      setError(`Сумма больше доступного баланса (${formatBalance(wallet.available_balance)} сомони)`);
      return;
    }
    if (amount < settings.min_amount) {
      setError(`Минимальный вывод: ${settings.min_amount} сомони`);
      return;
    }
    if (!settings.enabled) {
      setError('Вывод средств временно отключён');
      return;
    }

    setSubmitting(true);
    try {
      const data = await api('/api/withdrawal/requests', {
        method: 'POST',
        body: JSON.stringify({
          method_id: Number(form.method_id),
          wallet_number: form.wallet_number.trim(),
          amount,
          client_comment: form.client_comment.trim() || undefined,
        }),
      });
      setSuccess(data.message || 'Заявка отправлена');
      setForm({ method_id: '', wallet_number: '', amount: '', client_comment: '' });
      if (data.wallet) setWallet(data.wallet);
      await load();
    } catch (err) {
      setError(err.message || 'Не удалось отправить заявку');
    } finally {
      setSubmitting(false);
    }
  };

  const canSubmit =
    !loading &&
    !submitting &&
    settings.enabled &&
    methods.length > 0 &&
    !hasActiveRequest &&
    !loadError;

  return (
    <IonPage>
      <AppHeader showAvatar={false} onBack={() => navigate('/wallet')} />
      <IonContent>
        <main className="rb-main">
          {loading && <p className="rb-text-muted">Загрузка…</p>}

          {loadError && (
            <div className="glass-card" style={{ padding: 16, marginBottom: 16, borderColor: 'var(--rb-error)' }}>
              <p className="rb-text-error" style={{ margin: 0 }}>{loadError}</p>
              <button type="button" className="rb-btn-outline" style={{ marginTop: 12, width: '100%' }} onClick={() => { setLoading(true); load(); }}>
                Повторить
              </button>
            </div>
          )}

          <section className="glass-card" style={{ padding: 'var(--rb-card-padding)', marginBottom: 16 }}>
            <p className="rb-label">Доступный баланс</p>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
              <span className="rb-display font-display">{formatBalance(wallet.available_balance)}</span>
              <span style={{ color: 'var(--rb-on-surface-variant)' }}>сомони</span>
            </div>
            {wallet.blocked_balance > 0 && (
              <p className="rb-text-muted" style={{ marginTop: 8, fontSize: 13 }}>
                Заблокировано на вывод: {formatBalance(wallet.blocked_balance)} сомони
              </p>
            )}
            <p className="rb-text-muted" style={{ marginTop: 4, fontSize: 12 }}>
              Минимум: {settings.min_amount} сомони · Лимит в день: {settings.max_daily_amount} сомони
            </p>
          </section>

          {hasActiveRequest && (
            <p className="rb-text-muted" style={{ marginBottom: 12, fontSize: 13 }}>
              У вас уже есть заявка в обработке. Новую можно отправить после её завершения.
            </p>
          )}

          {success && (
            <div className="glass-card withdraw-success-banner" style={{ marginBottom: 16 }}>
              <Icon name="check_circle" />
              <div>
                <p style={{ margin: 0, fontWeight: 700 }}>{success}</p>
                <p className="rb-text-muted" style={{ margin: '4px 0 0', fontSize: 13 }}>
                  Ожидайте обработки администратором
                </p>
              </div>
            </div>
          )}

          {error && <p className="rb-text-error" style={{ marginBottom: 12 }}>{error}</p>}

          {!methods.length && !loading && !loadError && (
            <p className="rb-text-error" style={{ marginBottom: 12 }}>
              Нет доступных способов вывода. Обратитесь в поддержку.
            </p>
          )}

          <form className="glass-card withdraw-form" onSubmit={submit}>
            <h2 className="rb-headline font-display" style={{ marginBottom: 16 }}>Новая заявка</h2>

            <label className="withdraw-field">
              <span className="rb-label">Выберите кошелёк</span>
              <select
                className="withdraw-field__select"
                value={form.method_id}
                onChange={(e) => setForm({ ...form, method_id: e.target.value })}
                required
                disabled={!canSubmit}
              >
                <option value="">— выберите —</option>
                {methods.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </select>
            </label>

            <label className="withdraw-field">
              <span className="rb-label">Номер кошелька</span>
              <input
                className="withdraw-field__input"
                placeholder="900000000"
                inputMode="numeric"
                autoComplete="off"
                value={form.wallet_number}
                onChange={(e) => setForm({ ...form, wallet_number: e.target.value })}
                required
                disabled={!canSubmit}
              />
            </label>

            <label className="withdraw-field">
              <span className="rb-label">Сумма вывода</span>
              <input
                className="withdraw-field__input"
                type="number"
                min={settings.min_amount}
                step="0.01"
                placeholder="0"
                value={form.amount}
                onChange={(e) => setForm({ ...form, amount: e.target.value })}
                required
                disabled={!canSubmit}
              />
            </label>

            <label className="withdraw-field">
              <span className="rb-label">Комментарий</span>
              <input
                className="withdraw-field__input"
                placeholder="Необязательно"
                value={form.client_comment}
                onChange={(e) => setForm({ ...form, client_comment: e.target.value })}
                disabled={!canSubmit}
              />
            </label>

            <button type="submit" className="rb-btn-pill" style={{ width: '100%', marginTop: 8 }} disabled={!canSubmit}>
              <Icon name="send" />
              {submitting ? 'Отправка…' : 'Отправить заявку'}
            </button>
          </form>

          <section style={{ marginTop: 32 }}>
            <h2 className="rb-headline font-display" style={{ marginBottom: 16 }}>История выводов</h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {history.map((item) => (
                <div key={item.id} className="glass-card withdraw-history-card">
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                    <div>
                      <p style={{ margin: 0, fontWeight: 700 }}>{item.wallet_name}</p>
                      <p className="rb-text-muted" style={{ margin: '4px 0 0', fontSize: 13 }}>
                        {item.wallet_number}
                      </p>
                    </div>
                    <span className={`withdraw-status ${STATUS_CLASS[item.status] || ''}`}>
                      {item.status_label || item.status}
                    </span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 12 }}>
                    <span className="rb-text-muted" style={{ fontSize: 12 }}>
                      {new Date(item.created_at).toLocaleString('ru')}
                    </span>
                    <span className="rb-headline font-display" style={{ color: 'var(--rb-neon)' }}>
                      {formatBalance(item.amount)} сом.
                    </span>
                  </div>
                  {item.client_comment && (
                    <p className="rb-text-muted" style={{ marginTop: 8, fontSize: 12 }}>
                      {item.client_comment}
                    </p>
                  )}
                  {item.admin_comment && (
                    <p style={{ marginTop: 6, fontSize: 12, color: 'var(--rb-on-surface-variant)' }}>
                      Админ: {item.admin_comment}
                    </p>
                  )}
                </div>
              ))}
              {!history.length && !loading && <p className="rb-text-muted">Заявок пока нет</p>}
            </div>
          </section>
        </main>
        <BottomNav />
      </IonContent>
    </IonPage>
  );
}
