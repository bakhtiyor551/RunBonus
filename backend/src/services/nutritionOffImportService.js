import fs from 'fs';
import readline from 'readline';
import { createGunzip } from 'zlib';
import { pool } from '../db.js';
import {
  normalizeBarcode,
  parseOffProduct,
  offProductMatchesCountries,
  isValidOffProduct,
} from '../utils/offProduct.js';

async function hasImportTables() {
  try {
    await pool.query('SELECT 1 FROM nutrition_import_batches LIMIT 1');
    await pool.query('SELECT food_source FROM nutrition_foods LIMIT 1');
    return true;
  } catch (e) {
    if (e.code === 'ER_NO_SUCH_TABLE' || e.code === 'ER_BAD_FIELD_ERROR') return false;
    throw e;
  }
}

async function hasBarcodeTable() {
  try {
    await pool.query('SELECT 1 FROM nutrition_food_barcodes LIMIT 1');
    return true;
  } catch (e) {
    if (e.code === 'ER_NO_SUCH_TABLE') return false;
    throw e;
  }
}

async function insertOffFood(parsed) {
  const [result] = await pool.query(
    `INSERT INTO nutrition_foods
       (name, name_en, country, serving_grams, calories_per_100g, protein_per_100g, fat_per_100g,
        carbs_per_100g, fiber_per_100g, sugar_per_100g, sodium_mg, search_keywords, is_active,
        food_source, external_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 'off', ?)
     ON DUPLICATE KEY UPDATE
       name = VALUES(name),
       calories_per_100g = VALUES(calories_per_100g),
       protein_per_100g = VALUES(protein_per_100g),
       fat_per_100g = VALUES(fat_per_100g),
       carbs_per_100g = VALUES(carbs_per_100g),
       fiber_per_100g = VALUES(fiber_per_100g),
       sugar_per_100g = VALUES(sugar_per_100g),
       sodium_mg = VALUES(sodium_mg),
       search_keywords = VALUES(search_keywords),
       food_source = 'off',
       updated_at = CURRENT_TIMESTAMP`,
    [
      parsed.name,
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
    ]
  );

  let foodId = result.insertId;
  if (!foodId) {
    const [rows] = await pool.query('SELECT id FROM nutrition_foods WHERE external_id = ? LIMIT 1', [parsed.external_id]);
    foodId = rows[0]?.id;
  }

  if (foodId && (await hasBarcodeTable())) {
    await pool.query(
      `INSERT INTO nutrition_food_barcodes (food_id, barcode, source)
       VALUES (?, ?, 'off')
       ON DUPLICATE KEY UPDATE food_id = VALUES(food_id)`,
      [foodId, parsed.barcode]
    );
  }

  return foodId;
}

function openLineStream(filePath) {
  const isGz = filePath.endsWith('.gz');
  const input = isGz
    ? fs.createReadStream(filePath).pipe(createGunzip())
    : fs.createReadStream(filePath);
  return readline.createInterface({ input, crlfDelay: Infinity });
}

export async function importOpenFoodFactsFile({
  filePath,
  limit = 100000,
  countries = [],
  onProgress = null,
} = {}) {
  if (!(await hasImportTables())) {
    const err = new Error('Миграция OFF-импорта не применена (034)');
    err.status = 503;
    throw err;
  }

  if (!filePath || !fs.existsSync(filePath)) {
    const err = new Error('Файл не найден');
    err.status = 400;
    throw err;
  }

  const countryFilter = countries.map((c) => String(c).trim().toUpperCase()).filter(Boolean);
  const [batchResult] = await pool.query(
    `INSERT INTO nutrition_import_batches (source, file_name, status, options_json)
     VALUES ('openfoodfacts', ?, 'running', ?)`,
    [pathBasename(filePath), JSON.stringify({ limit, countries: countryFilter })]
  );
  const batchId = batchResult.insertId;

  const stats = { total: 0, inserted: 0, skipped: 0, errors: 0 };

  try {
    const rl = openLineStream(filePath);
    for await (const line of rl) {
      if (stats.inserted >= limit) break;
      if (!line.trim()) continue;
      stats.total += 1;

      let product;
      try {
        product = JSON.parse(line);
      } catch {
        stats.errors += 1;
        continue;
      }

      if (!isValidOffProduct(product)) {
        stats.skipped += 1;
        continue;
      }

      if (!offProductMatchesCountries(product, countryFilter)) {
        stats.skipped += 1;
        continue;
      }

      const barcode = normalizeBarcode(product.code || product._id);
      const parsed = parseOffProduct(barcode, product);

      try {
        await insertOffFood(parsed);
        stats.inserted += 1;
      } catch (e) {
        if (e.code === 'ER_DUP_ENTRY') stats.skipped += 1;
        else stats.errors += 1;
      }

      if (onProgress && stats.total % 1000 === 0) {
        onProgress({ ...stats, batchId });
      }
    }

    await pool.query(
      `UPDATE nutrition_import_batches
       SET status = 'completed', rows_total = ?, rows_inserted = ?, rows_skipped = ?, rows_errors = ?, finished_at = NOW()
       WHERE id = ?`,
      [stats.total, stats.inserted, stats.skipped, stats.errors, batchId]
    );
  } catch (err) {
    await pool.query(
      `UPDATE nutrition_import_batches
       SET status = 'failed', rows_total = ?, rows_inserted = ?, rows_skipped = ?, rows_errors = ?,
           error_message = ?, finished_at = NOW()
       WHERE id = ?`,
      [stats.total, stats.inserted, stats.skipped, stats.errors, err.message, batchId]
    );
    throw err;
  }

  return { batchId, ...stats };
}

function pathBasename(filePath) {
  return String(filePath).split(/[/\\]/).pop();
}

export async function listImportBatches(limit = 20) {
  if (!(await hasImportTables())) return [];
  const [rows] = await pool.query(
    `SELECT id, source, file_name, status, rows_total, rows_inserted, rows_skipped, rows_errors,
            started_at, finished_at
     FROM nutrition_import_batches
     ORDER BY id DESC LIMIT ?`,
    [Math.min(Number(limit) || 20, 100)]
  );
  return rows;
}

export async function getOffFoodsCount() {
  try {
    const [rows] = await pool.query(
      "SELECT COUNT(*) AS c FROM nutrition_foods WHERE is_active = 1 AND food_source = 'off'"
    );
    return Number(rows[0]?.c) || 0;
  } catch {
    return 0;
  }
}
