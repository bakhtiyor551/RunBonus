import { useEffect, useState } from 'react';
import { adminApi, mediaUrl } from './api';
import Icon from './components/Icon';
import { formatMoney } from './utils/format';

const STATUS_OPTIONS = [
  { value: 'new', label: 'Новый' },
  { value: 'confirmed', label: 'Подтверждён' },
  { value: 'paid', label: 'Оплачен' },
  { value: 'qr_issued', label: 'QR выдан' },
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
  qrValue,
  onSelect,
  onQrChange,
  onStatusChange,
  onAssignQr,
}) {
  const hasUser = Boolean(order.user_id);
  const showQrForm = order.status !== 'qr_issued' && hasUser;

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
          <p className="entity-card__meta entity-card__meta--muted" style={{ margin: '4px 0 0' }}>
            {order.payment_method === 'mobile' ? 'Кошелёк клиента' : 'Реквизиты'}: {order.payment_details}
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
        <label className="shop-order-card__status-label">
          Статус
          <select value={order.status} onChange={(e) => onStatusChange(order.id, e.target.value)}>
            {STATUS_OPTIONS.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
        </label>

        {showQrForm ? (
          <div className="shop-order-card__qr">
            <input
              placeholder="SHOE-..."
              value={qrValue}
              onChange={(e) => onQrChange(order.id, e.target.value)}
            />
            <button type="button" className="btn btn--sm" onClick={() => onAssignQr(order.id)}>
              Выдать QR
            </button>
          </div>
        ) : order.assigned_shoe_code ? (
          <p className="entity-card__meta">
            <Icon name="qr_code_2" />
            {order.assigned_shoe_code}
          </p>
        ) : null}
      </div>
    </article>
  );
}

export default function ShopOrdersTab() {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [qrForms, setQrForms] = useState({});
  const [selectedId, setSelectedId] = useState(null);

  const load = () => {
    setLoading(true);
    adminApi('/api/admin/shop/orders')
      .then(setOrders)
      .catch(() => setOrders([]))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, []);

  const setStatus = async (id, status) => {
    await adminApi(`/api/admin/shop/orders/${id}/status`, {
      method: 'PUT',
      body: JSON.stringify({ status }),
    });
    load();
  };

  const assignQr = async (id) => {
    const unique_id = qrForms[id]?.trim();
    if (!unique_id) {
      alert('Введите QR/ID кроссовок');
      return;
    }
    try {
      await adminApi(`/api/admin/shop/orders/${id}/assign-qr`, {
        method: 'POST',
        body: JSON.stringify({ unique_id }),
      });
      alert('QR привязан, кроссовки активированы');
      load();
    } catch (err) {
      alert(err.message);
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
              qrValue={qrForms[o.id] || ''}
              onSelect={setSelectedId}
              onQrChange={(id, v) => setQrForms({ ...qrForms, [id]: v })}
              onStatusChange={setStatus}
              onAssignQr={assignQr}
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
                <dt>Оплата</dt>
                <dd>{selected.payment_method_label || selected.payment_method || '—'}</dd>
              </div>
              {selected.payment_details && (
                <div>
                  <dt>Реквизиты клиента</dt>
                  <dd>{selected.payment_details}</dd>
                </div>
              )}
              <div>
                <dt>Статус</dt>
                <dd>{selected.status_label || statusLabel(selected.status)}</dd>
              </div>
              {selected.comment && (
                <div>
                  <dt>Комментарий</dt>
                  <dd>{selected.comment}</dd>
                </div>
              )}
            </dl>

            <h4 className="shop-orders-detail__receipt-title">Чек клиента</h4>
            <OrderReceipt order={selected} large />
          </aside>
        )}
      </div>
    </div>
  );
}
