import { api } from '../api';

/** id категории: число или строка (shoes, tshirt…). */
export function normalizeCategoryId(raw) {
  if (raw == null || raw === '') return null;
  const s = String(raw).trim();
  if (!s) return null;
  if (/^\d+$/.test(s)) return Number(s);
  return s;
}

function normalizeCategory(c) {
  const id = normalizeCategoryId(c?.id ?? c?.slug);
  const name = String(c?.name || '').trim();
  if (id == null || !name) return null;
  return {
    id,
    name,
    slug: c.slug || (typeof id === 'string' ? id : null),
    sort_order: Number(c.sort_order) || 0,
  };
}

function normalizeCategories(list) {
  if (!Array.isArray(list)) return [];
  return list.map(normalizeCategory).filter(Boolean);
}

/** Запасные названия по коду (если API не вернул name). */
const CATEGORY_NAME_FALLBACK = {
  shoes: 'Кроссовки',
  tshirt: 'Футболки',
  shorts: 'Шорты',
};

export function categoryLabelFromId(id, categories = []) {
  if (id == null || id === '') return '';
  const key = String(id);
  const fromApi = categories.find((c) => String(c.id) === key);
  if (fromApi?.name) return fromApi.name;
  return CATEGORY_NAME_FALLBACK[key] ?? CATEGORY_NAME_FALLBACK[key.toLowerCase()] ?? '';
}

export function categoryLabelFromProduct(product, categories = []) {
  const name = String(product?.category_name || '').trim();
  if (name) return name;
  return categoryLabelFromId(product?.category_id, categories);
}

function enrichProducts(products, categories) {
  if (!categories.length) return products;
  return products.map((p) => {
    const label = categoryLabelFromProduct(p, categories);
    if (!label || label === p.category_name) return p;
    return { ...p, category_name: label };
  });
}

export async function fetchShopCategories() {
  const data = await api('/api/mobile/shop-categories');
  const list = Array.isArray(data) ? data : data?.categories;
  return normalizeCategories(list);
}

export async function fetchShopProducts(categoryId = null) {
  const id = normalizeCategoryId(categoryId);
  const q = id != null ? `?category_id=${encodeURIComponent(id)}` : '';
  const data = await api(`/api/mobile/products${q}`);
  return Array.isArray(data) ? data : [];
}

export async function fetchShopCatalog(categoryId = null) {
  const id = normalizeCategoryId(categoryId);
  const q = id != null ? `?category_id=${encodeURIComponent(id)}` : '';

  let categories = [];
  let products = [];

  try {
    const data = await api(`/api/mobile/shop-catalog${q}`);
    categories = normalizeCategories(data?.categories);
    products = Array.isArray(data?.products) ? data.products : [];
  } catch {
    [categories, products] = await Promise.all([fetchShopCategories(), fetchShopProducts(categoryId)]);
  }

  if (!categories.length) {
    try {
      categories = await fetchShopCategories();
    } catch {
      /* ignore */
    }
  }

  products = enrichProducts(products, categories);

  return { categories, products };
}
