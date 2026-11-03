import { useEffect, useState } from 'react';
import { adminApi, mediaUrl } from './api';
import Icon from './components/Icon';
import { formatMoney } from './utils/format';

const STATUS_OPTIONS = [
  { value: 'new', label: 'Новый' },
  { value: 'confirmed', label: 'Подтверждён' },
  { value: 'paid', label: 'Оплачен' },
  { value: 'qr_issued', label: 'Кроссовки привязаны' },
  { value: 'delivered', label: 'Доставлен' },
  { value: 'cancelled', label: 'Отменён' },
];

const STATUS_CLASS = {
  new: 'shop-order-status--new',
  confirmed: 'shop-order-status--confirmed',
  paid: 'shop-order-status--paid',
  qr_issued: 'shop-order-status--qr',
  delivered: 'shop-order-status--delivered',
  cancelled: 'shop-order-status--cancelled',
};

function statusLabel(value) {
  return STATUS_OPTIONS.find((s) => s.value === value)?.label || value;
}

function OrderReceipt({ order, large = false }) {
  const url = mediaUrl(order.payment_receipt_url);
  if (!url) {
    return (
      <div className={`shop-order-receipt shop-order-receipt--empty${large ? ' shop-order-receipt--large' : ''}`}>
        <Icon name="receipt_long" />
        <span>Чек не прикреплён</span>
      </div>
    );
  }

  return (
    <div className={`shop-order-receipt${large ? ' shop-order-receipt--large' : ''}`}>
      <a href={url} target="_blank" rel="noreferrer" className="shop-order-receipt__link">
        <img src={url} alt={`Чек заказа #${order.id}`} className="shop-order-receipt__img" />
        <span className="shop-order-receipt__zoom">
          <Icon name="open_in_new" />
          Открыть
        </span>
      </a>
    </div>
  );
}

function ShopOrderCard({
  order,
  selected,
  onSelect,
  onStatusChange,
}) {
  return (
    <article
      className={`shop-order-card glass-card${selected ? ' entity-card--selected' : ''}`}
      role="button"
      tabIndex={0}
      onClick={() => onSelect(order.id)}
      onKeyDown={(e) => e.key === 'Enter' && onSelect(order.id)}
    >
      <div className="entity-card__head">
        <span className="shop-order-card__id">#{order.id}</span>
        <span className={`chip shop-order-status ${STATUS_CLASS[order.status] || ''}`}>
          {order.status_label || statusLabel(order.status)}
        </span>
      </div>

      <h3 className="entity-card__title">{order.customer_name || 'Без имени'}</h3>
      <p className="entity-card__sub">
        <Icon name="call" />
        {order.phone || '—'}
      </p>

      <div className="entity-card__highlight">
        <span className="entity-card__highlight-label">Сумма</span>
        <span className="entity-card__highlight-value">{formatMoney(order.total_amount, 'TJS')}</span>
      </div>

      <p className="entity-card__meta">
        <Icon name="shopping_bag" />
        {order.product_name}
        {order.size ? ` · размер ${order.size}` : ''}
        {order.quantity > 1 ? ` · ×${order.quantity}` : ''}
      </p>

      {(order.delivery_method_label || order.delivery_method) && (
        <p className="entity-card__meta">
          <Icon name="local_shipping" />
          {order.delivery_method_label || order.delivery_method}
        </p>
      )}

      {(order.city || order.address) && (
        <p className="entity-card__meta">
          <Icon name="location_on" />
          {[order.city, order.address].filter(Boolean).join(', ')}
        </p>
      )}

      <div className="shop-order-card__payment">
        <p className="shop-order-card__payment-title">
          <Icon name="payments" />
          Оплата
        </p>
        <p className="entity-card__meta" style={{ margin: 0 }}>
          {order.payment_method_label || order.payment_method || '—'}
        </p>
        {order.payment_details && (
          <p
            className="entity-card__meta entity-card__meta--muted"
            style={{ margin: '4px 0 0', whiteSpace: 'pre-line' }}
          >
            {order.payment_method === 'mobile' ? 'Перевод' : 'Реквизиты'}: {order.payment_details}
          </p>
        )}
      </div>

      <div className="shop-order-card__receipt-wrap" onClick={(e) => e.stopPropagation()}>
        <p className="shop-order-card__receipt-label">Чек клиента</p>
        <OrderReceipt order={order} />
      </div>

      {order.comment && <p className="entity-card__sub">{order.comment}</p>}

      <p className="entity-card__meta entity-card__meta--muted">
        {new Date(order.created_at).toLocaleString('ru-RU')}
      </p>

      <div className="shop-order-card__footer" onClick={(e) => e.stopPropagation()}>
        <div className="shop-order-card__status-actions">
          <span className="shop-order-card__status-label">Статус</span>
          <div className="shop-order-status-btns">
            <button
              type="button"
              className={`btn btn--sm shop-order-status-btn${
                order.status === 'paid' || order.status === 'qr_issued' ? ' is-active is-paid' : ''
              }`}
              disabled={order.status === 'cancelled' || order.status === 'delivered'}
              onClick={() => onStatusChange(order.id, 'paid')}
            >
              <Icon name="payments" />
              Оплачено
            </button>
            <button
              type="button"
              className={`btn btn--sm shop-order-status-btn${
                order.status === 'delivered' ? ' is-active is-delivered' : ''
              }`}
              disabled={order.status === 'cancelled' || order.status === 'delivered'}
              onClick={() => onStatusChange(order.id, 'delivered')}
            >
              <Icon name="local_shipping" />
              Доставлено
            </button>
          </div>
        </div>
      </div>
    </article>
  );
}

