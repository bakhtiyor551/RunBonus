import { api } from '../api';

function normalizeCategory(c) {
  const id = c?.id != null ? Number(c.id) : null;
  const name = String(c?.name || '').trim();
  if (id == null || Number.isNaN(id) || !name) return null;
  return {
    id,
    name,
    slug: c.slug || null,
    sort_order: Number(c.sort_order) || 0,
  };
}

function normalizeCategories(list) {
  if (!Array.isArray(list)) return [];
  return list.map(normalizeCategory).filter(Boolean);
}

/** Если API вернул пустой список — собрать уникальные категории из карточек товаров. */
export function categoriesFromProducts(products) {
  const map = new Map();
  for (const p of products || []) {
    const cat = normalizeCategory({
      id: p.category_id,
      name: p.category_name,
      slug: null,
      sort_order: 0,
    });
    if (cat) map.set(cat.id, cat);
  }
  return [...map.values()].sort((a, b) => a.sort_order - b.sort_order || a.id - b.id);
}

export function mergeCategories(apiCategories, products) {
  const merged = new Map();
  for (const c of normalizeCategories(apiCategories)) {
    merged.set(c.id, c);
  }
  for (const c of categoriesFromProducts(products)) {
    if (!merged.has(c.id)) merged.set(c.id, c);
  }
  return [...merged.values()].sort((a, b) => a.sort_order - b.sort_order || a.id - b.id);
}

/** Категории только с сервера. */
export async function fetchShopCategories() {
  const data = await api('/api/mobile/shop-categories');
  const list = Array.isArray(data) ? data : data?.categories;
  return normalizeCategories(list);
}

export async function fetchShopProducts(categoryId = null) {
  const id = categoryId != null && Number(categoryId) > 0 ? Number(categoryId) : null;
  const q = id ? `?category_id=${id}` : '';
  const data = await api(`/api/mobile/products${q}`);
  return Array.isArray(data) ? data : [];
}

/** Каталог: категории + товары с API. */
export async function fetchShopCatalog(categoryId = null) {
  const id = categoryId != null && Number(categoryId) > 0 ? Number(categoryId) : null;
  const q = id ? `?category_id=${id}` : '';

  let categories = [];
  let products = [];

  try {
    const data = await api(`/api/mobile/shop-catalog${q}`);
    categories = normalizeCategories(data?.categories);
    products = Array.isArray(data?.products) ? data.products : [];
  } catch {
    try {
      [categories, products] = await Promise.all([fetchShopCategories(), fetchShopProducts(categoryId)]);
    } catch (e) {
      products = await fetchShopProducts(null).catch(() => []);
      categories = [];
      throw e;
    }
  }

  if (!categories.length && products.length) {
    categories = categoriesFromProducts(products);
  }

  if (!categories.length) {
    try {
      const allProducts = await fetchShopProducts(null);
      categories = mergeCategories(categories, allProducts);
      if (!id) products = allProducts;
    } catch {
      /* ignore */
    }
  }

  return { categories, products };
}
