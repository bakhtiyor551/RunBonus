import { useEffect, useState } from 'react';
import { adminApi } from './api';
import Icon from './components/Icon';

const emptyForm = {
  name: '',
  slug: '',
  category_id: 'shoes',
  description: '',
  color: '',
  price: '',
  status: 'active',
  default_stock: 5,
  colors: [{ label: '', hex_code: '#444444', image_url: '' }],
  sizes: [],
  images: [{ image_url: '', sort_order: 0 }],
};

const EMPTY_CATEGORY = {
  id: '',
  name: '',
  sort_order: 50,
  status: 'active',
};

const STATUS_LABELS = {
  active: 'Активен',
  inactive: 'Отключён',
};

const SIZE_PRESETS = {
  shoes: ['39', '40', '41', '42', '43', '44'],
  tshirt: ['XS', 'S', 'M', 'L', 'XL', 'XXL'],
  shorts: ['S', 'M', 'L', 'XL', 'XXL'],
};

const COLOR_PRESETS = [
  { label: 'Чёрный', hex: '#1a1a1a' },
  { label: 'Белый', hex: '#f5f5f5' },
  { label: 'Серый', hex: '#6b7280' },
  { label: 'Красный', hex: '#ef4444' },
  { label: 'Синий', hex: '#3b82f6' },
  { label: 'Зелёный', hex: '#22c55e' },
  { label: 'Оранжевый', hex: '#f97316' },
  { label: 'Жёлтый', hex: '#eab308' },
  { label: 'Розовый', hex: '#ec4899' },
  { label: 'Бежевый', hex: '#d4b896' },
  { label: 'Neon', hex: '#c3f400' },
];

function normalizeHex(hex) {
  const v = String(hex || '').trim();
  if (/^#[0-9A-Fa-f]{6}$/.test(v)) return v;
  if (/^#[0-9A-Fa-f]{3}$/.test(v)) {
    const h = v.slice(1);
    return `#${h[0]}${h[0]}${h[1]}${h[1]}${h[2]}${h[2]}`;
  }
  return '#444444';
}

function ColorRowEditor({ color, onChange, onRemove, canRemove }) {
  const hex = normalizeHex(color.hex_code || '#444444');

  const applyPreset = (preset) => {
    onChange({
      ...color,
      label: color.label?.trim() ? color.label : preset.label,
      hex_code: preset.hex,
    });
  };

  return (
    <div className="shop-product-color-row glass-card">
      <div className="shop-product-color-row__picker">
        <span className="shop-product-color-row__swatch" style={{ background: hex }} title={hex} />
        <label className="shop-product-color-row__color-input">
          <span>Выберите цвет</span>
          <input
            type="color"
            value={hex}
            onChange={(e) => onChange({ ...color, hex_code: e.target.value })}
          />
        </label>
        <span className="shop-product-color-row__hex">{hex}</span>
      </div>
      <div className="shop-product-color-presets">
        {COLOR_PRESETS.map((p) => (
          <button
            key={p.hex}
            type="button"
            className={`shop-product-color-preset${hex.toLowerCase() === p.hex.toLowerCase() ? ' shop-product-color-preset--active' : ''}`}
            title={p.label}
            onClick={() => applyPreset(p)}
          >
            <span style={{ background: p.hex }} />
          </button>
        ))}
      </div>
      <label>
        Название цвета
        <input
          value={color.label}
          onChange={(e) => onChange({ ...color, label: e.target.value })}
          placeholder="Чёрный, Neon green…"
        />
      </label>
      <label>
        URL фото (для этого цвета)
        <input
          value={color.image_url}
          onChange={(e) => onChange({ ...color, image_url: e.target.value })}
          placeholder="https://…"
        />
      </label>
      {canRemove && (
        <button type="button" className="btn btn--sm btn--ghost" onClick={onRemove}>
          Удалить цвет
        </button>
      )}
    </div>
  );
}

function slugFromName(name) {
  return name
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .slice(0, 80);
}

function productImageUrl(product) {
  return product?.images?.[0]?.image_url || product?.image_url || '';
}

function productSizesList(product) {
  return (product?.sizes || [])
    .filter((s) => s.status !== 'inactive' && Number(s.stock_qty) > 0)
    .map((s) => s.size);
}

function ShopProductCard({ product, selected, onEdit, onDelete }) {
  const imageUrl = productImageUrl(product);
  const sizes = productSizesList(product);
  const active = product.status === 'active';
  const inStock = sizes.length > 0;

  return (
    <article className={`shop-product-card glass-card${selected ? ' entity-card--selected' : ''}`}>
      <div className="shop-product-card__img">
        {imageUrl ? (
          <img src={imageUrl} alt="" />
        ) : (
          <Icon name="checkroom" style={{ fontSize: 40, color: 'var(--primary-fixed)' }} />
        )}
      </div>
      <div className="shop-product-card__body">
        <div className="entity-card__head">
          <span className="shop-product-card__id">#{product.id}</span>
          <span className={`chip ${active ? 'entity-card__status--ok' : 'entity-card__status--muted'}`}>
            {STATUS_LABELS[product.status] || product.status}
          </span>
        </div>
        {product.category_name && (
          <span className="chip shop-product-card__category">{product.category_name}</span>
        )}
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
            {onDelete && (
              <button type="button" className="btn btn--sm btn--danger" onClick={() => onDelete(product)}>
                Удалить
              </button>
            )}
          </div>
        )}
      </div>
    </article>
  );
}

