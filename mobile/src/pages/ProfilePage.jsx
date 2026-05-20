import { useNavigate } from 'react-router-dom';
import { IonPage, IonContent } from '@ionic/react';
import AppHeader from '../components/AppHeader';
import BottomNav from '../components/BottomNav';
import Icon from '../components/Icon';
import { formatBalance } from '../utils/format';

export default function ProfilePage({ user, onLogout }) {
  const navigate = useNavigate();
  const shoe = user.activeShoe;

  return (
    <IonPage>
      <AppHeader showAvatar={false} />
      <IonContent>
        <main className="rb-main">
          <section style={{ textAlign: 'center', marginBottom: 32 }}>
            <div style={{ width: 120, height: 120, borderRadius: '50%', margin: '0 auto 16px', background: 'var(--rb-surface-highest)', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '2px solid rgba(195,244,0,0.3)' }}>
              <Icon name="person" style={{ fontSize: 56, color: 'var(--rb-neon)' }} />
            </div>
            <h2 className="rb-headline font-display" style={{ margin: '0 0 4px' }}>{user.name || 'Пользователь'}</h2>
            <p className="rb-text-muted">{user.phone}</p>
            <p className="rb-label" style={{ marginTop: 8 }}>{formatBalance(user.balance)} сомони</p>
          </section>

          <section style={{ marginBottom: 24 }}>
            <p className="rb-label" style={{ marginBottom: 12 }}>Подключённая обувь</p>
            <div className="glass-panel" style={{ padding: 'var(--rb-card-padding)' }}>
              {shoe ? (
                <div>
                  <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
                    <div style={{ width: 56, height: 56, borderRadius: 12, background: 'var(--rb-surface-high)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <Icon name="ice_skating" style={{ color: 'var(--rb-neon)' }} />
                    </div>
                    <motionShoeInfo shoe={shoe} />
                  </div>
                </div>
              ) : (
                <p className="rb-text-muted">Кроссовки не активированы</p>
              )}
            </div>
          </section>

          <button type="button" className="rb-btn-outline" style={{ width: '100%', marginBottom: 12 }} onClick={() => navigate('/activate')}>
            <Icon name="qr_code_scanner" /> Активировать QR
          </button>
          <button type="button" className="rb-btn-outline" style={{ width: '100%', color: 'var(--rb-error)', borderColor: 'var(--rb-error)' }} onClick={onLogout}>
            Выйти
          </button>
        </main>
        <BottomNav />
      </IonContent>
    </IonPage>
  );
}

function motionShoeInfo({ shoe }) {
  return (
    <div>
      <h3 style={{ margin: 0 }}>{shoe.model_name || 'Кроссовки'}</h3>
      <p className="rb-text-muted" style={{ margin: '4px 0 0', fontSize: 13 }}>{shoe.unique_id}</p>
    </div>
  );
}
