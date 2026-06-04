import { useState } from 'react';
import { Link } from 'react-router-dom';
import { IonPage, IonContent } from '@ionic/react';
import { api } from '../api';
import BoltIcon from '../components/BoltIcon';
import Icon from '../components/Icon';
import OtpInput from '../components/OtpInput';
import CityPicker from '../components/CityPicker';

const STEP_LABELS = ['Данные', 'Код из SMS'];

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
  const [city, setCity] = useState('');
  const [otp, setOtp] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [resendSec, setResendSec] = useState(0);

  const sendCode = async () => {
    setError('');
    if (!firstName.trim() || !lastName.trim()) {
      setError('Укажите имя и фамилию');
      return;
    }
    if (!phone.trim()) {
      setError('Укажите номер телефона');
      return;
    }
    if (!city.trim()) {
      setError('Выберите город');
      return;
    }
    setLoading(true);
    try {
      await api('/api/auth/sms/send', {
        method: 'POST',
        body: JSON.stringify({ phone: phone.trim(), purpose: 'register' }),
      });
      setStep(1);
      setOtp('');
      setResendSec(60);
      const t = setInterval(() => {
        setResendSec((s) => {
          if (s <= 1) {
            clearInterval(t);
            return 0;
          }
          return s - 1;
        });
      }, 1000);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const resendCode = async () => {
    if (resendSec > 0) return;
    await sendCode();
  };

  const finish = async (e) => {
    e.preventDefault();
    setError('');
    if (otp.length !== 6) {
      setError('Введите код из SMS (6 цифр)');
      return;
    }
    setLoading(true);
    try {
      const data = await api('/api/auth/sms/register', {
        method: 'POST',
        body: JSON.stringify({
          phone: phone.trim(),
          code: otp,
          firstName: firstName.trim(),
          lastName: lastName.trim(),
          city: city.trim(),
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
            <form
              onSubmit={(e) => {
                e.preventDefault();
                sendCode();
              }}
              className="glass-effect"
              style={{ padding: 24, borderRadius: 24 }}
            >
              <h2 className="font-display" style={{ fontSize: 22, margin: '0 0 8px' }}>
                Регистрация
              </h2>
              <p className="rb-text-muted" style={{ marginBottom: 20, fontSize: 14 }}>
                Укажите данные — отправим SMS с кодом подтверждения.
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
              <CityPicker value={city} onChange={setCity} />
              <label className="rb-label" style={{ display: 'block', marginBottom: 6 }}>
                Номер телефона
              </label>
              <div className="rb-input-wrap" style={{ marginBottom: 14 }}>
                <input
                  className="rb-input"
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="+992 90 123 4567"
                  required
                />
              </div>
              {error && <p className="rb-text-error">{error}</p>}
              <button type="submit" className="rb-btn-primary" disabled={loading} style={{ width: '100%', marginTop: 16 }}>
                {loading ? 'Отправка…' : 'Получить код'}
              </button>
            </form>
          )}

          {step === 1 && (
            <form onSubmit={finish} className="glass-effect" style={{ padding: 24, borderRadius: 24 }}>
              <h2 className="font-display" style={{ fontSize: 22, margin: '0 0 8px' }}>
                Код из SMS
              </h2>
              <p className="rb-text-muted" style={{ marginBottom: 8, fontSize: 14 }}>
                Введите 6 цифр, отправленных на {phone}
              </p>
              <OtpInput value={otp} onChange={setOtp} disabled={loading} />
              {error && <p className="rb-text-error">{error}</p>}
              <button type="submit" className="rb-btn-primary" disabled={loading} style={{ width: '100%', marginTop: 8 }}>
                {loading ? 'Проверка…' : 'Создать аккаунт'}
              </button>
              <button
                type="button"
                className="rb-btn-pill"
                style={{ width: '100%', marginTop: 12 }}
                disabled={loading || resendSec > 0}
                onClick={resendCode}
              >
                {resendSec > 0 ? `Повтор через ${resendSec} с` : 'Отправить код снова'}
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
