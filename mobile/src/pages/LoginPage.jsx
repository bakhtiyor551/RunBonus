import { useState } from 'react';
import { Link } from 'react-router-dom';
import { IonPage, IonContent } from '@ionic/react';
import { api } from '../api';
import Icon from '../components/Icon';

export default function LoginPage({ onAuth }) {
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    try {
      const data = await api('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ phone, password }),
      });
      onAuth(data);
    } catch (err) {
      setError(err.message);
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
          <Icon name="bolt" filled style={{ color: 'var(--rb-neon)' }} />
          <h1 className="rb-header__logo">RunBonus</h1>
        </div>
      </header>
      <IonContent>
        <main style={{ padding: '24px', maxWidth: 420, margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: 32 }}>
            <h1 className="font-display" style={{ fontSize: 32, margin: '0 0 8px', color: '#fff' }}>Бегай. Зарабатывай.</h1>
            <p className="rb-text-muted">Войдите по телефону и паролю</p>
          </div>

          <form onSubmit={submit} className="glass-effect" style={{ padding: 24, borderRadius: 24 }}>
            <label className="rb-label" style={{ display: 'block', marginBottom: 8 }}>Телефон</label>
            <div className="rb-input-wrap" style={{ marginBottom: 16 }}>
              <input className="rb-input" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+992 …" required />
            </div>

            <label className="rb-label" style={{ display: 'block', marginBottom: 8 }}>Пароль</label>
            <motionPasswordWrap password={password} setPassword={setPassword} />

            {error && <p className="rb-text-error">{error}</p>}

            <button type="submit" className="rb-btn-pill" style={{ width: '100%', marginTop: 16 }}>
              Войти
              <Icon name="arrow_forward" />
            </button>
          </form>

          <p style={{ textAlign: 'center', marginTop: 24 }}>
            <Link to="/register" className="rb-link">Создать аккаунт</Link>
          </p>
        </main>
      </IonContent>
    </IonPage>
  );
}

function motionPasswordWrap({ password, setPassword }) {
  return (
    <div className="rb-input-wrap" style={{ marginBottom: 16 }}>
      <input className="rb-input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
    </div>
  );
}
