import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { IonPage, IonContent, IonRefresher, IonRefresherContent } from '@ionic/react';
import { api, API_URL } from '../api';
import AppHeader from '../components/AppHeader';
import BottomNav from '../components/BottomNav';
import Icon from '../components/Icon';

const STATUS_META = {
  new: { color: 'var(--rb-neon)', icon: 'schedule', hint: 'Ожидает подтверждения' },
  confirmed: { color: '#a5b4fc', icon: 'check_circle', hint: 'Заказ подтверждён' },
  paid: { color: '#7dd3fc', icon: 'payments', hint: 'Оплата получена' },
  qr_issued: { color: 'var(--rb-neon)', icon: 'directions_run', hint: 'Кроссовки привязаны, ждём доставку' },
  delivered: { color: '#86efac', icon: 'verified', hint: 'Доставлен — кроссовки активированы' },
  cancelled: { color: 'var(--rb-error)', icon: 'cancel', hint: 'Заказ отменён' },
};

function money(n) {
  const v = Number(n);
  if (!Number.isFinite(v)) return '—';
  return `${v.toLocaleString('ru-RU', { maximumFractionDigits: 2 })} с.`;
}

function mediaUrl(path) {
  if (!path) return null;
  if (/^https?:\/\//i.test(path)) return path;
  let p = path;
  if (p.startsWith('/uploads/')) p = `/api${p}`;
  const base = (API_URL || '').replace(/\/$/, '');
  return `${base}${p.startsWith('/') ? p : `/${p}`}`;
}

function formatWhen(iso) {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString('ru-RU', {
      day: '2-digit',
      month: 'long',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return String(iso);
  }
}

function OrderCard({ order }) {
  const meta = STATUS_META[order.status] || STATUS_META.new;
  const img = mediaUrl(order.product_image);
  const qty = Number(order.quantity) || 1;
  const unit = Number(order.price) || 0;
  const deliveryFee = Number(order.delivery_fee) || 0;
  const total = Number(order.total_amount) || unit * qty + deliveryFee;

  return (
    <article className="rb-order-card glass-card">
      <header className="rb-order-card__head">
        <div className="rb-order-card__id">
          <span className="rb-label">Заказ</span>
          <strong className="font-display font-tabular">#{order.id}</strong>
        </div>
        <span className="rb-order-chip" style={{ color: meta.color, borderColor: meta.color }}>
          <Icon name={meta.icon} />
          {order.status_label || order.status}
        </span>
      </header>

      <div className="rb-order-card__product">
        <div className="rb-order-card__thumb" aria-hidden>
          {img ? (
            <img src={img} alt="" />
          ) : (
            <Icon name="shopping_bag" filled />
          )}
        </div>
        <div className="rb-order-card__product-body">
          <h2 className="font-display">{order.product_name || 'Товар'}</h2>
          <p className="rb-text-muted">
            {[
              order.size ? `Размер ${order.size}` : null,
              order.product_color || order.order_color || null,
              qty > 1 ? `${qty} шт.` : null,
            ]
              .filter(Boolean)
              .join(' · ') || '—'}
          </p>
        </div>
      </div>

      <div className="rb-order-card__hint" style={{ borderColor: `${meta.color}55` }}>
        <Icon name="info" style={{ color: meta.color }} />
        <span>{meta.hint}</span>
      </div>

      <dl className="rb-order-facts">
        <div>
          <dt>
            <Icon name="payments" /> Оплата
          </dt>
          <dd>{order.payment_method_label || order.payment_method || '—'}</dd>
        </div>
        <div>
          <dt>
            <Icon name="local_shipping" /> Доставка
          </dt>
          <dd>{order.delivery_method_label || order.delivery_method || '—'}</dd>
        </div>
        {(order.city || order.address) && (
          <div className="rb-order-facts__full">
            <dt>
              <Icon name="location_on" /> Адрес
            </dt>
            <dd>{[order.city, order.address].filter(Boolean).join(', ')}</dd>
          </div>
        )}
        {order.customer_name && (
          <div>
            <dt>
              <Icon name="person" /> Получатель
            </dt>
            <dd>{order.customer_name}</dd>
          </div>
        )}
        {order.phone && (
          <div>
            <dt>
              <Icon name="call" /> Телефон
            </dt>
            <dd>
              <a href={`tel:${order.phone}`}>{order.phone}</a>
            </dd>
          </div>
        )}
        {order.assigned_shoe_code && (
          <div className="rb-order-facts__full">
            <dt>
              <Icon name="directions_run" /> Код кроссовок
            </dt>
            <dd className="font-tabular rb-order-code">{order.assigned_shoe_code}</dd>
          </div>
        )}
        {order.comment && (
          <div className="rb-order-facts__full">
            <dt>
              <Icon name="chat" /> Комментарий
            </dt>
            <dd>{order.comment}</dd>
          </div>
        )}
      </dl>

      <div className="rb-order-totals">
        <div className="rb-order-totals__row">
          <span>Товар{qty > 1 ? ` × ${qty}` : ''}</span>
          <strong className="font-tabular">{money(unit * qty)}</strong>
        </div>
        {deliveryFee > 0 && (
          <div className="rb-order-totals__row">
            <span>Доставка</span>
            <strong className="font-tabular">{money(deliveryFee)}</strong>
          </div>
        )}
        <div className="rb-order-totals__row rb-order-totals__row--sum">
          <span>Итого</span>
          <strong className="font-display font-tabular">{money(total)}</strong>
        </div>
      </div>

      {order.courier_name ? (
        <div className="rb-order-courier">
          <div className="rb-order-courier__head">
            <Icon name="local_shipping" filled />
            <div>
              <span className="rb-label">Курьер</span>
              <strong>{order.courier_name}</strong>
            </div>
          </div>
          {order.courier_phone && (
            <a className="rb-btn-pill rb-btn-pill--sm" href={`tel:${order.courier_phone}`}>
              <Icon name="call" />
              {order.courier_phone}
            </a>
          )}
        </div>
      ) : order.status !== 'cancelled' && order.status !== 'delivered' ? (
        <p className="rb-order-waiting">
          <Icon name="hourglass_empty" />
          Курьер будет назначен после подтверждения заказа
        </p>
      ) : null}

      {order.status === 'delivered' && (
        <p className="rb-order-success">
          <Icon name="check_circle" filled />
          Можно начинать тренировки
        </p>
      )}

      <footer className="rb-order-card__foot">
        <Icon name="calendar_today" />
        {formatWhen(order.created_at)}
      </footer>
    </article>
  );
}

export default function MyOrdersPage() {
  const navigate = useNavigate();
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    try {
      const data = await api('/api/mobile/my-orders');
      setOrders(Array.isArray(data) ? data : []);
    } catch {
      setOrders([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const stats = useMemo(() => {
    const active = orders.filter((o) => !['cancelled', 'delivered'].includes(o.status)).length;
    const done = orders.filter((o) => o.status === 'delivered').length;
    return { active, done, total: orders.length };
  }, [orders]);

  return (
    <IonPage>
      <AppHeader onBack={() => navigate('/shop')} />
      <IonContent>
        <IonRefresher
          slot="fixed"
          onIonRefresh={async (e) => {
            await load();
            e.detail.complete();
          }}
        >
          <IonRefresherContent />
        </IonRefresher>

        <main className="rb-main rb-orders-page">
          <header className="rb-orders-hero">
            <div>
              <p className="rb-label" style={{ margin: 0 }}>
                Магазин RunBonus
              </p>
              <h1 className="font-display rb-headline" style={{ margin: '6px 0 0' }}>
                Мои заказы
              </h1>
            </div>
            {!loading && stats.total > 0 && (
              <div className="rb-orders-hero__stats">
                <span>
                  <strong className="font-tabular">{stats.total}</strong> всего
                </span>
                {stats.active > 0 && (
                  <span>
                    <strong className="font-tabular">{stats.active}</strong> в работе
                  </span>
                )}
              </div>
            )}
          </header>

          {loading && <p className="rb-text-muted">Загрузка…</p>}

          {!loading && !orders.length && (
            <div className="rb-orders-empty glass-card">
              <div className="rb-orders-empty__icon">
                <Icon name="shopping_bag" filled />
              </div>
              <h2 className="font-display">Пока нет заказов</h2>
              <p className="rb-text-muted">
                Выберите кроссовки в магазине — после доставки они активируются автоматически.
              </p>
              <button type="button" className="rb-btn-primary" onClick={() => navigate('/shop')}>
                <Icon name="storefront" />
                Открыть магазин
              </button>
            </div>
          )}

          <div className="rb-orders-list">
            {orders.map((o) => (
              <OrderCard key={o.id} order={o} />
            ))}
          </div>
        </main>
      </IonContent>
      <BottomNav />
    </IonPage>
  );
}
