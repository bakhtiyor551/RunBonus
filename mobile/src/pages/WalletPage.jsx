import { useEffect, useState } from 'react';
import { IonPage, IonContent } from '@ionic/react';
import { api } from '../api';
import AppHeader from '../components/AppHeader';
import BottomNav from '../components/BottomNav';
import Icon from '../components/Icon';
import { formatBalance } from '../utils/format';

export default function WalletPage({ user }) {
  const [items, setItems] = useState([]);

  useEffect(() => {
    api('/api/bonus/history').then(setItems).catch(() => {});
  }, []);

  return (
    <IonPage>
      <AppHeader />
      <IonContent>
        <main className="rb-main">
          <section style={{ marginBottom: 32 }}>
            <div className="glass-card neon-glow" style={{ padding: 'var(--rb-card-padding)' }}>
              <p className="rb-label">Доступный баланс</p>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginTop: 4 }}>
                <span className="rb-display font-display">{formatBalance(user.balance)}</span>
                <span style={{ fontFamily: 'Space Grotesk', fontSize: 20, color: 'var(--rb-neon-dim)' }}>сомони</span>
              </div>
            </div>
          </section>
          <section>
            <h2 className="rb-headline font-display" style={{ marginBottom: 16 }}>История операций</h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {items.map((item) => {
                const sign = item.type === 'earn' ? '+' : item.type === 'spend' ? '−' : '';
                const color = item.type === 'earn' ? 'var(--rb-neon)' : 'var(--rb-on-surface)';
                return (
                  <div key={item.id} className="glass-card rb-activity-card">
                    <div className="rb-activity-card__icon">
                      <Icon name={item.type === 'earn' ? 'trending_up' : 'payments'} />
                    </div>
                    <div style={{ flex: 1 }}>
                      <p style={{ margin: 0, fontWeight: 600 }}>{new Date(item.date).toLocaleString('ru')}</p>
                      <p className="rb-text-muted" style={{ margin: '4px 0 0', fontSize: 13 }}>
                        {item.status}{item.km != null ? ` • ${item.km} км` : ''}
                      </p>
                    </div>
                    <span className="rb-headline font-display" style={{ color, fontSize: 18 }}>{sign}{item.amount}</span>
                  </div>
                );
              })}
              {!items.length && <p className="rb-text-muted">История пуста</p>}
            </div>
          </section>
        </main>
        <BottomNav />
      </IonContent>
    </IonPage>
  );
}
