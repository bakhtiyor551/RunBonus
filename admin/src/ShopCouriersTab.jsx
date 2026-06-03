import { useEffect, useState } from 'react';
import { adminApi } from './api';

const EMPTY = { name: '', phone: '' };

export default function ShopCouriersTab() {
  const [couriers, setCouriers] = useState([]);
  const [form, setForm] = useState(EMPTY);
  const [loading, setLoading] = useState(true);

  const load = () => {
    setLoading(true);
    adminApi('/api/admin/shop/couriers')
      .then(setCouriers)
      .catch(() => setCouriers([]))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, []);

  const save = async (e) => {
    e.preventDefault();
    try {
      await adminApi('/api/admin/shop/couriers', {
        method: 'POST',
        body: JSON.stringify(form),
      });
      setForm(EMPTY);
      load();
    } catch (err) {
      alert(err.message);
    }
  };

  const toggleStatus = async (c) => {
    try {
      await adminApi(`/api/admin/shop/couriers/${c.id}`, {
        method: 'PUT',
        body: JSON.stringify({ status: c.status === 'active' ? 'inactive' : 'active' }),
      });
      load();
    } catch (err) {
      alert(err.message);
    }
  };

  return (
    <div className="page-content">
      <div className="glass-card card" style={{ marginBottom: 24 }}>
        <h2>Курьеры</h2>
        <p className="hint">Добавьте курьеров, затем назначайте их в разделе «Заказы».</p>
        <form className="settings-form" onSubmit={save}>
          <label>
            Имя курьера
            <input
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="Иван"
              required
            />
          </label>
          <label>
            Телефон
            <input
              value={form.phone}
              onChange={(e) => setForm({ ...form, phone: e.target.value })}
              placeholder="+992 …"
              required
            />
          </label>
          <button type="submit" className="btn btn--primary">
            Добавить курьера
          </button>
        </form>
      </div>

      <div className="glass-card card">
        <h3>Список курьеров</h3>
        {loading && <p>Загрузка…</p>}
        {!loading && !couriers.length && <p className="hint">Курьеров пока нет</p>}
        <div className="table-scroll">
          <table className="data-table">
            <thead>
              <tr>
                <th>ID</th>
                <th>Имя</th>
                <th>Телефон</th>
                <th>Статус</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {couriers.map((c) => (
                <tr key={c.id}>
                  <td>{c.id}</td>
                  <td>{c.name}</td>
                  <td>{c.phone}</td>
                  <td>{c.status === 'active' ? 'Активен' : 'Неактивен'}</td>
                  <td>
                    <button type="button" className="btn btn--sm" onClick={() => toggleStatus(c)}>
                      {c.status === 'active' ? 'Отключить' : 'Включить'}
                    </button>
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
