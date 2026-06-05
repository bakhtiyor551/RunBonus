import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { IonPage, IonContent } from '@ionic/react';
import { api } from '../api';
import AppHeader from '../components/AppHeader';
import Icon from '../components/Icon';
import { formatBalance } from '../utils/format';
import { formatLocalPhoneInput, phoneValidationMessage } from '../utils/phone';
import { onInputFocus } from '../utils/keyboard';

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
  const [justSubmitted, setJustSubmitted] = useState(false);
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
      setMethods([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const activeRequest = history.find(
    (item) => item.status === 'pending' || item.status === 'processing'
  );
  const hasActiveRequest = Boolean(activeRequest);
  const showForm = !loading && !loadError && !hasActiveRequest && !justSubmitted;

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    setJustSubmitted(false);

    if (loadError) {
      setError('Сначала загрузите данные (кнопка «Повторить»)');
      return;
    }
    if (!methods.length) {
      setError('Список кошельков пуст. Обновите страницу.');
      return;
    }
    if (hasActiveRequest) {
      setError('Дождитесь обработки текущей заявки');
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
    const walletErr = phoneValidationMessage(form.wallet_number);
    if (walletErr) {
      setError(walletErr === 'Укажите номер телефона' ? 'Укажите номер кошелька' : walletErr);
      return;
    }
    if (!amount || amount <= 0) {
      setError('Укажите сумму больше 0');
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
      setForm({ method_id: '', wallet_number: '', amount: '', client_comment: '' });
      if (data.wallet) setWallet(data.wallet);
      setJustSubmitted(true);
      await load();
    } catch (err) {
      setError(err.message || 'Не удалось отправить заявку');
    } finally {
      setSubmitting(false);
    }
  };

  const fillMaxAmount = () => {
    const max = Math.max(0, wallet.available_balance);
    if (max < settings.min_amount) {
      setError(`Доступно ${formatBalance(max)} сомони — меньше минимума (${settings.min_amount})`);
      return;
    }
    setError('');
    setForm((f) => ({ ...f, amount: String(max) }));
  };

  return (
    <IonPage>
      <AppHeader showAvatar={false} onBack={() => navigate('/wallet')} />
      <IonContent scrollEvents>
        <main className="rb-main withdraw-page">
          {loading && (
            <div className="glass-card withdraw-skeleton" aria-busy="true">
              <p className="rb-text-muted" style={{ margin: 0 }}>Загрузка…</p>
            </div>
          )}

          {loadError && !loading && (
            <div className="glass-card withdraw-alert">
              <Icon name="error" className="withdraw-alert__icon" />
              <div>
                <p className="rb-text-error" style={{ margin: 0 }}>{loadError}</p>
                <button
                  type="button"
                  className="rb-btn-outline"
                  style={{ marginTop: 12 }}
                  onClick={() => {
                    setLoading(true);
                    load();
                  }}
                >
                  Повторить
                </button>
              </div>
            </div>
          )}

          {!loading && !loadError && (
            <section className="glass-card withdraw-balance-card">
              <p className="rb-label">Доступный баланс</p>
              <div className="withdraw-balance-card__row">
                <span className="rb-display font-display">{formatBalance(wallet.available_balance)}</span>
                <span className="rb-text-muted">сомони</span>
              </div>
              {wallet.blocked_balance > 0 && (
                <p className="rb-text-muted withdraw-balance-card__meta">
                  Заблокировано на вывод: {formatBalance(wallet.blocked_balance)} сомони
                </p>
              )}
              <p className="rb-text-muted withdraw-balance-card__meta">
                Минимум: {settings.min_amount} сомони · Лимит в день: {settings.max_daily_amount} сомони
              </p>
            </section>
          )}

          {justSubmitted && (
            <div className="glass-card withdraw-success-banner">
              <Icon name="check_circle" />
              <div>
                <p className="withdraw-success-banner__title">Заявка отправлена</p>
                <p className="rb-text-muted withdraw-success-banner__hint">
                  Администратор обработает её в ближайшее время. Статус — в истории ниже.
                </p>
              </div>
            </div>
          )}

          {hasActiveRequest && !justSubmitted && (
            <div className="glass-card withdraw-info-banner">
              <Icon name="hourglass_top" />
              <div>
                <p className="withdraw-info-banner__title">Заявка в обработке</p>
                <p className="rb-text-muted" style={{ margin: '6px 0 0', fontSize: 13 }}>
                  {activeRequest.wallet_name} · {activeRequest.wallet_number}
                </p>
                <p className="rb-text-muted" style={{ margin: '4px 0 0', fontSize: 13 }}>
                  {formatBalance(activeRequest.amount)} сомони · {activeRequest.status_label || activeRequest.status}
                </p>
                <p className="withdraw-info-banner__hint">
                  Новую заявку можно отправить после завершения этой.
                </p>
              </div>
            </div>
          )}

          {showForm && error && (
            <div className="glass-card withdraw-alert withdraw-alert--compact">
              <p className="rb-text-error" style={{ margin: 0 }}>{error}</p>
            </div>
          )}

          {showForm && (
            <form className="glass-card withdraw-form" onSubmit={submit}>
              <h2 className="rb-headline font-display withdraw-form__title">Новая заявка</h2>
              <p className="rb-text-muted withdraw-form__steps">
                Кошелёк → номер → сумма от {settings.min_amount} сомони
              </p>

              <p className="rb-label">Выберите кошелёк</p>
              {!methods.length && (
                <p className="rb-text-error" style={{ fontSize: 13, marginBottom: 12 }}>
                  Кошельки не загрузились. Нажмите «Повторить» выше.
                </p>
              )}
              <div className="withdraw-methods">
                {methods.map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    className={`withdraw-method-btn${String(form.method_id) === String(m.id) ? ' withdraw-method-btn--active' : ''}`}
                    onClick={() => {
                      setError('');
                      setForm((f) => ({ ...f, method_id: String(m.id) }));
                    }}
                  >
                    {m.name}
                  </button>
                ))}
              </div>

              <label className="withdraw-field">
                <span className="rb-label">Номер кошелька</span>
                <div className="rb-input-wrap rb-phone-input">
                  <span className="rb-phone-input__prefix" aria-hidden="true">
                    +992
                  </span>
                  <input
                    className="withdraw-field__input rb-phone-input__field"
                    placeholder="90 123 4567"
                    inputMode="numeric"
                    autoComplete="off"
                    enterKeyHint="next"
                    maxLength={9}
                    value={form.wallet_number}
                    onChange={(e) =>
                      setForm({ ...form, wallet_number: formatLocalPhoneInput(e.target.value) })
                    }
                    onFocus={onInputFocus}
                    required
                  />
                </div>
              </label>

              <label className="withdraw-field">
                <span className="rb-label">Сумма вывода</span>
                <input
                  className="withdraw-field__input"
                  type="number"
                  inputMode="decimal"
                  enterKeyHint="next"
                  min={settings.min_amount}
                  step="0.01"
                  placeholder={`от ${settings.min_amount}`}
                  value={form.amount}
                  onChange={(e) => setForm({ ...form, amount: e.target.value })}
                  onFocus={onInputFocus}
                  required
                />
                <button type="button" className="withdraw-link-btn" onClick={fillMaxAmount}>
                  Вывести весь доступный баланс
                </button>
              </label>

              <label className="withdraw-field">
                <span className="rb-label">Комментарий</span>
                <input
                  className="withdraw-field__input"
                  placeholder="Необязательно"
                  enterKeyHint="done"
                  value={form.client_comment}
                  onChange={(e) => setForm({ ...form, client_comment: e.target.value })}
                  onFocus={onInputFocus}
                />
              </label>

              <button
                type="submit"
                className="rb-btn-pill withdraw-form__submit"
                disabled={submitting}
              >
                <Icon name="send" />
                {submitting ? 'Отправка…' : 'Отправить заявку'}
              </button>
            </form>
          )}

          {!loading && (
            <section className="withdraw-history">
              <h2 className="rb-headline font-display">История выводов</h2>
              <div className="withdraw-history__list">
                {history.map((item) => (
                  <div key={item.id} className="glass-card withdraw-history-card">
                    <div className="withdraw-history-card__head">
                      <div>
                        <p className="withdraw-history-card__name">{item.wallet_name}</p>
                        <p className="rb-text-muted withdraw-history-card__num">{item.wallet_number}</p>
                      </div>
                      <span className={`withdraw-status ${STATUS_CLASS[item.status] || ''}`}>
                        {item.status_label || item.status}
                      </span>
                    </div>
                    <div className="withdraw-history-card__foot">
                      <span className="rb-text-muted">{new Date(item.created_at).toLocaleString('ru')}</span>
                      <span className="rb-headline font-display withdraw-history-card__amount">
                        {formatBalance(item.amount)} сом.
                      </span>
                    </div>
                    {item.client_comment && (
                      <p className="rb-text-muted withdraw-history-card__comment">{item.client_comment}</p>
                    )}
                    {item.admin_comment && (
                      <p className="withdraw-history-card__admin">Админ: {item.admin_comment}</p>
                    )}
                  </div>
                ))}
                {!history.length && <p className="rb-text-muted">Заявок пока нет</p>}
              </div>
            </section>
          )}
        </main>
      </IonContent>
    </IonPage>
  );
}
