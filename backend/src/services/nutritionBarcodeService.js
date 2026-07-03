import { pool } from '../db.js';
import { scaleNutrients } from '../utils/calories.js';
import { normalizeBarcode, parseOffProduct } from '../utils/offProduct.js';

async function hasBarcodeTable() {
  try {
    await pool.query('SELECT 1 FROM nutrition_food_barcodes LIMIT 1');
    return true;
  } catch (e) {
    if (e.code === 'ER_NO_SUCH_TABLE') return false;
    throw e;
  }
}

function foodToPayload(food, { barcode, source = 'local' } = {}) {
  const serving = Number(food.serving_grams) || 100;
  return {
    found: true,
    source,
    barcode,
    food: {
      id: food.id,
      name: food.name,
      country: food.country,
      serving_grams: serving,
      calories_per_100g: Number(food.calories_per_100g),
      protein_per_100g: Number(food.protein_per_100g),
      fat_per_100g: Number(food.fat_per_100g),
      carbs_per_100g: Number(food.carbs_per_100g),
      default_nutrients: scaleNutrients(food, serving),
    },
  };
}

async function lookupLocalBarcode(barcode) {
  if (!(await hasBarcodeTable())) return null;

  const [rows] = await pool.query(
    `SELECT f.*, b.barcode, b.source AS barcode_source
     FROM nutrition_food_barcodes b
     JOIN nutrition_foods f ON f.id = b.food_id AND f.is_active = 1
     WHERE b.barcode = ?
     LIMIT 1`,
    [barcode]
  );
  if (!rows.length) return null;
  const row = rows[0];
  return foodToPayload(row, { barcode, source: row.barcode_source || 'local' });
}

async function fetchFromOpenFoodFacts(barcode) {
  const url = `https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(barcode)}.json`;
  const res = await fetch(url, {
    headers: { 'User-Agent': 'RunBonus/1.0 (nutrition module)' },
  });
  if (!res.ok) return null;

  const data = await res.json();
  if (data.status !== 1 || !data.product) return null;

  const parsed = parseOffProduct(barcode, data.product);
  if (!parsed.calories_per_100g && !parsed.protein_per_100g) return null;
  return parsed;
}

async function cacheOffProduct(parsed) {
  if (!(await hasBarcodeTable())) return null;

  const [existing] = await pool.query(
    'SELECT food_id FROM nutrition_food_barcodes WHERE barcode = ?',
    [parsed.barcode]
  );
  if (existing.length) {
    const [foods] = await pool.query('SELECT * FROM nutrition_foods WHERE id = ? AND is_active = 1', [existing[0].food_id]);
    if (foods.length) return foods[0];
  }

  try {
    const [byExt] = await pool.query('SELECT * FROM nutrition_foods WHERE external_id = ? AND is_active = 1 LIMIT 1', [parsed.external_id]);
    if (byExt.length) {
      await pool.query(
        `INSERT INTO nutrition_food_barcodes (food_id, barcode, source)
         VALUES (?, ?, 'off')
         ON DUPLICATE KEY UPDATE food_id = VALUES(food_id)`,
        [byExt[0].id, parsed.barcode]
      );
      return byExt[0];
    }
  } catch {
    /* external_id column optional before migration 034 */
  }

  const [dup] = await pool.query(
    'SELECT * FROM nutrition_foods WHERE is_active = 1 AND name = ? LIMIT 1',
    [parsed.name]
  );
  if (dup.length) {
    await pool.query(
      `INSERT INTO nutrition_food_barcodes (food_id, barcode, source)
       VALUES (?, ?, 'off')
       ON DUPLICATE KEY UPDATE food_id = VALUES(food_id)`,
      [dup[0].id, parsed.barcode]
    );
    return dup[0];
  }

  let insertSql = `INSERT INTO nutrition_foods
       (name, name_en, country, serving_grams, calories_per_100g, protein_per_100g, fat_per_100g,
        carbs_per_100g, fiber_per_100g, sugar_per_100g, sodium_mg, search_keywords, is_active, food_source, external_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 'off', ?)`;
  const params = [
    parsed.name.slice(0, 120),
    parsed.name_en,
    parsed.country,
    parsed.serving_grams,
    parsed.calories_per_100g,
    parsed.protein_per_100g,
    parsed.fat_per_100g,
    parsed.carbs_per_100g,
    parsed.fiber_per_100g,
    parsed.sugar_per_100g,
    parsed.sodium_mg,
    parsed.search_keywords || null,
    parsed.external_id,
  ];

  const [result] = await pool.query(insertSql, params);

  await pool.query(
    'INSERT INTO nutrition_food_barcodes (food_id, barcode, source) VALUES (?, ?, ?)',
    [result.insertId, parsed.barcode, 'off']
  );

  const [foods] = await pool.query('SELECT * FROM nutrition_foods WHERE id = ?', [result.insertId]);
  return foods[0] || null;
}

export async function lookupFoodByBarcode(rawCode) {
  const barcode = normalizeBarcode(rawCode);
  if (!barcode) {
    const err = new Error('Неверный штрихкод');
    err.status = 400;
    throw err;
  }

  const local = await lookupLocalBarcode(barcode);
  if (local) return local;

  let off = null;
  try {
    off = await fetchFromOpenFoodFacts(barcode);
  } catch (e) {
    console.warn('[nutrition/barcode] OFF:', e.message);
  }

  if (!off) {
    return { found: false, barcode };
  }

  const food = await cacheOffProduct(off);
  if (!food) {
    return {
      found: true,
      source: 'off',
      barcode,
      food: {
        id: null,
        name: off.name,
        serving_grams: off.serving_grams,
        calories_per_100g: off.calories_per_100g,
        protein_per_100g: off.protein_per_100g,
        fat_per_100g: off.fat_per_100g,
        carbs_per_100g: off.carbs_per_100g,
        default_nutrients: scaleNutrients(off, off.serving_grams),
      },
    };
  }

  return foodToPayload(food, { barcode, source: 'off' });
}
