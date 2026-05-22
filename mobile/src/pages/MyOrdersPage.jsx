import { useEffect, useState } from 'react';
import { IonPage, IonContent } from '@ionic/react';
import { api } from '../api';
import AppHeader from '../components/AppHeader';
import BottomNavNoShoe from '../components/BottomNavNoShoe';
import Icon from '../components/Icon';

const STATUS_COLORS = {
  new: 'var(--rb-neon)',
  confirmed: 'var(--rb-neon-dim)',
  paid: '#7dd3fc',
  qr_issued: 'var(--rb-neon)',
  delivered: '#86efac',
  cancelled: 'var(--rb-error)',
};

export default function MyOrdersPage({ limitedMode = true }) {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api('/api/mobile/my-orders')
      .then(setOrders)
      .catch(() => setOrders([]))
      .finally(() => setLoading(false));
  }, []);

  return (
    <IonPage>
      <AppHeader />
      <IonContent>
        <main className="rb-main">
          <h1 className="rb-headline font-display" style={{ marginBottom: 16 }}>
            Мои заказы
          </h1>
          {loading && <p className="rb-text-muted">Загрузка…</p>}
          {!loading && !orders.length && (
            <div className="glass-card" style={{ padding: 24, textAlign: 'center' }}>
              <Icon name="shopping_bag" style={{ fontSize: 48, opacity: 0.5 }} />
              <p className="rb-text-muted" style={{ marginTop: 12 }}>
                Заказов пока нет. Перейдите в магазин.
              </p>
            </div>
          )}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {orders.map((o) => (
              <div key={o.id} className="glass-card" style={{ padding: 16 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                  <strong>#{o.id}</strong>
                  <span style={{ color: STATUS_COLORS[o.status] || 'inherit', fontSize: 12, fontWeight: 600 }}>
                    {o.status_label}
                  </span>
                </div>
                <p style={{ margin: '8px 0 0', fontWeight: 600 }}>{o.product_name}</p>
                <p className="rb-text-muted" style={{ margin: '4px 0 0', fontSize: 13 }}>
                  Размер {o.size || '—'} · {o.total_amount} сомони
                </p>
                <p className="rb-label" style={{ margin: '8px 0 0', textTransform: 'none' }}>
                  {new Date(o.created_at).toLocaleString('ru-RU')}
                </p>
                {o.status === 'qr_issued' && (
                  <p style={{ marginTop: 8, color: 'var(--rb-neon)', fontSize: 13 }}>
                    QR выдан — активируйте кроссовки во вкладке «Активация»
                  </p>
                )}
              </div>
            ))}
          </div>
        </main>
        {limitedMode && <BottomNavNoShoe />}
      </IonContent>
    </IonPage>
  );
}
