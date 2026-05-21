import { useState } from 'react';
import { Link } from 'react-router-dom';
import { IonPage, IonContent } from '@ionic/react';
import { api } from '../api';
import BoltIcon from '../components/BoltIcon';
import Icon from '../components/Icon';

export default function LoginPage({ onAuth }) {
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    const phoneNorm = phone.trim();
    if (!phoneNorm) {
      setError('Введите номер телефона');
      return;
    }
    if (!password) {
      setError('Введите пароль');
      return;
    }
    setLoading(true);
    try {
      const data = await api('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ phone: phoneNorm, password }),
      });
      onAuth(data);
    } catch (err) {
      setError(err.message || 'Ошибка входа');
    } finally {
      setLoading(false);
    }
  };

  return (
    <IonPage>
      <div className="rb-atmosphere">
        <div className="rb-atmosphere__blob" style={{ top: '-20%', right: '-10%', width: '60%', height: '60%' }} />
        <div className="rb-atmosphere__blob" style={{ top: '40%', left: '-20%', width: '70%', height: '70%', opacity: 0.4 }} />
      </div>
      <header className="rb-header">
        <div className="rb-header__brand">
          <BoltIcon size="md" />
          <h1 className="rb-header__logo">RunBonus</h1>
        </div>
      </header>
      <IonContent fullscreen>
        <main className="rb-login-page">
          <div className="rb-login-page__hero">
            <h1 className="font-display rb-login-page__title">Бегай. Зарабатывай.</h1>
            <p className="rb-text-muted">Войдите по телефону и паролю</p>
          </div>

          <form className="glass-effect rb-login-form" onSubmit={submit} autoComplete="on">
            <label className="rb-login-form__label">
              Телефон (логин)
              <div className="rb-input-wrap">
                <input
                  className="rb-input rb-login-form__input"
                  type="tel"
                  name="phone"
                  inputMode="tel"
                  autoComplete="tel"
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="+992 …"
                  required
                />
              </div>
            </label>

            <label className="rb-login-form__label">
              Пароль
              <div className="rb-input-wrap">
                <input
                  className="rb-input rb-login-form__input"
                  type="password"
                  name="password"
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                />
              </div>
            </label>

            {error && <p className="rb-text-error">{error}</p>}

            <button type="submit" className="rb-btn-pill rb-login-form__submit" disabled={loading}>
              {loading ? 'Вход…' : 'Войти'}
              <Icon name="arrow_forward" />
            </button>
          </form>

          <p className="rb-login-page__footer">
            <Link to="/register" className="rb-link">Создать аккаунт</Link>
          </p>
        </main>
      </IonContent>
    </IonPage>
  );
}
