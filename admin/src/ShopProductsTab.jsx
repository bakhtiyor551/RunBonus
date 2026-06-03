import { useEffect, useState } from 'react';
import { adminApi } from './api';
import Icon from './components/Icon';

const emptyForm = {
  name: '',
  slug: '',
  description: '',
  color: '',
  category_id: '',
  price: '',
  status: 'active',
  colors: [{ label: '', hex_code: '', image_url: '' }],
  sizes: [{ size: '40', stock_qty: 5, status: 'active' }],
  images: [{ image_url: '', sort_order: 0 }],
};

const STATUS_LABELS = {
  active: 'Активен',
  inactive: 'Отключён',
};

function productImageUrl(product) {
  return product?.images?.[0]?.image_url || product?.image_url || '';
}

function productSizesList(product) {
  return (product?.sizes || [])
    .filter((s) => s.status !== 'inactive' && Number(s.stock_qty) > 0)
    .map((s) => s.size);
}

function ShopProductCard({ product, selected, onEdit, onDeactivate }) {
  const imageUrl = productImageUrl(product);
  const sizes = productSizesList(product);
  const active = product.status === 'active';
  const inStock = sizes.length > 0;

  return (
    <article
      className={`shop-product-card glass-card${selected ? ' entity-card--selected' : ''}`}
    >
      <div className="shop-product-card__img">
        {imageUrl ? (
          <img src={imageUrl} alt="" />
        ) : (
          <Icon name="directions_run" style={{ fontSize: 40, color: 'var(--primary-fixed)' }} />
        )}
      </div>
      <div className="shop-product-card__body">
        <div className="entity-card__head">
          <span className="shop-product-card__id">#{product.id}</span>
          <span className={`chip ${active ? 'entity-card__status--ok' : 'entity-card__status--muted'}`}>
            {STATUS_LABELS[product.status] || product.status}
          </span>
        </div>
        <h3 className="entity-card__title">{product.name || 'Без названия'}</h3>
        <div className="entity-card__highlight">
          <span className="entity-card__highlight-label">Цена</span>
          <span className="entity-card__highlight-value">
            {product.price != null && product.price !== '' ? `${product.price} сом.` : '—'}
          </span>
        </div>
        {product.category_name && <p className="entity-card__meta">Категория: {product.category_name}</p>}
        {(product.colors?.length > 1
          ? (
              <p className="entity-card__meta">
                Цвета: {product.colors.map((c) => c.label).join(', ')}
              </p>
            )
          : product.color && <p className="entity-card__meta">Цвет: {product.color}</p>)}
        {sizes.length > 0 && (
          <p className="entity-card__meta">Размеры: {sizes.join(', ')}</p>
        )}
        <span className={`chip shop-product-card__stock ${inStock ? 'entity-card__status--ok' : 'entity-card__status--bad'}`}>
          {inStock ? 'В наличии' : 'Нет в наличии'}
        </span>
        {onEdit && (
          <div className="entity-card__actions">
            <button type="button" className="btn btn--sm" onClick={() => onEdit(product)}>
              Изменить
            </button>
            {active && onDeactivate && (
              <button type="button" className="btn btn--sm btn--ghost" onClick={() => onDeactivate(product.id)}>
                Отключить
              </button>
            )}
          </div>
        )}
      </div>
    </article>
  );
}

