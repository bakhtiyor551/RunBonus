import { useEffect, useState } from 'react';
import { adminApi } from './api';

const STATUS_OPTIONS = [
  { value: 'new', label: 'Новый' },
  { value: 'confirmed', label: 'Подтверждён' },
  { value: 'paid', label: 'Оплачен' },
  { value: 'qr_issued', label: 'QR выдан' },
  { value: 'delivered', label: 'Доставлен' },
  { value: 'cancelled', label: 'Отменён' },
];

export default function ShopOrdersTab() {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [qrForms, setQrForms] = useState({});

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

  return (
    <div className="page-content">
      <div className="glass-card card">
        <h2>Заказы магазина</h2>
        {loading && <p>Загрузка…</p>}
        <div className="table-scroll">
          <table className="data-table">
            <thead>
              <tr>
                <th>ID</th>
                <th>Дата</th>
                <th>Клиент</th>
                <th>Телефон</th>
                <th>Товар</th>
                <th>Размер</th>
                <th>Сумма</th>
                <th>Оплата</th>
                <th>Статус</th>
                <th>Комментарий</th>
                <th>QR</th>
              </tr>
            </thead>
            <tbody>
              {orders.map((o) => (
                <tr key={o.id}>
                  <td>{o.id}</td>
                  <td>{new Date(o.created_at).toLocaleString('ru-RU')}</td>
                  <td>{o.customer_name}</td>
                  <td>{o.phone}</td>
                  <td>{o.product_name}</td>
                  <td>{o.size}</td>
                  <td>{o.total_amount}</td>
                  <td>
                    {o.payment_method_label || o.payment_method || '—'}
                    {o.payment_details ? (
                      <div style={{ fontSize: 11, opacity: 0.8 }}>{o.payment_details}</div>
                    ) : null}
                  </td>
                  <td>
                    <select value={o.status} onChange={(e) => setStatus(o.id, e.target.value)}>
                      {STATUS_OPTIONS.map((s) => (
                        <option key={s.value} value={s.value}>
                          {s.label}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td>{o.comment || '—'}</td>
                  <td>
                    {o.status !== 'qr_issued' && o.user_id ? (
                      <div style={{ display: 'flex', gap: 4, flexDirection: 'column', minWidth: 140 }}>
                        <input
                          placeholder="SHOE-..."
                          value={qrForms[o.id] || ''}
                          onChange={(e) => setQrForms({ ...qrForms, [o.id]: e.target.value })}
                        />
                        <button type="button" className="btn btn--sm" onClick={() => assignQr(o.id)}>
                          Выдать QR
                        </button>
                      </div>
                    ) : (
                      o.assigned_shoe_code || '—'
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
