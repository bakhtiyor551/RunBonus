export function pickOffName(product) {
  return (
    product.product_name_ru
    || product.product_name
    || product.generic_name_ru
    || product.generic_name
    || product.brands
    || 'Продукт'
  ).trim();
}

export function offNum(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

export function normalizeBarcode(raw) {
  const digits = String(raw || '').replace(/\D/g, '');
  if (digits.length < 8 || digits.length > 14) return null;
  return digits;
}

export function parseOffProduct(barcode, product) {
  const nut = product.nutriments || {};
  let kcal100 = offNum(nut['energy-kcal_100g']);
  if (!kcal100 && nut['energy-kj_100g']) {
    kcal100 = Math.round(offNum(nut['energy-kj_100g']) / 4.184);
  }
  if (!kcal100 && nut.energy_100g) {
    kcal100 = Math.round(offNum(nut.energy_100g) / 4.184);
  }

  const servingQty = offNum(product.serving_quantity) || offNum(product.product_quantity) || 100;
  const serving = Math.min(Math.max(Math.round(servingQty), 50), 500);

  const countryTag = product.countries_tags?.[0] || product.origins_tags?.[0] || '';
  const country = String(countryTag).replace(/^en:/, '').toUpperCase().slice(0, 2) || null;

  return {
    external_id: String(barcode),
    barcode,
    name: pickOffName(product).slice(0, 120),
    name_en: (product.product_name_en || product.product_name || '').slice(0, 120) || null,
    brand: String(product.brands || '').split(',')[0]?.trim() || null,
    serving_grams: serving,
    calories_per_100g: kcal100 || 0,
    protein_per_100g: offNum(nut.proteins_100g),
    fat_per_100g: offNum(nut.fat_100g),
    carbs_per_100g: offNum(nut.carbohydrates_100g),
    fiber_per_100g: offNum(nut.fiber_100g),
    sugar_per_100g: offNum(nut.sugars_100g),
    sodium_mg: offNum(nut.sodium_100g) * 1000 || offNum(nut.salt_100g) * 400,
    country,
    search_keywords: [product.brands, product.categories_tags?.join(' ')].filter(Boolean).join(' ').slice(0, 255),
  };
}

export function offProductMatchesCountries(product, countries = []) {
  if (!countries.length) return true;
  const tags = [
    ...(product.countries_tags || []),
    ...(product.origins_tags || []),
    product.country,
  ].map((t) => String(t).toLowerCase());
  return countries.some((c) => {
    const code = c.toLowerCase();
    return tags.some((t) => t.includes(code) || t.endsWith(`:${code}`));
  });
}

export function isValidOffProduct(product) {
  const code = normalizeBarcode(product.code || product._id);
  if (!code) return false;
  const parsed = parseOffProduct(code, product);
  return parsed.calories_per_100g > 0 || parsed.protein_per_100g > 0;
}
