import { useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { IonPage, IonContent } from '@ionic/react';
import { api } from '../api';
import BoltIcon from '../components/BoltIcon';
import Icon from '../components/Icon';
import QrScanner, { parseShoeCode } from '../components/QrScanner';

const STEPS_WITH_SHOE = ['Данные', 'QR кроссовок', 'Пароль'];
const STEPS_NO_SHOE = ['Данные', 'Пароль'];

function StepDots({ step, labels }) {
  return (
    <div style={{ display: 'flex', gap: 8, justifyContent: 'center', marginBottom: 28 }}>
      {labels.map((label, i) => (
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
  const [hasShoes, setHasShoes] = useState(null);
  const [step, setStep] = useState(0);
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [phone, setPhone] = useState('');
  const [shoeCode, setShoeCode] = useState('');
  const [manualCode, setManualCode] = useState('');
  const [password, setPassword] = useState('');
  const [password2, setPassword2] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [validatingQr, setValidatingQr] = useState(false);

  const stepLabels = hasShoes ? STEPS_WITH_SHOE : STEPS_NO_SHOE;
  const qrStepIndex = hasShoes ? 1 : -1;
  const passwordStepIndex = hasShoes ? 2 : 1;

  const handleScan = useCallback((code) => {
    setShoeCode(code);
    setManualCode(code);
    setError('');
  }, []);

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
    setStep(hasShoes ? 1 : 1);
  };

  const nextFromQr = async (e) => {
    e.preventDefault();
    setError('');
    const code = parseShoeCode(shoeCode || manualCode);
    if (!code) {
      setError('Отсканируйте QR или введите код вручную');
      return;
    }
    setValidatingQr(true);
    try {
      const data = await api('/api/mobile/shoes/validate-qr', {
        method: 'POST',
        body: JSON.stringify({ unique_id: code }),
      });
      if (!data.valid) {
        setError('QR-код недействителен');
        return;
      }
      setShoeCode(code);
      setStep(2);
    } catch (err) {
      setError(err.message || 'QR-код недействителен');
    } finally {
      setValidatingQr(false);
    }
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
      const body = {
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        phone: phone.trim(),
        password,
      };
      if (hasShoes && shoeCode) body.unique_id = shoeCode;

      const data = await api('/api/auth/register', {
        method: 'POST',
        body: JSON.stringify(body),
      });
      onAuth(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const goBack = () => {
    if (step === 0 && hasShoes !== null) {
      setHasShoes(null);
      return;
    }
    if (step > 0) setStep(step - 1);
  };

  return (
    <IonPage>
      <header className="rb-header">
        {hasShoes !== null && step > 0 ? (
          <button type="button" className="rb-header__avatar" onClick={goBack} aria-label="Назад">
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
          {hasShoes === null && (
            <div className="glass-effect" style={{ padding: 24, borderRadius: 24 }}>
              <h2 className="font-display" style={{ fontSize: 22, margin: '0 0 12px', textAlign: 'center' }}>
                У вас уже есть кроссовки RunBonus?
              </h2>
              <p className="rb-text-muted" style={{ textAlign: 'center', marginBottom: 24 }}>
                Если кроссовки уже куплены — отсканируйте QR. Если нет — закажите в магазине приложения.
              </p>
              <button
                type="button"
                className="rb-btn-primary"
                style={{ width: '100%', marginBottom: 12 }}
                onClick={() => {
                  setHasShoes(true);
                  setStep(0);
                }}
              >
                <Icon name="qr_code_scanner" />
                Да, есть
              </button>
              <button
                type="button"
                className="rb-btn-pill"
                style={{ width: '100%' }}
                onClick={() => {
                  setHasShoes(false);
                  setStep(0);
                }}
              >
                <Icon name="storefront" />
                Нет, хочу заказать
              </button>
            </div>
          )}

          {hasShoes !== null && <StepDots step={step} labels={stepLabels} />}

          {hasShoes !== null && step === 0 && (
            <form onSubmit={nextFromPersonal} className="glass-effect" style={{ padding: 24, borderRadius: 24 }}>
              <h2 className="font-display" style={{ fontSize: 22, margin: '0 0 20px' }}>
                Ваши данные
              </h2>
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

          {hasShoes && step === qrStepIndex && (
            <form onSubmit={nextFromQr}>
              <h2 className="font-display" style={{ fontSize: 22, margin: '0 0 8px', textAlign: 'center' }}>
                Сканируйте QR
              </h2>
              <p className="rb-text-muted" style={{ textAlign: 'center', marginBottom: 20 }}>
                Наведите камеру на QR-код на кроссовках RunBonus
              </p>
              <QrScanner onScan={handleScan} active={step === qrStepIndex} />
              {shoeCode && (
                <p style={{ textAlign: 'center', color: 'var(--rb-neon)', marginTop: 12, fontWeight: 600 }}>
                  Код: {shoeCode}
                </p>
              )}
              <p className="rb-text-muted" style={{ textAlign: 'center', margin: '20px 0 8px', fontSize: 13 }}>
                или введите код вручную
              </p>
              <div className="rb-input-wrap">
                <input
                  className="rb-input"
                  value={manualCode}
                  onChange={(e) => setManualCode(e.target.value.toUpperCase())}
                  placeholder="SHOE-..."
                />
              </div>
              {error && <p className="rb-text-error">{error}</p>}
              <button type="submit" className="rb-btn-pill" style={{ width: '100%', marginTop: 16 }} disabled={validatingQr}>
                {validatingQr ? 'Проверка QR…' : 'Далее'}
                <Icon name="arrow_forward" />
              </button>
            </form>
          )}

          {hasShoes !== null && step === passwordStepIndex && (
            <form onSubmit={finish} className="glass-effect" style={{ padding: 24, borderRadius: 24 }}>
              <h2 className="font-display" style={{ fontSize: 22, margin: '0 0 8px' }}>
                Завершить регистрацию
              </h2>
              {hasShoes && shoeCode && (
                <p className="rb-text-muted" style={{ marginBottom: 20 }}>
                  Кроссовки: <strong style={{ color: 'var(--rb-neon)' }}>{shoeCode}</strong>
                </p>
              )}
              {!hasShoes && (
                <p className="rb-text-muted" style={{ marginBottom: 20 }}>
                  После регистрации откроется магазин для заказа кроссовок.
                </p>
              )}
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
              <button type="submit" className="rb-btn-primary" disabled={loading} style={{ marginTop: 8 }}>
                {loading ? 'Регистрация…' : 'Завершить регистрацию'}
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
