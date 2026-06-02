import { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { IonPage, IonContent } from '@ionic/react';
import { api } from '../api';
import AppHeader from '../components/AppHeader';
import Icon from '../components/Icon';
import QrScanner, { parseShoeCode } from '../components/QrScanner';

export default function ActivatePage({ onActivated, user }) {
  const navigate = useNavigate();
  const qrAllowed = user?.qrActivationAllowed !== false;
  const [code, setCode] = useState('');
  const [manualCode, setManualCode] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);

  const handleScan = useCallback((scanned) => {
    setCode(scanned);
    setManualCode(scanned);
    setError('');
  }, []);

  const activate = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    if (!qrAllowed) {
      setError('Активация QR доступна только на устройстве, где вы впервые вошли в приложение.');
      return;
    }
    const unique_id = parseShoeCode(code || manualCode);
    if (!unique_id) {
      setError('Отсканируйте QR или введите код');
      return;
    }
    setLoading(true);
    try {
      const data = await api('/api/shoes/activate', {
        method: 'POST',
        body: JSON.stringify({ unique_id }),
      });
      setSuccess(data.message);
      setTimeout(onActivated, 800);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <IonPage>
      <AppHeader showAvatar={false} onBack={() => navigate(-1)} />
      <IonContent fullscreen className="ion-padding">
        <main className="rb-main">
          <h2 className="font-display" style={{ fontSize: 22, textAlign: 'center', marginBottom: 8 }}>Сканируйте QR</h2>
          <p className="rb-text-muted" style={{ textAlign: 'center', marginBottom: 20 }}>
            QR-код на кроссовках RunBonus
          </p>

          {!qrAllowed && (
            <div className="glass-card rb-detail-sheet__alert" style={{ marginBottom: 20, padding: 14 }}>
              <p style={{ margin: 0, fontSize: 14, lineHeight: 1.45 }}>
                Это другое устройство. Активировать QR можно только на телефоне, где вы зарегистрировались или
                впервые вошли в аккаунт.
              </p>
            </div>
          )}

          <QrScanner onScan={handleScan} active={qrAllowed} />

          {(code || manualCode) && (
            <p style={{ textAlign: 'center', color: 'var(--rb-neon)', marginTop: 12, fontWeight: 600 }}>
              Код: {code || manualCode}
            </p>
          )}

          <form onSubmit={activate} className="glass-effect" style={{ padding: 24, borderRadius: 24, marginTop: 24 }}>
            <label className="rb-label" style={{ display: 'block', marginBottom: 8 }}>или введите ID вручную</label>
            <div className="rb-input-wrap">
              <input
                className="rb-input"
                value={manualCode}
                onChange={(e) => setManualCode(e.target.value.toUpperCase())}
                placeholder="SHOE-..."
              />
            </div>
            {error && <p className="rb-text-error">{error}</p>}
            {success && <p style={{ color: 'var(--rb-neon)' }}>{success}</p>}
            <button type="submit" className="rb-btn-pill" style={{ width: '100%', marginTop: 16 }} disabled={loading || !qrAllowed}>
              {loading ? 'Активация…' : 'Активировать'}
            </button>
          </form>
          <p className="rb-text-muted" style={{ marginTop: 16, fontSize: 12, textAlign: 'center' }}>Демо: SHOE-DEMO-001</p>
        </main>
      </IonContent>
    </IonPage>
  );
}
