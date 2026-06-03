import { useEffect, useState } from 'react';
import { adminApi } from './api';

const EMPTY = {
  id: '',
  name: '',
  sort_order: 0,
  status: 'active',
};

export default function ShopCategoriesTab() {
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);

  const load = () => {
    setLoading(true);
    adminApi('/api/admin/shop/categories')
      .then(setCategories)
      .catch(() => setCategories([]))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, []);

  const openCreate = () => {
    setEditing('new');
    setForm({ ...EMPTY });
  };

  const openEdit = (row) => {
    setEditing(row.id);
    setForm({
      id: row.id,
      name: row.name,
      sort_order: row.sort_order ?? 0,
      status: row.status,
    });
  };

  const save = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const payload = {
        name: form.name,
        sort_order: Number(form.sort_order) || 0,
        status: form.status,
      };
      if (editing === 'new') {
        await adminApi('/api/admin/shop/categories', {
          method: 'POST',
          body: JSON.stringify({ ...payload, id: form.id }),
        });
      } else {
        await adminApi(`/api/admin/shop/categories/${editing}`, {
          method: 'PUT',
          body: JSON.stringify(payload),
        });
      }
      setEditing(null);
      load();
    } catch (err) {
      alert(err.message);
    } finally {
      setSaving(false);
    }
  };

  const toggleStatus = async (row) => {
    const next = row.status === 'active' ? 'inactive' : 'active';
    try {
      await adminApi(`/api/admin/shop/categories/${row.id}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status: next }),
      });
      load();
    } catch (err) {
      alert(err.message);
    }
  };

  return (
    <div className="page-content">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h2>Категории магазина</h2>
          <p className="hint">Эти категории отображаются в мобильном приложении (вкладки в магазине).</p>
        </div>
        <button type="button" className="btn btn--primary" onClick={openCreate}>
          + Категория
        </button>
      </div>

      {loading && <p>Загрузка…</p>}

      <div className="entity-cards-grid payment-methods-grid">
        {categories.map((c) => (
          <article
            key={c.id}
            className={`payment-method-card glass-card${editing === c.id ? ' entity-card--selected' : ''}`}
          >
            <div className="entity-card__head">
              <span className="payment-method-card__code">{c.id}</span>
              <span className={`chip ${c.status === 'active' ? 'entity-card__status--ok' : 'entity-card__status--muted'}`}>
                {c.status === 'active' ? 'Активна' : 'Отключена'}
              </span>
            </div>
            <h3 className="entity-card__title">{c.name}</h3>
            <p className="entity-card__meta">Товаров: {c.product_count ?? 0}</p>
            <div className="entity-card__actions">
              <button type="button" className="btn btn--sm" onClick={() => openEdit(c)}>
                Изменить
              </button>
              <button type="button" className="btn btn--sm btn--ghost" onClick={() => toggleStatus(c)}>
                {c.status === 'active' ? 'Отключить' : 'Включить'}
              </button>
            </div>
          </article>
        ))}
      </div>

      {editing && (
        <div className="glass-card card" style={{ marginTop: 24 }}>
          <h3>{editing === 'new' ? 'Новая категория' : `Редактирование: ${editing}`}</h3>
          <form className="settings-form" onSubmit={save}>
            {editing === 'new' ? (
              <label>
                Код (латиница, например shoes)
                <input
                  value={form.id}
                  onChange={(e) => setForm({ ...form, id: e.target.value })}
                  placeholder="shoes"
                  required
                />
              </label>
            ) : (
              <p className="hint">
                Код: <strong>{form.id}</strong>
              </p>
            )}
            <label>
              Название в приложении
              <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
            </label>
            <label>
              Порядок
              <input
                type="number"
                value={form.sort_order}
                onChange={(e) => setForm({ ...form, sort_order: e.target.value })}
              />
            </label>
            <label>
              Статус
              <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
                <option value="active">Активна</option>
                <option value="inactive">Отключена</option>
              </select>
            </label>
            <div style={{ display: 'flex', gap: 8 }}>
              <button type="submit" className="btn btn--primary" disabled={saving}>
                {saving ? 'Сохранение…' : 'Сохранить'}
              </button>
              <button type="button" className="btn btn--ghost" onClick={() => setEditing(null)}>
                Отмена
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