function SizeSelector({ categoryId, sizes, stockQty, onChange }) {
  const preset = SIZE_PRESETS[categoryId] || SIZE_PRESETS.tshirt;
  const selected = new Set(sizes.map((s) => s.size));
  const [custom, setCustom] = useState('');

  const toggle = (size) => {
    if (selected.has(size)) {
      onChange(sizes.filter((s) => s.size !== size));
    } else {
      onChange([...sizes, { size, stock_qty: stockQty, status: 'active' }]);
    }
  };

  const applyPreset = () => {
    onChange(
      preset.map((size) => ({
        size,
        stock_qty: stockQty,
        status: 'active',
      }))
    );
  };

  const addCustom = () => {
    const size = custom.trim();
    if (!size || selected.has(size)) return;
    onChange([...sizes, { size, stock_qty: stockQty, status: 'active' }]);
    setCustom('');
  };

  return (
    <div className="shop-size-selector">
      <div className="shop-size-selector__toolbar">
        <button type="button" className="btn btn--sm btn--ghost" onClick={applyPreset}>
          Все размеры категории
        </button>
        <span className="hint">Выбрано: {sizes.length}</span>
      </div>
      <div className="shop-size-selector__chips">
        {preset.map((size) => (
          <button
            key={size}
            type="button"
            className={`shop-size-chip${selected.has(size) ? ' shop-size-chip--active' : ''}`}
            onClick={() => toggle(size)}
          >
            {size}
          </button>
        ))}
        {sizes
          .filter((s) => !preset.includes(s.size))
          .map((s) => (
            <button
              key={s.size}
              type="button"
              className="shop-size-chip shop-size-chip--active shop-size-chip--custom"
              onClick={() => toggle(s.size)}
            >
              {s.size} ×
            </button>
          ))}
      </div>
      <div className="shop-size-selector__custom">
        <input
          placeholder="Свой размер, Enter"
          value={custom}
          onChange={(e) => setCustom(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addCustom())}
        />
        <button type="button" className="btn btn--sm" onClick={addCustom}>
          +
        </button>
      </div>
    </div>
  );
}