export default function ShopProductsTab() {
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [form, setForm] = useState(emptyForm);
  const [editId, setEditId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(true);

  const load = () => {
    setLoading(true);
    adminApi('/api/admin/shop/products')
      .then(setProducts)
      .catch(() => setProducts([]))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
    adminApi('/api/admin/shop/categories')
      .then(setCategories)
      .catch(() => setCategories([]));
  }, []);

  const previewProduct = {
    id: editId || '…',
    name: form.name,
    price: form.price,
    color: form.colors?.[0]?.label || form.color,
    colors: form.colors.filter((c) => c.label?.trim()),
    category_name: categories.find((c) => String(c.id) === String(form.category_id))?.name,
    status: form.status,
    images: form.images,
    sizes: form.sizes.filter((s) => s.size?.trim()),
  };

  const startEdit = (p) => {
    setEditId(p.id);
    setShowForm(true);
    const colorRows = p.colors?.length
      ? p.colors.map((c) => ({
          label: c.label || '',
          hex_code: c.hex_code || '',
          image_url: c.image_url || '',
        }))
      : p.color
        ? [{ label: p.color, hex_code: '', image_url: '' }]
        : emptyForm.colors;
    setForm({
      name: p.name,
      slug: p.slug || '',
      description: p.description || '',
      color: p.color || '',
      category_id: p.category_id ? String(p.category_id) : '',
      price: String(p.price),
      status: p.status,
      colors: colorRows,
      sizes: p.sizes?.length ? p.sizes : emptyForm.sizes,
      images: p.images?.length ? p.images : emptyForm.images,
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const resetForm = () => {
    setForm(emptyForm);
    setEditId(null);
  };

  const save = async (e) => {
    e.preventDefault();
    const payload = {
      ...form,
      price: Number(form.price),
      category_id: form.category_id != null && String(form.category_id).trim() !== '' ? form.category_id : null,
      colors: form.colors.filter((c) => c.label?.trim()),
      sizes: form.sizes.filter((s) => s.size?.trim()),
      images: form.images.filter((i) => i.image_url?.trim()),
    };
    if (editId) {
      await adminApi(`/api/admin/shop/products/${editId}`, { method: 'PUT', body: JSON.stringify(payload) });
    } else {
      await adminApi('/api/admin/shop/products', { method: 'POST', body: JSON.stringify(payload) });
    }
    resetForm();
    load();
  };

  const deactivate = async (id) => {
    if (!confirm('Отключить товар?')) return;
    await adminApi(`/api/admin/shop/products/${id}`, { method: 'DELETE' });
    if (editId === id) resetForm();
    load();
  };

  const sizesValue = form.sizes.map((s) => s.size).filter(Boolean).join(',');

  return (
    <div className="page-content shop-products-page">
      <div className="shop-products-page__header">
        <div>
          <h2 className="shop-products-page__title">Магазин — товары</h2>
          <p className="hint">Кроссовки в мобильном приложении</p>
        </div>
        <button
          type="button"
          className="btn btn--primary"
          onClick={() => {
            if (showForm && !editId) {
              setShowForm(false);
              resetForm();
            } else {
              resetForm();
              setShowForm(true);
            }
          }}
        >
          {showForm && !editId ? 'Скрыть форму' : '+ Новый товар'}
        </button>
      </div>

      {showForm && (
        <div className="glass-card card shop-products-editor">
          <h3>{editId ? `Редактировать #${editId}` : 'Новый товар'}</h3>
          <div className="shop-products-editor__grid">
            <form className="settings-form shop-products-form" onSubmit={save}>
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
                <input
                  type="number"
                  value={form.price}
                  onChange={(e) => setForm({ ...form, price: e.target.value })}
                  required
                />
              </label>
              <label>
                Категория
                <select
                  value={form.category_id}
                  onChange={(e) => setForm({ ...form, category_id: e.target.value })}
                >
                  <option value="">— не выбрана —</option>
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </label>
              <div className="shop-product-colors-editor">
                <p className="hint" style={{ margin: '0 0 8px' }}>
                  Цвета (клиент выбирает в карточке товара)
                </p>
                {form.colors.map((c, idx) => (
                  <div key={idx} className="shop-product-color-row glass-card" style={{ padding: 12, marginBottom: 8 }}>
                    <label>
                      Название
                      <input
                        value={c.label}
                        onChange={(e) => {
                          const colors = [...form.colors];
                          colors[idx] = { ...colors[idx], label: e.target.value };
                          setForm({ ...form, colors });
                        }}
                        placeholder="Чёрный / зелёный"
                      />
                    </label>
                    <label>
                      Цвет кружка (#hex)
                      <input
                        value={c.hex_code}
                        onChange={(e) => {
                          const colors = [...form.colors];
                          colors[idx] = { ...colors[idx], hex_code: e.target.value };
                          setForm({ ...form, colors });
                        }}
                        placeholder="#000000"
                      />
                    </label>
                    <label>
                      URL фото (для этого цвета)
                      <input
                        value={c.image_url}
                        onChange={(e) => {
                          const colors = [...form.colors];
                          colors[idx] = { ...colors[idx], image_url: e.target.value };
                          setForm({ ...form, colors });
                        }}
                      />
                    </label>
                    {form.colors.length > 1 && (
                      <button
                        type="button"
                        className="btn btn--sm btn--ghost"
                        onClick={() =>
                          setForm({ ...form, colors: form.colors.filter((_, i) => i !== idx) })
                        }
                      >
                        Удалить цвет
                      </button>
                    )}
                  </div>
                ))}
                <button
                  type="button"
                  className="btn btn--sm"
                  onClick={() =>
                    setForm({ ...form, colors: [...form.colors, { label: '', hex_code: '', image_url: '' }] })
                  }
                >
                  + Цвет
                </button>
              </div>
              <label>
                Описание
                <textarea
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  rows={3}
                />
              </label>
              <label>
                URL фото
                <input
                  value={form.images[0]?.image_url || ''}
                  onChange={(e) =>
                    setForm({ ...form, images: [{ image_url: e.target.value, sort_order: 0 }] })
                  }
                />
              </label>
              <label>
                Размеры (через запятую)
                <input
                  placeholder="39,40,41,42,43"
                  value={sizesValue}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      sizes: e.target.value
                        .split(',')
                        .map((s) => s.trim())
                        .filter(Boolean)
                        .map((size) => ({
                          size,
                          stock_qty: 5,
                          status: 'active',
                        })),
                    })
                  }
                />
              </label>
              <label>
                Статус
                <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
                  <option value="active">Активен</option>
                  <option value="inactive">Отключён</option>
                </select>
              </label>
              <div className="shop-products-form__actions">
                <button type="submit" className="btn btn--primary">
                  {editId ? 'Сохранить' : 'Добавить'}
                </button>
                {editId && (
                  <button type="button" className="btn btn--ghost" onClick={resetForm}>
                    Отмена
                  </button>
                )}
              </div>
            </form>

            <div className="shop-products-editor__preview">
              <p className="hint shop-products-editor__preview-label">Превью карточки в приложении</p>
              <ShopProductCard product={previewProduct} />
            </div>
          </div>
        </div>
      )}

      <div className="glass-card card">
        <h3>Каталог ({products.length})</h3>
        {loading && <p>Загрузка…</p>}
        {!loading && !products.length && (
          <p className="hint" style={{ marginTop: 12 }}>
            Товаров пока нет. Добавьте первый через форму выше.
          </p>
        )}
        <div className="entity-cards-grid shop-products-grid">
          {products.map((p) => (
            <ShopProductCard
              key={p.id}
              product={p}
              selected={editId === p.id}
              onEdit={startEdit}
              onDeactivate={deactivate}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