export default function ShopOrdersTab() {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState(null);

  const load = () => {
    setLoading(true);
    adminApi('/api/admin/shop/orders')
      .then((ords) => {
        setOrders(ords);
      })
      .catch(() => {
        setOrders([]);
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, []);

  const setStatus = async (id, status) => {
    try {
      await adminApi(`/api/admin/shop/orders/${id}/status`, {
        method: 'PUT',
        body: JSON.stringify({ status }),
      });
      load();
    } catch (err) {
      alert(err.message || 'Не удалось обновить статус');
    }
  };

  const selected = orders.find((o) => o.id === selectedId);

  return (
    <div className="page-content shop-orders-page">
      <div className="shop-orders-page__header">
        <div>
          <h2 className="shop-orders-page__title">Заказы магазина</h2>
          <p className="hint">Карточки заказов с чеком оплаты от клиента</p>
        </div>
        {!loading && <span className="chip">{orders.length} заказов</span>}
      </div>

      {loading && <p className="hint">Загрузка…</p>}

      {!loading && !orders.length && (
        <div className="glass-card card">
          <p className="hint">Заказов пока нет</p>
        </div>
      )}

      <div className="shop-orders-layout">
        <div className="entity-cards-grid shop-orders-grid">
          {orders.map((o) => (
            <ShopOrderCard
              key={o.id}
              order={o}
              selected={selectedId === o.id}
              onSelect={setSelectedId}
              onStatusChange={setStatus}
            />
          ))}
        </div>

        {selected && (
          <aside className="glass-card card shop-orders-detail">
            <h3>Заказ #{selected.id}</h3>
            <p className="hint" style={{ marginBottom: 16 }}>
              {selected.customer_name} · {selected.phone}
            </p>

            <dl className="shop-orders-detail__facts">
              <div>
                <dt>Товар</dt>
                <dd>
                  {selected.product_name}
                  {selected.product_color ? ` (${selected.product_color})` : ''}
                </dd>
              </div>
              <div>
                <dt>Размер / кол-во</dt>
                <dd>
                  {selected.size || '—'} / {selected.quantity ?? 1}
                </dd>
              </div>
              <div>
                <dt>Сумма</dt>
                <dd>{formatMoney(selected.total_amount, 'TJS')}</dd>
              </div>
              <div>
                <dt>Доставка</dt>
                <dd>{selected.delivery_method_label || selected.delivery_method || '—'}</dd>
              </div>
              <div>
                <dt>Оплата</dt>
                <dd>{selected.payment_method_label || selected.payment_method || '—'}</dd>
              </div>
              {selected.payment_details && (
                <div>
                  <dt>{selected.payment_method === 'mobile' ? 'Перевод' : 'Реквизиты клиента'}</dt>
                  <dd style={{ whiteSpace: 'pre-line' }}>{selected.payment_details}</dd>
                </div>
              )}
              <div>
                <dt>Статус</dt>
                <dd>
                  <span className={`chip shop-order-status ${STATUS_CLASS[selected.status] || ''}`}>
                    {selected.status_label || statusLabel(selected.status)}
                  </span>
                </dd>
              </div>
              {selected.comment && (
                <div>
                  <dt>Комментарий</dt>
                  <dd>{selected.comment}</dd>
                </div>
              )}
            </dl>

            <div className="shop-order-status-btns shop-order-status-btns--detail">
              <button
                type="button"
                className={`btn shop-order-status-btn${
                  selected.status === 'paid' || selected.status === 'qr_issued' ? ' is-active is-paid' : ''
                }`}
                disabled={selected.status === 'cancelled' || selected.status === 'delivered'}
                onClick={() => setStatus(selected.id, 'paid')}
              >
                <Icon name="payments" />
                Оплачено
              </button>
              <button
                type="button"
                className={`btn shop-order-status-btn${
                  selected.status === 'delivered' ? ' is-active is-delivered' : ''
                }`}
                disabled={selected.status === 'cancelled' || selected.status === 'delivered'}
                onClick={() => setStatus(selected.id, 'delivered')}
              >
                <Icon name="local_shipping" />
                Доставлено
              </button>
            </div>

            <h4 className="shop-orders-detail__receipt-title">Чек клиента</h4>
            <OrderReceipt order={selected} large />
          </aside>
        )}
      </div>
    </div>
  );
}
