import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { IonPage, IonContent } from '@ionic/react';
import { api } from '../api';
import BoltIcon from '../components/BoltIcon';
import Icon from '../components/Icon';
import OtpInput from '../components/OtpInput';
import PhoneInput from '../components/PhoneInput';
import { formatPhoneDisplay, phoneValidationMessage } from '../utils/phone';

export default function LoginPage({ onAuth }) {
  const [step, setStep] = useState(0);
  const [phone, setPhone] = useState('');
  const [otp, setOtp] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [loading, setLoading] = useState(false);
  const [resendSec, setResendSec] = useState(0);

  useEffect(() => {
    const msg = sessionStorage.getItem('auth_notice');
    if (msg) {
      setNotice(msg);
      sessionStorage.removeItem('auth_notice');
    }
  }, []);

  const startResendTimer = () => {
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
  };

  const sendCode = async (e) => {
    e?.preventDefault();
    setError('');
    if (!phone.trim()) {
      setError('Введите номер телефона');
      return;
    }
    const phoneErr = phoneValidationMessage(phone);
    if (phoneErr) {
      setError(phoneErr);
      return;
    }
    setLoading(true);
    try {
      await api('/api/auth/sms/send', {
        method: 'POST',
        body: JSON.stringify({ phone: phone.trim(), purpose: 'login' }),
      });
      setStep(1);
      setOtp('');
      startResendTimer();
    } catch (err) {
      setError(err.message || 'Не удалось отправить SMS');
    } finally {
      setLoading(false);
    }
  };

  const submitOtp = async (e) => {
    e.preventDefault();
    setError('');
    if (otp.length !== 6) {
      setError('Введите код из SMS (6 цифр)');
      return;
    }
    setLoading(true);
    try {
      const data = await api('/api/auth/sms/login', {
        method: 'POST',
        body: JSON.stringify({ phone: phone.trim(), code: otp }),
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
      <IonContent fullscreen>
        <main className="rb-login-page">
          <div className="rb-login-page__hero">
            <h1 className="font-display rb-login-page__title">Бегай. Зарабатывай.</h1>
            <p className="rb-text-muted">Вход по SMS-коду</p>
          </div>

          {step === 0 && (
            <form className="glass-effect rb-login-form" onSubmit={sendCode} autoComplete="on">
              <PhoneInput value={phone} onChange={setPhone} label="Телефон" required />

              {notice && (
                <p className="rb-text-muted" style={{ fontSize: 13, lineHeight: 1.45 }}>
                  {notice}
                </p>
              )}
              {error && <p className="rb-text-error">{error}</p>}

              <button type="submit" className="rb-btn-pill rb-login-form__submit" disabled={loading}>
                {loading ? 'Отправка…' : 'Получить код'}
                <Icon name="arrow_forward" />
              </button>
            </form>
          )}

          {step === 1 && (
            <form className="glass-effect rb-login-form" onSubmit={submitOtp}>
              <p className="rb-text-muted" style={{ fontSize: 14, margin: 0 }}>
                Код отправлен на {formatPhoneDisplay(phone)}
              </p>
              <OtpInput value={otp} onChange={setOtp} disabled={loading} />
              {error && <p className="rb-text-error">{error}</p>}
              <button type="submit" className="rb-btn-pill rb-login-form__submit" disabled={loading}>
                {loading ? 'Вход…' : 'Войти'}
                <Icon name="arrow_forward" />
              </button>
              <button
                type="button"
                className="rb-btn-pill"
                style={{ width: '100%' }}
                disabled={loading || resendSec > 0}
                onClick={() => sendCode()}
              >
                {resendSec > 0 ? `Повтор через ${resendSec} с` : 'Отправить код снова'}
              </button>
            </form>
          )}

          <p className="rb-login-page__footer">
            <Link to="/register" className="rb-link">
              Создать аккаунт
            </Link>
          </p>
        </main>
      </IonContent>
    </IonPage>
  );
}
