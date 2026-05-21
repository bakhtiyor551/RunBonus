import { useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { IonPage, IonContent } from '@ionic/react';
import { api } from '../api';
import BoltIcon from '../components/BoltIcon';
import Icon from '../components/Icon';
import QrScanner, { parseShoeCode } from '../components/QrScanner';

const STEPS = ['Данные', 'QR кроссовок', 'Готово'];

function StepDots({ step }) {
  return (
    <div style={{ display: 'flex', gap: 8, justifyContent: 'center', marginBottom: 28 }}>
      {STEPS.map((label, i) => (
        <div key={label} style={{ textAlign: 'center', flex: 1 }}>
          <StepDot step={step} i={i} />
          <span className="rb-label" style={{ fontSize: 10, opacity: i <= step ? 1 : 0.4 }}>{label}</span>
        </div>
      ))}
    </div>
  );
}

function StepDot({ step, i }) {
  return (
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
  );
}

export default function RegisterPage({ onAuth }) {
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
    setStep(1);
  };

  const nextFromQr = (e) => {
    e.preventDefault();
    setError('');
    const code = parseShoeCode(shoeCode || manualCode);
    if (!code) {
      setError('Отсканируйте QR или введите код вручную');
      return;
    }
    setShoeCode(code);
    setStep(2);
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
          unique_id: shoeCode,
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
          <button type="button" className="rb-header__avatar" onClick={() => setStep(step - 1)} aria-label="Назад">
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
              <h2 className="font-display" style={{ fontSize: 22, margin: '0 0 20px' }}>Ваши данные</h2>
              <label className="rb-label" style={{ display: 'block', marginBottom: 6 }}>Имя</label>
              <div className="rb-input-wrap" style={{ marginBottom: 14 }}>
                <input className="rb-input" value={firstName} onChange={(e) => setFirstName(e.target.value)} required />
              </div>
              <label className="rb-label" style={{ display: 'block', marginBottom: 6 }}>Фамилия</label>
              <div className="rb-input-wrap" style={{ marginBottom: 14 }}>
                <input className="rb-input" value={lastName} onChange={(e) => setLastName(e.target.value)} required />
              </div>
              <label className="rb-label" style={{ display: 'block', marginBottom: 6 }}>Номер телефона</label>
              <div className="rb-input-wrap" style={{ marginBottom: 14 }}>
                <input className="rb-input" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+992 …" required />
              </div>
              {error && <p className="rb-text-error">{error}</p>}
              <button type="submit" className="rb-btn-pill" style={{ width: '100%', marginTop: 16 }}>
                Далее
                <Icon name="arrow_forward" />
              </button>
            </form>
          )}

          {step === 1 && (
            <form onSubmit={nextFromQr}>
              <h2 className="font-display" style={{ fontSize: 22, margin: '0 0 8px', textAlign: 'center' }}>Сканируйте QR</h2>
              <p className="rb-text-muted" style={{ textAlign: 'center', marginBottom: 20 }}>
                Наведите камеру на QR-код на кроссовках RunBonus
              </p>
              <QrScanner onScan={handleScan} active={step === 1} />
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
              <button type="submit" className="rb-btn-pill" style={{ width: '100%', marginTop: 16 }}>
                Далее
                <Icon name="arrow_forward" />
              </button>
            </form>
          )}

          {step === 2 && (
            <form onSubmit={finish} className="glass-effect" style={{ padding: 24, borderRadius: 24 }}>
              <h2 className="font-display" style={{ fontSize: 22, margin: '0 0 8px' }}>Завершить регистрацию</h2>
              <p className="rb-text-muted" style={{ marginBottom: 20 }}>
                Кроссовки: <strong style={{ color: 'var(--rb-neon)' }}>{shoeCode}</strong>
              </p>
              <label className="rb-label" style={{ display: 'block', marginBottom: 6 }}>Пароль</label>
              <div className="rb-input-wrap" style={{ marginBottom: 14 }}>
                <input className="rb-input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
              </div>
              <label className="rb-label" style={{ display: 'block', marginBottom: 6 }}>Повторите пароль</label>
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
            <Link to="/login" className="rb-link">Уже есть аккаунт</Link>
          </p>
        </main>
      </IonContent>
    </IonPage>
  );
}
