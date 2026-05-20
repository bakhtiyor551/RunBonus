import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { IonPage, IonContent } from '@ionic/react';
import { api } from '../api';
import AppHeader from '../components/AppHeader';
import BottomNav from '../components/BottomNav';
import Icon from '../components/Icon';
import { formatBalance } from '../utils/format';

export default function WalletPage({ user }) {
  const navigate = useNavigate();
  const [items, setItems] = useState([]);
  const [wallet, setWallet] = useState({
    balance: user?.balance ?? 0,
    blocked_balance: user?.blocked_balance ?? 0,
    available_balance: user?.available_balance ?? user?.balance ?? 0,
  });

  useEffect(() => {
    api('/api/bonus/history').then(setItems).catch(() => {});
    api('/api/withdrawal/wallet-summary')
      .then(setWallet)
      .catch(() => {});
  }, []);

  const available = wallet.available_balance;
  const blocked = wallet.blocked_balance;

  return (
    <IonPage>
      <AppHeader />
      <IonContent>
        <main className="rb-main">
          <section style={{ marginBottom: 32 }}>
            <div className="glass-card neon-glow" style={{ padding: 'var(--rb-card-padding)' }}>
              <p className="rb-label">Доступный баланс</p>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginTop: 4 }}>
                <span className="rb-display font-display">{formatBalance(available)}</span>
                <span style={{ fontFamily: 'Space Grotesk', fontSize: 20, color: 'var(--rb-neon-dim)' }}>сомони</span>
              </div>
              {blocked > 0 && (
                <p className="rb-text-muted" style={{ marginTop: 8, fontSize: 13 }}>
                  Заблокировано: {formatBalance(blocked)} сомони
                </p>
              )}
            </div>
            <button
              type="button"
              className="rb-btn-pill"
              style={{ width: '100%', marginTop: 16 }}
              onClick={() => navigate('/wallet/withdraw')}
            >
              <Icon name="account_balance_wallet" />
              Вывод средств
            </button>
          </section>
          <section>
            <h2 className="rb-headline font-display" style={{ marginBottom: 16 }}>История операций</h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {items.map((item) => {
                const isEarn = item.type === 'earn';
                const isWithdraw =
                  item.type === 'withdraw_hold' ||
                  item.type === 'withdraw_success' ||
                  item.type === 'withdraw_reject';
                const sign = isEarn ? '+' : isWithdraw || item.type === 'spend' ? '−' : '';
                const color = isEarn ? 'var(--rb-neon)' : 'var(--rb-on-surface)';
                const icon = isEarn
                  ? 'trending_up'
                  : isWithdraw
                    ? 'south_west'
                    : 'payments';
                return (
                  <div key={item.id} className="glass-card rb-activity-card">
                    <div className="rb-activity-card__icon">
                      <Icon name={icon} />
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
