import { useState } from 'react';
import { Link } from 'react-router-dom';
import { IonPage, IonContent } from '@ionic/react';
import { api } from '../api';
import BoltIcon from '../components/BoltIcon';
import Icon from '../components/Icon';

const STEP_LABELS = ['Данные', 'Пароль'];

function StepDots({ step }) {
  return (
    <div style={{ display: 'flex', gap: 8, justifyContent: 'center', marginBottom: 28 }}>
      {STEP_LABELS.map((label, i) => (
        <div key={label} style={{ textAlign: 'center', flex: 1 }}>
          <div
            style={{
              width: 32,
              height: 32,
              borderRadius: '50%',
              margin: '0 auto 6px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontWeight: 700,
              fontSize: 14,
              background: i === step ? 'var(--rb-neon)' : i < step ? 'rgba(195,244,0,0.2)' : 'var(--rb-surface-high)',
              color: i === step ? 'var(--rb-on-neon)' : 'var(--rb-on-surface-variant)',
            }}
          >
            {i + 1}
          </div>
          <span className="rb-label" style={{ fontSize: 10, opacity: i <= step ? 1 : 0.4 }}>
            {label}
          </span>
        </div>
      ))}
    </div>
  );
}

export default function RegisterPage({ onAuth }) {
  const [step, setStep] = useState(0);
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [password2, setPassword2] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const nextFromPersonal = (e) => {
    e.preventDefault();
    setError('');
    if (!firstName.trim() || !lastName.trim()) {
      setError('Укажите имя и фамилию');
      return;
    }
    if (!phone.trim()) {
      setError('Укажите номер телефона');
      return;
    }
    setStep(1);
  };

  const finish = async (e) => {
    e.preventDefault();
    setError('');
    if (password.length < 4) {
      setError('Пароль не менее 4 символов');
      return;
    }
    if (password !== password2) {
      setError('Пароли не совпадают');
      return;
    }
    setLoading(true);
    try {
      const data = await api('/api/auth/register', {
        method: 'POST',
        body: JSON.stringify({
          firstName: firstName.trim(),
          lastName: lastName.trim(),
          phone: phone.trim(),
          password,
        }),
      });
      onAuth(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <IonPage>
      <header className="rb-header">
        {step > 0 ? (
          <button type="button" className="rb-header__avatar" onClick={() => setStep(0)} aria-label="Назад">
            <Icon name="arrow_back" />
          </button>
        ) : (
          <div className="rb-header__brand">
            <BoltIcon size="md" />
            <h1 className="rb-header__logo">RunBonus</h1>
          </div>
        )}
        <div style={{ width: 40 }} />
      </header>
      <IonContent>
        <main style={{ padding: '16px 24px 32px', maxWidth: 440, margin: '0 auto' }}>
          <StepDots step={step} />

          {step === 0 && (
            <form onSubmit={nextFromPersonal} className="glass-effect" style={{ padding: 24, borderRadius: 24 }}>
              <h2 className="font-display" style={{ fontSize: 22, margin: '0 0 8px' }}>
                Профиль
              </h2>
              <p className="rb-text-muted" style={{ marginBottom: 20, fontSize: 14 }}>
                Укажите данные для входа. Магазин и привязка кроссовок — уже внутри приложения.
              </p>
              <label className="rb-label" style={{ display: 'block', marginBottom: 6 }}>
                Имя
              </label>
              <div className="rb-input-wrap" style={{ marginBottom: 14 }}>
                <input className="rb-input" value={firstName} onChange={(e) => setFirstName(e.target.value)} required />
              </div>
              <label className="rb-label" style={{ display: 'block', marginBottom: 6 }}>
                Фамилия
              </label>
              <div className="rb-input-wrap" style={{ marginBottom: 14 }}>
                <input className="rb-input" value={lastName} onChange={(e) => setLastName(e.target.value)} required />
              </div>
              <label className="rb-label" style={{ display: 'block', marginBottom: 6 }}>
                Номер телефона
              </label>
              <div className="rb-input-wrap" style={{ marginBottom: 14 }}>
                <input
                  className="rb-input"
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="+992 …"
                  required
                />
              </div>
              {error && <p className="rb-text-error">{error}</p>}
              <button type="submit" className="rb-btn-pill" style={{ width: '100%', marginTop: 16 }}>
                Далее
                <Icon name="arrow_forward" />
              </button>
            </form>
          )}

          {step === 1 && (
            <form onSubmit={finish} className="glass-effect" style={{ padding: 24, borderRadius: 24 }}>
              <h2 className="font-display" style={{ fontSize: 22, margin: '0 0 8px' }}>
                Пароль
              </h2>
              <p className="rb-text-muted" style={{ marginBottom: 20, fontSize: 14 }}>
                После регистрации вы сразу попадёте на главную. Кроссовки можно купить или привязать по QR в приложении.
              </p>
              <label className="rb-label" style={{ display: 'block', marginBottom: 6 }}>
                Пароль
              </label>
              <div className="rb-input-wrap" style={{ marginBottom: 14 }}>
                <input className="rb-input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
              </div>
              <label className="rb-label" style={{ display: 'block', marginBottom: 6 }}>
                Повторите пароль
              </label>
              <div className="rb-input-wrap" style={{ marginBottom: 14 }}>
                <input className="rb-input" type="password" value={password2} onChange={(e) => setPassword2(e.target.value)} required />
              </div>
              {error && <p className="rb-text-error">{error}</p>}
              <button type="submit" className="rb-btn-primary" disabled={loading} style={{ marginTop: 8, width: '100%' }}>
                {loading ? 'Регистрация…' : 'Создать аккаунт'}
              </button>
            </form>
          )}

          <p style={{ textAlign: 'center', marginTop: 24 }}>
            <Link to="/login" className="rb-link">
              Уже есть аккаунт
            </Link>
          </p>
        </main>
      </IonContent>
    </IonPage>
  );
}
