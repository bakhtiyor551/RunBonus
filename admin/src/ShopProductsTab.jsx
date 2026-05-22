import { useEffect, useState } from 'react';
import { adminApi } from './api';

const emptyForm = {
  name: '',
  slug: '',
  description: '',
  color: '',
  price: '',
  status: 'active',
  sizes: [{ size: '40', stock_qty: 5, status: 'active' }],
  images: [{ image_url: '', sort_order: 0 }],
};

export default function ShopProductsTab() {
  const [products, setProducts] = useState([]);
  const [form, setForm] = useState(emptyForm);
  const [editId, setEditId] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = () => {
    setLoading(true);
    adminApi('/api/admin/shop/products')
      .then(setProducts)
      .catch(() => setProducts([]))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, []);

  const startEdit = (p) => {
    setEditId(p.id);
    setForm({
      name: p.name,
      slug: p.slug || '',
      description: p.description || '',
      color: p.color || '',
      price: String(p.price),
      status: p.status,
      sizes: p.sizes?.length ? p.sizes : emptyForm.sizes,
      images: p.images?.length ? p.images : emptyForm.images,
    });
  };

  const save = async (e) => {
    e.preventDefault();
    const payload = {
      ...form,
      price: Number(form.price),
      sizes: form.sizes.filter((s) => s.size),
      images: form.images.filter((i) => i.image_url),
    };
    if (editId) {
      await adminApi(`/api/admin/shop/products/${editId}`, { method: 'PUT', body: JSON.stringify(payload) });
    } else {
      await adminApi('/api/admin/shop/products', { method: 'POST', body: JSON.stringify(payload) });
    }
    setForm(emptyForm);
    setEditId(null);
    load();
  };

  const deactivate = async (id) => {
    if (!confirm('Отключить товар?')) return;
    await adminApi(`/api/admin/shop/products/${id}`, { method: 'DELETE' });
    load();
  };

  return (
    <div className="page-content">
      <div className="glass-card card">
        <h2>Магазин — товары</h2>
        <p className="hint">Кроссовки в мобильном приложении</p>

        <form className="settings-form" onSubmit={save} style={{ marginBottom: 24 }}>
          <h3>{editId ? `Редактировать #${editId}` : 'Новый товар'}</h3>
          <label>
            Название
            <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
          </label>
          <label>
            Slug
            <input value={form.slug} onChange={(e) => setForm({ ...form, slug: e.target.value })} />
          </label>
          <label>
            Цена (сомони)
            <input type="number" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} required />
          </label>
          <label>
            Цвет
            <input value={form.color} onChange={(e) => setForm({ ...form, color: e.target.value })} placeholder="Black / Green" />
          </label>
          <label>
            Описание
            <textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={3} />
          </label>
          <label>
            URL фото
            <input
              value={form.images[0]?.image_url || ''}
              onChange={(e) => setForm({ ...form, images: [{ image_url: e.target.value, sort_order: 0 }] })}
            />
          </label>
          <label>
            Размеры (через запятую)
            <input
              placeholder="39,40,41,42,43"
              onChange={(e) =>
                setForm({
                  ...form,
                  sizes: e.target.value.split(',').map((s) => ({
                    size: s.trim(),
                    stock_qty: 5,
                    status: 'active',
                  })),
                })
              }
              defaultValue={form.sizes.map((s) => s.size).join(',')}
            />
          </label>
          <label>
            Статус
            <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
              <option value="active">active</option>
              <option value="inactive">inactive</option>
            </select>
          </label>
          <button type="submit" className="btn btn--primary">
            {editId ? 'Сохранить' : 'Добавить'}
          </button>
          {editId && (
            <button
              type="button"
              className="btn btn--ghost"
              onClick={() => {
                setEditId(null);
                setForm(emptyForm);
              }}
            >
              Отмена
            </button>
          )}
        </form>

        {loading && <p>Загрузка…</p>}
        <table className="data-table">
          <thead>
            <tr>
              <th>ID</th>
              <th>Название</th>
              <th>Цена</th>
              <th>Статус</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {products.map((p) => (
              <tr key={p.id}>
                <td>{p.id}</td>
                <td>{p.name}</td>
                <td>{p.price} сом.</td>
                <td>{p.status}</td>
                <td>
                  <button type="button" className="btn btn--sm" onClick={() => startEdit(p)}>
                    Изменить
                  </button>{' '}
                  <button type="button" className="btn btn--sm btn--ghost" onClick={() => deactivate(p.id)}>
                    Выкл.
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
