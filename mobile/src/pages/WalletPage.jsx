import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { IonPage, IonContent } from '@ionic/react';
import { api } from '../api';
import AppHeader from '../components/AppHeader';
import BottomNav from '../components/BottomNav';
import Icon from '../components/Icon';
import OperationRow from '../components/OperationRow';
import OperationDetailModal from '../components/OperationDetailModal';
import { formatBalance } from '../utils/format';

export default function WalletPage({ user }) {
  const navigate = useNavigate();
  const [items, setItems] = useState([]);
  const [selectedOperation, setSelectedOperation] = useState(null);
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
              {items.map((item) => (
                <OperationRow key={item.id} item={item} onPress={setSelectedOperation} />
              ))}
              {!items.length && <p className="rb-text-muted">История пуста</p>}
            </div>
          </section>
        </main>
        <BottomNav />
        <OperationDetailModal operation={selectedOperation} onClose={() => setSelectedOperation(null)} />
      </IonContent>
    </IonPage>
  );
}
