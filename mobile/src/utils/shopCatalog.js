import { api } from '../api';

/** id категории: число или строка (shoes, tshirt…). */
export function normalizeCategoryId(raw) {
  if (raw == null || raw === '') return null;
  const s = String(raw).trim();
  if (!s) return null;
  if (/^\d+$/.test(s)) return Number(s);
  return s;
}

const LEGACY_SHOE_CATEGORY_IDS = new Set(['1', '2', '3', 'running', 'urban', 'trail']);

export function normalizeProductCategoryId(raw) {
  const id = normalizeCategoryId(raw);
  if (id == null) return null;
  if (LEGACY_SHOE_CATEGORY_IDS.has(String(id))) return 'shoes';
  return id;
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

const CATEGORY_SORT_ORDER = {
  shoes: 10,
  tshirt: 20,
  shorts: 30,
};

export function categoryLabelFromId(id, categories = []) {
  if (id == null || id === '') return '';
  const normalized = normalizeProductCategoryId(id) ?? id;
  const key = String(normalized);
  const fromApi = categories.find((c) => String(c.id) === key);
  if (fromApi?.name) return fromApi.name;
  return CATEGORY_NAME_FALLBACK[key] ?? CATEGORY_NAME_FALLBACK[key.toLowerCase()] ?? '';
}

export function categoryLabelFromProduct(product, categories = []) {
  const id = normalizeProductCategoryId(product?.category_id);
  if (id != null) {
    const label = categoryLabelFromId(id, categories);
    if (label) return label;
  }
  return String(product?.category_name || '').trim();
}

function categoriesFromProducts(products) {
  const map = new Map();
  for (const p of products || []) {
    const id = normalizeProductCategoryId(p.category_id);
    if (id == null) continue;
    const key = String(id);
    const name = categoryLabelFromProduct(p, []);
    if (!name) continue;
    map.set(key, {
      id,
      name,
      slug: typeof id === 'string' ? id : key,
      sort_order: CATEGORY_SORT_ORDER[key] ?? 999,
    });
  }
  return [...map.values()].sort(
    (a, b) => a.sort_order - b.sort_order || String(a.name).localeCompare(String(b.name), 'ru')
  );
}

function enrichProducts(products, categories) {
  return products.map((p) => {
    const id = normalizeProductCategoryId(p.category_id);
    const label = categoryLabelFromProduct(p, categories);
    const next = { ...p };
    if (id != null) next.category_id = id;
    if (label) next.category_name = label;
    return next;
  });
}

export async function fetchShopCategories() {
  const data = await api('/api/mobile/shop-categories');
  const list = Array.isArray(data) ? data : data?.categories;
  return normalizeCategories(list);
}

export async function fetchShopProducts(categoryId = null) {
  const id = normalizeProductCategoryId(categoryId) ?? normalizeCategoryId(categoryId);
  const q = id != null ? `?category_id=${encodeURIComponent(id)}` : '';
  const data = await api(`/api/mobile/products${q}`);
  return Array.isArray(data) ? data : [];
}

export async function fetchShopCatalog(categoryId = null) {
  const id = normalizeProductCategoryId(categoryId) ?? normalizeCategoryId(categoryId);
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

  if (!categories.length && products.length) {
    categories = categoriesFromProducts(products);
  }

  if (!categories.length && id == null) {
    try {
      const allProducts = await fetchShopProducts(null);
      categories = categoriesFromProducts(allProducts);
      if (!products.length) products = allProducts;
    } catch {
      /* ignore */
    }
  }

  products = enrichProducts(products, categories);

  return { categories, products };
}
