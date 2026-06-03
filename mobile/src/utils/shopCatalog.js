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

const CATEGORY_NAME_FALLBACK = {
  1: 'Бег',
  2: 'Город',
  3: 'Трейл',
  running: 'Бег',
  urban: 'Город',
  trail: 'Трейл',
};

export function categoryLabelFromProduct(product) {
  const name = String(product?.category_name || '').trim();
  if (name) return name;
  const id = product?.category_id;
  if (id == null || id === '') return '';
  const key = String(id);
  return CATEGORY_NAME_FALLBACK[id] ?? CATEGORY_NAME_FALLBACK[key] ?? CATEGORY_NAME_FALLBACK[key.toLowerCase()] ?? key;
}

export function categoriesFromProducts(products) {
  const map = new Map();
  for (const p of products || []) {
    const label = categoryLabelFromProduct(p);
    if (!label && (p.category_id == null || p.category_id === '')) continue;
    const cat = normalizeCategory({
      id: p.category_id,
      name: label || p.category_id,
      slug: p.category_id,
    });
    if (cat) map.set(String(cat.id), cat);
  }
  return [...map.values()].sort((a, b) => a.sort_order - b.sort_order || String(a.id).localeCompare(String(b.id)));
}

export function mergeCategories(apiCategories, products) {
  const merged = new Map();
  for (const c of normalizeCategories(apiCategories)) {
    merged.set(String(c.id), c);
  }
  for (const c of categoriesFromProducts(products)) {
    if (!merged.has(String(c.id))) merged.set(String(c.id), c);
  }
  return [...merged.values()].sort((a, b) => a.sort_order - b.sort_order || String(a.id).localeCompare(String(b.id)));
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

  if (!categories.length && products.length) {
    categories = categoriesFromProducts(products);
  }

  if (!categories.length) {
    try {
      const allProducts = await fetchShopProducts(null);
      categories = mergeCategories(categories, allProducts);
      if (id == null) products = allProducts;
    } catch {
      /* ignore */
    }
  }

  return { categories, products };
}
