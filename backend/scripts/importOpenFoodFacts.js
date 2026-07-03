#!/usr/bin/env node
/**
 * Импорт Open Food Facts (JSONL / JSONL.GZ)
 *
 * Скачайте дамп: https://world.openfoodfacts.org/data
 *   openfoodfacts-products.jsonl.gz
 *
 * Примеры:
 *   node scripts/importOpenFoodFacts.js --file ./data/openfoodfacts-products.jsonl.gz --limit 100000
 *   node scripts/importOpenFoodFacts.js --file ./data/off.jsonl --limit 50000 --countries RU,UZ,TJ,KZ
 */
import 'dotenv/config';
import { importOpenFoodFactsFile } from '../src/services/nutritionOffImportService.js';

function parseArgs(argv) {
  const opts = { limit: 100000, countries: [] };
  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--file') opts.filePath = argv[++i];
    else if (arg === '--limit') opts.limit = Number(argv[++i]) || 100000;
    else if (arg === '--countries') opts.countries = String(argv[++i] || '').split(',').map((s) => s.trim()).filter(Boolean);
  }
  return opts;
}

const opts = parseArgs(process.argv);
if (!opts.filePath) {
  console.error('Usage: node scripts/importOpenFoodFacts.js --file <path.jsonl[.gz]> [--limit 100000] [--countries RU,UZ]');
  process.exit(1);
}

const started = Date.now();
const result = await importOpenFoodFactsFile({
  filePath: opts.filePath,
  limit: opts.limit,
  countries: opts.countries,
  onProgress: (s) => {
    console.log(`[off-import] processed=${s.total} inserted=${s.inserted} skipped=${s.skipped} errors=${s.errors}`);
  },
});

const sec = Math.round((Date.now() - started) / 1000);
console.log(`[off-import] done in ${sec}s`, result);
