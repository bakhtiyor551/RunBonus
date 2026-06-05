import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { IonPage, IonContent } from '@ionic/react';
import { api } from '../api';
import AppHeader from '../components/AppHeader';
import BottomNav from '../components/BottomNav';
import Icon from '../components/Icon';

const STATUS_COLORS = {
  new: 'var(--rb-neon)',
  confirmed: 'var(--rb-neon-dim)',
  paid: '#7dd3fc',
  qr_issued: 'var(--rb-neon)',
  delivered: '#86efac',
  cancelled: 'var(--rb-error)',
};

export default function MyOrdersPage() {
  const navigate = useNavigate();
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
      <AppHeader onBack={() => navigate('/shop')} />
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
              <button type="button" className="rb-btn-pill" style={{ marginTop: 16 }} onClick={() => navigate('/shop')}>
                В магазин
              </button>
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
                {(o.delivery_method_label || o.delivery_method) && (
                  <p className="rb-text-muted" style={{ margin: '6px 0 0', fontSize: 13 }}>
                    {o.delivery_method_label || o.delivery_method}
                  </p>
                )}
                {(o.city || o.address) && (
                  <p className="rb-text-muted" style={{ margin: '4px 0 0', fontSize: 13 }}>
                    {[o.city, o.address].filter(Boolean).join(', ')}
                  </p>
                )}
                {o.courier_name && (
                  <div
                    className="glass-card"
                    style={{
                      marginTop: 10,
                      padding: 12,
                      border: '1px solid rgba(195, 244, 0, 0.25)',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                      <Icon name="local_shipping" style={{ color: 'var(--rb-neon)' }} />
                      <strong style={{ fontSize: 14 }}>Доставка</strong>
                    </div>
                    <p style={{ margin: 0, fontSize: 14 }}>
                      Курьер: <span style={{ color: 'var(--rb-neon)' }}>{o.courier_name}</span>
                    </p>
                    <a
                      href={`tel:${o.courier_phone}`}
                      style={{ marginTop: 4, display: 'inline-block', fontSize: 14, color: 'var(--rb-on-surface)' }}
                    >
                      {o.courier_phone}
                    </a>
                  </div>
                )}
                {!o.courier_name && o.status !== 'cancelled' && o.status !== 'delivered' && (
                  <p className="rb-text-muted" style={{ margin: '8px 0 0', fontSize: 13 }}>
                    Курьер будет назначен после подтверждения заказа
                  </p>
                )}
                <p className="rb-label" style={{ margin: '8px 0 0', textTransform: 'none' }}>
                  {new Date(o.created_at).toLocaleString('ru-RU')}
                </p>
                {o.status === 'qr_issued' && (
                  <p style={{ marginTop: 8, color: 'var(--rb-neon)', fontSize: 13 }}>
                    QR выдан — отсканируйте код на главной или в разделе «Сканировать QR»
                  </p>
                )}
              </div>
            ))}
          </div>
        </main>
      </IonContent>
      <BottomNav />
    </IonPage>
  );
}
