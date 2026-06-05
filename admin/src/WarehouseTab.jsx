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
  color: '',
  quantity: 1,
  comment: '',
};

function hexForPreset(c) {
  if (c.hex_code && /^#[0-9A-Fa-f]{6}$/i.test(c.hex_code)) return c.hex_code;
  return '#888888';
}

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

  const colorOptions = useMemo(() => selectedProduct?.colors || [], [selectedProduct]);

  const needsColor = colorOptions.length > 0;

  const sizeOptions = useMemo(() => {
    if (!selectedProduct) return [];
    const sizes = new Set((selectedProduct.sizes || []).map((s) => s.size));
    return [...sizes].filter(Boolean).sort();
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

  const resetProductFields = (productId) => ({
    ...EMPTY_RECEIPT,
    product_id: productId,
  });

  const submitReceipt = async (e) => {
    e.preventDefault();
    if (!form.product_id || !form.size?.trim()) {
      alert('Выберите товар и размер');
      return;
    }
    if (needsColor && !form.color?.trim()) {
      alert('Выберите цвет');
      return;
    }
    setSaving(true);
    try {
      await adminApi('/api/admin/shop/warehouse/stock', {
        method: 'POST',
        body: JSON.stringify({
          product_id: Number(form.product_id),
          size: form.size.trim(),
          color: form.color?.trim() || null,
          quantity: Number(form.quantity) || 1,
          comment: form.comment?.trim() || null,
        }),
      });
      setForm(resetProductFields(form.product_id));
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
          Выберите товар, цвет (если есть варианты), размер и количество. При заказе списание идёт по тому же цвету.
        </p>
        <form className="settings-form warehouse-receipt-form" onSubmit={submitReceipt}>
          <label>
            Товар
            <select
              value={form.product_id}
              onChange={(e) => setForm(resetProductFields(e.target.value))}
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

          {needsColor && (
            <label>
              Цвет *
              <div className="warehouse-color-picker">
                {colorOptions.map((c) => (
                  <button
                    key={c.label}
                    type="button"
                    className={`warehouse-color-chip${form.color === c.label ? ' warehouse-color-chip--active' : ''}`}
                    onClick={() => setForm({ ...form, color: c.label })}
                    title={c.label}
                  >
                    <span
                      className="warehouse-color-chip__swatch"
                      style={{ background: hexForPreset(c) }}
                    />
                    <span>{c.label}</span>
                  </button>
                ))}
              </div>
            </label>
          )}

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
                {p.colors?.length > 0 && (
                  <p className="hint">Цвета: {p.colors.map((c) => c.label).join(', ')}</p>
                )}
                {!p.sizes?.length ? (
                  <p className="hint">Остатков нет — добавьте поступление</p>
                ) : (
                  <ul className="warehouse-size-list">
                    {p.sizes.map((s) => (
                      <li key={`${p.product_id}-${s.size}-${s.color_label || ''}`}>
                        <span>{s.label || s.size}</span>
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
                  <th>Цвет</th>
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
                    <td>{m.color_label || '—'}</td>
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