function ProductForm({
  editId,
  form,
  setForm,
  categories,
  saving,
  slugManual,
  setSlugManual,
  onSubmit,
  onCancel,
  previewProduct,
}) {
  const imageUrl = form.images[0]?.image_url?.trim();

  const onNameChange = (name) => {
    const next = { ...form, name };
    if (!slugManual && !editId) {
      next.slug = slugFromName(name);
    }
    setForm(next);
  };

  const onCategoryChange = (categoryId) => {
    setForm({
      ...form,
      category_id: categoryId,
      sizes: editId ? form.sizes : [],
    });
  };

  return (
    <form className="shop-product-form" onSubmit={onSubmit}>
      <div className="shop-product-form__layout">
        <div className="shop-product-form__main">
          <section className="shop-product-form__section">
            <h4>1. Категория и название</h4>
            <div className="shop-category-chips shop-category-chips--form">
              {categories
                .filter((c) => c.status === 'active')
                .map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    className={`shop-category-chip${form.category_id === c.id ? ' shop-category-chip--active' : ''}`}
                    onClick={() => onCategoryChange(c.id)}
                  >
                    {c.name}
                  </button>
                ))}
            </div>
            <label>
              Название товара *
              <input
                value={form.name}
                onChange={(e) => onNameChange(e.target.value)}
                placeholder="Runner Pro Black"
                required
                autoFocus={!editId}
              />
            </label>
            <div className="shop-product-form__row">
              <label>
                Цена (сомони) *
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.price}
                  onChange={(e) => setForm({ ...form, price: e.target.value })}
                  placeholder="350"
                  required
                />
              </label>
            </div>
          </section>

          <section className="shop-product-form__section">
            <h4>2. Цвета</h4>
            <div className="shop-product-colors-editor">
              <p className="hint">Клиент выбирает цвет в карточке товара. Нажмите на палитру или выберите готовый оттенок.</p>
              {form.colors.map((c, idx) => (
                <ColorRowEditor
                  key={idx}
                  color={c}
                  canRemove={form.colors.length > 1}
                  onChange={(updated) => {
                    const colors = [...form.colors];
                    colors[idx] = updated;
                    setForm({ ...form, colors });
                  }}
                  onRemove={() => setForm({ ...form, colors: form.colors.filter((_, i) => i !== idx) })}
                />
              ))}
              <button
                type="button"
                className="btn btn--sm"
                onClick={() =>
                  setForm({
                    ...form,
                    colors: [...form.colors, { label: '', hex_code: '#444444', image_url: '' }],
                  })
                }
              >
                + Цвет
              </button>
            </div>
          </section>

          <section className="shop-product-form__section">
            <h4>3. Размеры</h4>
            <p className="hint">Остатки пополняются во вкладке «Склад». Здесь выбираются только доступные размеры.</p>
            <SizeSelector
              categoryId={form.category_id}
              sizes={form.sizes}
              stockQty={0}
              onChange={(sizes) => setForm({ ...form, sizes })}
            />
          </section>

          <section className="shop-product-form__section">
            <h4>4. Описание (необязательно)</h4>
            <label>
              Описание
              <textarea
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                rows={3}
                placeholder="Кратко о товаре для карточки в приложении"
              />
            </label>
            <details className="shop-product-form__advanced">
              <summary>Дополнительно: slug, статус</summary>
              <label>
                Slug (ссылка)
                <input
                  value={form.slug}
                  onChange={(e) => {
                    setSlugManual(true);
                    setForm({ ...form, slug: e.target.value });
                  }}
                  placeholder="runner-pro-black"
                />
              </label>
              <label>
                Статус
                <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
                  <option value="active">Активен — виден в магазине</option>
                  <option value="inactive">Отключён — скрыт</option>
                </select>
              </label>
            </details>
          </section>
        </div>

        <aside className="shop-product-form__aside">
          <section className="shop-product-form__section">
            <h4>Фото</h4>
            <label>
              URL изображения
              <input
                value={form.images[0]?.image_url || ''}
                onChange={(e) =>
                  setForm({ ...form, images: [{ image_url: e.target.value, sort_order: 0 }] })
                }
                placeholder="https://…"
              />
            </label>
            <div className="shop-product-form__photo-preview">
              {imageUrl ? (
                <img src={imageUrl} alt="" onError={(e) => { e.currentTarget.style.display = 'none'; }} />
              ) : (
                <div className="shop-product-form__photo-empty">
                  <Icon name="image" />
                  <span>Превью фото</span>
                </div>
              )}
            </div>
          </section>
          <section className="shop-product-form__section shop-product-form__preview-wrap">
            <h4>Как в приложении</h4>
            <ShopProductCard product={previewProduct} />
          </section>
        </aside>
      </div>

      <div className="shop-products-form__actions shop-product-form__footer">
        <button type="submit" className="btn btn--primary" disabled={saving || !form.sizes.length}>
          {saving ? 'Сохранение…' : editId ? 'Сохранить изменения' : 'Добавить в магазин'}
        </button>
        {!form.sizes.length && <span className="hint">Выберите хотя бы один размер</span>}
        {onCancel && (
          <button type="button" className="btn btn--ghost" onClick={onCancel}>
            Отмена
          </button>
        )}
      </div>
    </form>
  );
}

