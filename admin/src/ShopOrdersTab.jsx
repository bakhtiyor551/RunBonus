import { useEffect, useState } from 'react';
import { adminApi } from './api';

const STATUSES = ['new', 'confirmed', 'paid', 'qr_issued', 'delivered', 'cancelled'];

export default function ShopOrdersTab() {
  const [orders, setOrders] = useState([]);
  const [couriers, setCouriers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [qrForms, setQrForms] = useState({});
  const [courierPick, setCourierPick] = useState({});

  const load = () => {
    setLoading(true);
    Promise.all([
      adminApi('/api/admin/shop/orders'),
      adminApi('/api/admin/shop/couriers'),
    ])
      .then(([ords, curs]) => {
        setOrders(ords);
        setCouriers((curs || []).filter((c) => c.status === 'active'));
      })
      .catch(() => {
        setOrders([]);
        setCouriers([]);
      })
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

  const assignDelivery = async (orderId) => {
    const courier_id = courierPick[orderId];
    if (!courier_id) {
      alert('Выберите курьера');
      return;
    }
    try {
      await adminApi(`/api/admin/shop/orders/${orderId}/delivery`, {
        method: 'PUT',
        body: JSON.stringify({ courier_id: Number(courier_id) }),
      });
      alert('Курьер назначен — клиент увидит в приложении');
      load();
    } catch (err) {
      alert(err.message);
    }
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
        <p className="hint">Назначьте курьера для доставки — в приложении клиент увидит имя и телефон курьера.</p>
        {loading && <p>Загрузка…</p>}
        <div className="table-scroll">
          <table className="data-table">
            <thead>
              <tr>
                <th>ID</th>
                <th>Дата</th>
                <th>Клиент</th>
                <th>Адрес</th>
                <th>Товар</th>
                <th>Сумма</th>
                <th>Доставка / курьер</th>
                <th>Статус</th>
                <th>QR</th>
              </tr>
            </thead>
            <tbody>
              {orders.map((o) => (
                <tr key={o.id}>
                  <td>{o.id}</td>
                  <td>{new Date(o.created_at).toLocaleString('ru-RU')}</td>
                  <td>
                    {o.customer_name}
                    <div style={{ fontSize: 11, opacity: 0.8 }}>{o.phone}</div>
                  </td>
                  <td style={{ maxWidth: 140, fontSize: 12 }}>
                    {o.city || '—'}
                    {o.address ? `, ${o.address}` : ''}
                  </td>
                  <td>
                    {o.product_name}
                    <div style={{ fontSize: 11 }}>р. {o.size}</div>
                  </td>
                  <td>{o.total_amount}</td>
                  <td style={{ minWidth: 180 }}>
                    {o.courier_name ? (
                      <div>
                        <strong>{o.courier_name}</strong>
                        <div style={{ fontSize: 11 }}>{o.courier_phone}</div>
                        {o.delivery_assigned_at && (
                          <div style={{ fontSize: 10, opacity: 0.7 }}>
                            {new Date(o.delivery_assigned_at).toLocaleString('ru-RU')}
                          </div>
                        )}
                      </div>
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                        <select
                          value={courierPick[o.id] || ''}
                          onChange={(e) => setCourierPick({ ...courierPick, [o.id]: e.target.value })}
                        >
                          <option value="">Выберите курьера</option>
                          {couriers.map((c) => (
                            <option key={c.id} value={c.id}>
                              {c.name} ({c.phone})
                            </option>
                          ))}
                        </select>
                        <button type="button" className="btn btn--sm" onClick={() => assignDelivery(o.id)}>
                          Назначить
                        </button>
                      </div>
                    )}
                  </td>
                  <td>
                    <select value={o.status} onChange={(e) => setStatus(o.id, e.target.value)}>
                      {STATUSES.map((s) => (
                        <option key={s} value={s}>
                          {s}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td>
                    {o.status !== 'qr_issued' && o.user_id ? (
                      <div style={{ display: 'flex', gap: 4, flexDirection: 'column', minWidth: 120 }}>
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
