import { useEffect, useMemo, useState } from 'react';
import { adminApi } from './api';
import Icon from './components/Icon';

const REASON_LABELS = {
  receipt: 'Поступление',
  order: 'Продажа',
  cancel: 'Возврат',
  adjust: 'Корректировка',
};

const EMPTY_RECEIPT = {
  product_id: '',
  size: '',
  quantity: 1,
  comment: '',
};

export default function WarehouseTab() {
  const [stock, setStock] = useState([]);
  const [movements, setMovements] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(EMPTY_RECEIPT);
  const [filter, setFilter] = useState('');

  const load = () => {
    setLoading(true);
    Promise.all([
      adminApi('/api/admin/shop/warehouse/stock'),
      adminApi('/api/admin/shop/warehouse/movements?limit=80'),
    ])
      .then(([s, m]) => {
        setStock(s);
        setMovements(m);
      })
      .catch((e) => alert(e.message))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, []);

  const selectedProduct = useMemo(
    () => stock.find((p) => String(p.product_id) === String(form.product_id)),
    [stock, form.product_id]
  );

  const sizeOptions = useMemo(() => {
    if (!selectedProduct) return [];
    const fromStock = (selectedProduct.sizes || []).map((s) => s.size);
    if (fromStock.length) return fromStock;
    return [];
  }, [selectedProduct]);

  const filteredStock = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return stock;
    return stock.filter(
      (p) =>
        p.product_name?.toLowerCase().includes(q) ||
        p.category_name?.toLowerCase().includes(q) ||
        String(p.product_id).includes(q)
    );
  }, [stock, filter]);

  const submitReceipt = async (e) => {
    e.preventDefault();
    if (!form.product_id || !form.size?.trim()) {
      alert('Выберите товар и укажите размер');
      return;
    }
    setSaving(true);
    try {
      await adminApi('/api/admin/shop/warehouse/stock', {
        method: 'POST',
        body: JSON.stringify({
          product_id: Number(form.product_id),
          size: form.size.trim(),
          quantity: Number(form.quantity) || 1,
          comment: form.comment?.trim() || null,
        }),
      });
      setForm({ ...EMPTY_RECEIPT, product_id: form.product_id });
      load();
    } catch (err) {
      alert(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="warehouse-tab">
      <div className="glass-card card warehouse-tab__receipt">
        <h2>
          <Icon name="inventory_2" /> Поступление на склад
        </h2>
        <p className="hint">
          Добавьте товар на склад. При покупке клиентом остаток списывается автоматически; при отмене заказа — возвращается.
        </p>
        <form className="settings-form warehouse-receipt-form" onSubmit={submitReceipt}>
          <label>
            Товар
            <select
              value={form.product_id}
              onChange={(e) => setForm({ ...EMPTY_RECEIPT, product_id: e.target.value })}
              required
            >
              <option value="">— выберите —</option>
              {stock.map((p) => (
                <option key={p.product_id} value={p.product_id}>
                  #{p.product_id} {p.product_name}
                  {p.category_name ? ` (${p.category_name})` : ''}
                </option>
              ))}
            </select>
          </label>
          <label>
            Размер
            {sizeOptions.length > 0 ? (
              <select
                value={form.size}
                onChange={(e) => setForm({ ...form, size: e.target.value })}
                required
              >
                <option value="">— выберите —</option>
                {sizeOptions.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            ) : (
              <input
                placeholder="Например: 42 или M"
                value={form.size}
                onChange={(e) => setForm({ ...form, size: e.target.value })}
                required
              />
            )}
          </label>
          <label>
            Количество
            <input
              type="number"
              min="1"
              max="9999"
              value={form.quantity}
              onChange={(e) => setForm({ ...form, quantity: e.target.value })}
              required
            />
          </label>
          <label>
            Комментарий
            <input
              placeholder="Поставка, инвентаризация…"
              value={form.comment}
              onChange={(e) => setForm({ ...form, comment: e.target.value })}
            />
          </label>
          <button className="btn btn--primary" type="submit" disabled={saving}>
            {saving ? 'Сохранение…' : 'Добавить на склад'}
          </button>
        </form>
      </div>

      <div className="glass-card card">
        <div className="warehouse-tab__head">
          <h2>Остатки на складе</h2>
          <input
            className="warehouse-tab__search"
            placeholder="Поиск по названию или ID…"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          />
        </div>
        {loading ? (
          <p className="hint">Загрузка…</p>
        ) : filteredStock.length === 0 ? (
          <p className="hint">Нет товаров. Сначала создайте товар во вкладке «Магазин».</p>
        ) : (
          <div className="warehouse-stock-grid">
            {filteredStock.map((p) => (
              <article key={p.product_id} className="warehouse-stock-card">
                <div className="warehouse-stock-card__head">
                  <span className="chip">#{p.product_id}</span>
                  {p.category_name && <span className="chip">{p.category_name}</span>}
                  <span
                    className={`chip ${p.total_stock > 0 ? 'entity-card__status--ok' : 'entity-card__status--bad'}`}
                  >
                    Всего: {p.total_stock}
                  </span>
                </div>
                <h3>{p.product_name}</h3>
                {!p.sizes?.length ? (
                  <p className="hint">Размеры не заданы — укажите размер при поступлении</p>
                ) : (
                  <ul className="warehouse-size-list">
                    {p.sizes.map((s) => (
                      <li key={`${p.product_id}-${s.size}`}>
                        <span>{s.size}</span>
                        <strong className={Number(s.stock_qty) <= 0 ? 'text-danger' : ''}>
                          {s.stock_qty} шт.
                        </strong>
                      </li>
                    ))}
                  </ul>
                )}
              </article>
            ))}
          </div>
        )}
      </div>

      <div className="glass-card card">
        <h2>История движений</h2>
        {movements.length === 0 ? (
          <p className="hint">Пока нет операций</p>
        ) : (
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Дата</th>
                  <th>Товар</th>
                  <th>Размер</th>
                  <th>Операция</th>
                  <th>Кол-во</th>
                  <th>Заказ</th>
                  <th>Комментарий</th>
                </tr>
              </thead>
              <tbody>
                {movements.map((m) => (
                  <tr key={m.id}>
                    <td>{new Date(m.created_at).toLocaleString('ru-RU')}</td>
                    <td>
                      #{m.product_id} {m.product_name}
                    </td>
                    <td>{m.size}</td>
                    <td>
                      {m.movement_type === 'in' ? '+' : '−'} {REASON_LABELS[m.reason] || m.reason}
                    </td>
                    <td>{m.quantity}</td>
                    <td>{m.order_id ? `#${m.order_id}` : '—'}</td>
                    <td>{m.comment || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}