export default function ShopProductsTab() {
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [form, setForm] = useState(emptyForm);
  const [categoryForm, setCategoryForm] = useState(EMPTY_CATEGORY);
  const [editId, setEditId] = useState(null);
  const [editingCategory, setEditingCategory] = useState(null);
  const [filterCategory, setFilterCategory] = useState('');
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showCategoryAdmin, setShowCategoryAdmin] = useState(false);
  const [slugManual, setSlugManual] = useState(false);
  const [saving, setSaving] = useState(false);

  const load = () => {
    setLoading(true);
    Promise.all([
      adminApi('/api/admin/shop/products'),
      adminApi('/api/admin/shop/product-categories'),
    ])
      .then(([prods, cats]) => {
        setProducts(prods);
        setCategories(cats);
      })
      .catch((e) => alert(e.message))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, []);

  const filteredProducts = filterCategory
    ? products.filter((p) => p.category_id === filterCategory)
    : products;

  const previewProduct = {
    id: editId || 'новый',
    name: form.name || 'Название товара',
    price: form.price,
    color: form.colors?.[0]?.label || form.color,
    colors: form.colors.filter((c) => c.label?.trim()),
    status: form.status,
    category_name: categories.find((c) => c.id === form.category_id)?.name,
    images: form.images,
    sizes: form.sizes.filter((s) => s.size?.trim()),
  };

  const openNewProduct = () => {
    setEditId(null);
    setSlugManual(false);
    setEditingCategory(null);
    setForm({
      ...emptyForm,
      category_id: filterCategory || categories.find((c) => c.status === 'active')?.id || 'shoes',
      sizes: [],
    });
    setShowCreateModal(true);
  };

  const startEdit = (p) => {
    setShowCreateModal(false);
    setEditingCategory(null);
    setEditId(p.id);
    setSlugManual(true);
    setForm({
      name: p.name,
      slug: p.slug || '',
      category_id: p.category_id || 'shoes',
      description: p.description || '',
      color: p.color || '',
      price: String(p.price),
      status: p.status,
      default_stock: p.sizes?.[0]?.stock_qty ?? 5,
      colors: p.colors?.length
        ? p.colors.map((c) => ({
            label: c.label || '',
            hex_code: c.hex_code || '',
            image_url: c.image_url || '',
          }))
        : p.color
          ? [{ label: p.color, hex_code: '', image_url: '' }]
          : emptyForm.colors,
      sizes: p.sizes?.length ? p.sizes : [],
      images: p.images?.length ? p.images : emptyForm.images,
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const closeForm = () => {
    setShowCreateModal(false);
    setEditId(null);
    setSlugManual(false);
    setForm({ ...emptyForm, category_id: categories[0]?.id || 'shoes', sizes: [] });
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
  };

  const saveCategory = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const payload = {
        name: categoryForm.name,
        sort_order: Number(categoryForm.sort_order) || 0,
        status: categoryForm.status,
      };
      if (editingCategory === 'new') {
        await adminApi('/api/admin/shop/product-categories', {
          method: 'POST',
          body: JSON.stringify({ ...payload, id: categoryForm.id }),
        });
      } else {
        await adminApi(`/api/admin/shop/product-categories/${editingCategory}`, {
          method: 'PUT',
          body: JSON.stringify(payload),
        });
      }
      setEditingCategory(null);
      load();
    } catch (err) {
      alert(err.message);
    } finally {
      setSaving(false);
    }
  };

  const toggleCategoryStatus = async (row) => {
    const next = row.status === 'active' ? 'inactive' : 'active';
    try {
      await adminApi(`/api/admin/shop/product-categories/${row.id}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status: next }),
      });
      load();
    } catch (err) {
      alert(err.message);
    }
  };

  const deleteProduct = async (product) => {
    if (
      !confirm(
        `Удалить товар «${product.name}» (#${product.id})?\n\nЭто действие нельзя отменить. Если есть заказы — удаление будет отклонено.`
      )
    ) {
      return;
    }
    try {
      await adminApi(`/api/admin/shop/products/${product.id}`, { method: 'DELETE' });
      if (editId === product.id) closeForm();
      load();
    } catch (err) {
      alert(err.message);
    }
  };

  return (
    <div className="page-content shop-products-page">
      <div className="shop-products-page__header">
        <div>
          <h2 className="shop-products-page__title">Магазин — товары</h2>
          <p className="hint">Добавляйте кроссовки, футболки, шорты — выберите категорию, размеры и цену</p>
        </div>
        <button type="button" className="btn btn--primary" onClick={openNewProduct}>
          <Icon name="add" /> Новый товар
        </button>
      </div>

      {!loading && (
        <div className="shop-category-chips shop-category-chips--filter">
          <span className="hint" style={{ alignSelf: 'center', marginRight: 4 }}>
            Фильтр:
          </span>
          <button
            type="button"
            className={`shop-category-chip${filterCategory === '' ? ' shop-category-chip--active' : ''}`}
            onClick={() => setFilterCategory('')}
          >
            Все ({products.length})
          </button>
          {categories.map((c) => (
            <button
              key={c.id}
              type="button"
              className={`shop-category-chip${filterCategory === c.id ? ' shop-category-chip--active' : ''}`}
              onClick={() => setFilterCategory(c.id)}
            >
              {c.name} ({products.filter((p) => p.category_id === c.id).length})
            </button>
          ))}
        </div>
      )}

      {editId && (
        <div className="glass-card card shop-products-editor" style={{ marginTop: 20 }}>
          <div className="shop-product-form__head">
            <h3>Редактирование #{editId}</h3>
            <button type="button" className="btn btn--ghost btn--sm" onClick={closeForm}>
              Закрыть
            </button>
          </div>
          <ProductForm
            editId={editId}
            form={form}
            setForm={setForm}
            categories={categories}
            saving={saving}
            slugManual={slugManual}
            setSlugManual={setSlugManual}
            onSubmit={save}
            onCancel={closeForm}
            previewProduct={previewProduct}
          />
        </div>
      )}

      {showCreateModal && (
        <div className="shop-product-modal-backdrop" onClick={(e) => e.target === e.currentTarget && closeForm()}>
          <div className="shop-product-modal glass-card card" role="dialog" aria-labelledby="new-product-title">
            <div className="shop-product-form__head">
              <div>
                <h3 id="new-product-title">Новый товар</h3>
                <p className="hint" style={{ margin: '4px 0 0' }}>
                  Заполните карточку — товар сразу появится в приложении
                </p>
              </div>
              <button type="button" className="btn btn--ghost btn--sm" onClick={closeForm} aria-label="Закрыть">
                <Icon name="close" />
              </button>
            </div>
            <ProductForm
              form={form}
              setForm={setForm}
              categories={categories}
              saving={saving}
              slugManual={slugManual}
              setSlugManual={setSlugManual}
              onSubmit={save}
              onCancel={closeForm}
              previewProduct={previewProduct}
            />
          </div>
        </div>
      )}

      <div className="glass-card card" style={{ marginTop: 20 }}>
        <button
          type="button"
          className="shop-category-admin-toggle"
          onClick={() => setShowCategoryAdmin((v) => !v)}
        >
          <Icon name={showCategoryAdmin ? 'expand_less' : 'expand_more'} />
          Управление категориями ({categories.length})
        </button>
        {showCategoryAdmin && (
          <>
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
              <button
                type="button"
                className="btn btn--sm btn--primary"
                onClick={() => {
                  setEditingCategory('new');
                  setCategoryForm({ ...EMPTY_CATEGORY });
                }}
              >
                + Категория
              </button>
            </div>
            <div className="entity-cards-grid payment-methods-grid">
              {categories.map((c) => (
                <article key={c.id} className="payment-method-card glass-card" style={{ padding: 14 }}>
                  <div className="entity-card__head">
                    <span className="payment-method-card__code">{c.id}</span>
                    <span
                      className={`chip ${c.status === 'active' ? 'entity-card__status--ok' : 'entity-card__status--muted'}`}
                    >
                      {c.status === 'active' ? 'Активна' : 'Выкл'}
                    </span>
                  </div>
                  <h3 className="entity-card__title">{c.name}</h3>
                  <p className="entity-card__meta">
                    Товаров: {products.filter((p) => p.category_id === c.id).length}
                  </p>
                  <div className="entity-card__actions">
                    <button
                      type="button"
                      className="btn btn--sm"
                      onClick={() => {
                        setEditingCategory(c.id);
                        setCategoryForm({
                          id: c.id,
                          name: c.name,
                          sort_order: c.sort_order ?? 0,
                          status: c.status,
                        });
                      }}
                    >
                      Изменить
                    </button>
                    <button type="button" className="btn btn--sm btn--ghost" onClick={() => toggleCategoryStatus(c)}>
                      {c.status === 'active' ? 'Отключить' : 'Включить'}
                    </button>
                  </div>
                </article>
              ))}
            </div>
          </>
        )}
      </div>

      {editingCategory && (
        <div className="glass-card card" style={{ marginTop: 16 }}>
          <h3>{editingCategory === 'new' ? 'Новая категория' : `Категория: ${editingCategory}`}</h3>
          <form className="settings-form" onSubmit={saveCategory}>
            {editingCategory === 'new' ? (
              <label>
                Код (латиница)
                <input
                  value={categoryForm.id}
                  onChange={(e) => setCategoryForm({ ...categoryForm, id: e.target.value })}
                  placeholder="hoodie"
                  required
                />
              </label>
            ) : (
              <p className="hint">
                Код: <strong>{categoryForm.id}</strong>
              </p>
            )}
            <label>
              Название
              <input
                value={categoryForm.name}
                onChange={(e) => setCategoryForm({ ...categoryForm, name: e.target.value })}
                required
              />
            </label>
            <label>
              Порядок
              <input
                type="number"
                value={categoryForm.sort_order}
                onChange={(e) => setCategoryForm({ ...categoryForm, sort_order: e.target.value })}
              />
            </label>
            <div style={{ display: 'flex', gap: 8 }}>
              <button type="submit" className="btn btn--primary" disabled={saving}>
                Сохранить
              </button>
              <button type="button" className="btn btn--ghost" onClick={() => setEditingCategory(null)}>
                Отмена
              </button>
            </div>
          </form>
        </div>
      )}

      <div className="glass-card card" style={{ marginTop: 20 }}>
        <h3>
          Каталог ({filteredProducts.length}
          {filterCategory ? ` · ${categories.find((c) => c.id === filterCategory)?.name}` : ''})
        </h3>
        {loading && <p>Загрузка…</p>}
        {!loading && !filteredProducts.length && (
          <div className="shop-products-empty">
            <Icon name="inventory_2" style={{ fontSize: 48, opacity: 0.4 }} />
            <p className="hint">Товаров пока нет</p>
            <button type="button" className="btn btn--primary" onClick={openNewProduct}>
              Добавить первый товар
            </button>
          </div>
        )}
        <div className="entity-cards-grid shop-products-grid">
          {filteredProducts.map((p) => (
            <ShopProductCard
              key={p.id}
              product={p}
              selected={editId === p.id}
              onEdit={startEdit}
              onDelete={deleteProduct}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
