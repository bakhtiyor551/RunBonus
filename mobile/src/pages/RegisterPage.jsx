import { useState } from 'react';
import { Link } from 'react-router-dom';
import { IonPage, IonContent } from '@ionic/react';
import { api } from '../api';
import BoltIcon from '../components/BoltIcon';
import Icon from '../components/Icon';
import OtpInput from '../components/OtpInput';
import PhoneInput from '../components/PhoneInput';
import { formatPhoneDisplay, phoneValidationMessage } from '../utils/phone';

export default function RegisterPage({ onAuth }) {
  const [step, setStep] = useState(0);
  const [phone, setPhone] = useState('');
  const [otp, setOtp] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [resendSec, setResendSec] = useState(0);

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
        body: JSON.stringify({ phone: phone.trim(), purpose: 'register' }),
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
        }),
      });
      onAuth(data);
    } catch (err) {
      setError(err.message || 'Не удалось создать аккаунт');
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
          {step === 0 && (
            <form onSubmit={sendCode} className="glass-effect" style={{ padding: 24, borderRadius: 24 }}>
              <h2 className="font-display" style={{ fontSize: 22, margin: '0 0 8px' }}>
                Регистрация
              </h2>
              <p className="rb-text-muted" style={{ marginBottom: 20, fontSize: 14 }}>
                Введите номер телефона — отправим SMS с кодом.
              </p>
              <PhoneInput value={phone} onChange={setPhone} required />
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
                Введите 6 цифр, отправленных на {formatPhoneDisplay(phone)}
              </p>
              <OtpInput value={otp} onChange={setOtp} disabled={loading} />
              {error && <p className="rb-text-error">{error}</p>}
              <button type="submit" className="rb-btn-primary" disabled={loading} style={{ width: '100%', marginTop: 8 }}>
                {loading ? 'Проверка…' : 'Продолжить'}
              </button>
              <button
                type="button"
                className="rb-btn-pill"
                style={{ width: '100%', marginTop: 12 }}
                disabled={loading || resendSec > 0}
                onClick={() => sendCode()}
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
