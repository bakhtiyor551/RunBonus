import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { pool } from './db.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DESTRUCTIVE_RE = /destructive|drop_all|delete_all/i;
const IGNORABLE = new Set([
  'ER_DUP_FIELDNAME',
  'ER_TABLE_EXISTS_ERROR',
  'ER_DUP_KEYNAME',
  'ER_CANT_DROP_FIELD_OR_KEY',
  'ER_DUP_ENTRY',
  'ER_DUP_KEY',
]);

function splitSql(sql) {
  return sql
    .split(';')
    .map((s) => s.trim())
    .filter((s) => s.length > 0 && !s.startsWith('--'));
}

async function migrate() {
  const migrationsDir = path.join(__dirname, '../../database/migrations');
  if (!fs.existsSync(migrationsDir)) {
    throw new Error(`Не найден каталог миграций: ${migrationsDir}`);
  }

  const allowDestructive = process.env.ALLOW_DESTRUCTIVE_MIGRATIONS === '1';
  const conn = await pool.getConnection();
  try {
    await conn.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        id VARCHAR(255) NOT NULL PRIMARY KEY,
        applied_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);

    const [rows] = await conn.query('SELECT id FROM schema_migrations');
    const applied = new Set(rows.map((r) => r.id));
    const files = fs.readdirSync(migrationsDir).filter((f) => f.endsWith('.sql')).sort();

    for (const file of files) {
      if (applied.has(file)) {
        console.log(`[migrate] skip ${file}`);
        continue;
      }
      if (DESTRUCTIVE_RE.test(file) && !allowDestructive) {
        throw new Error(
          `[migrate] ${file} выглядит разрушительной. Для применения задайте ALLOW_DESTRUCTIVE_MIGRATIONS=1`
        );
      }

      console.log(`[migrate] apply ${file}`);
      const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8');
      const parts = splitSql(sql);
      for (const part of parts) {
        try {
          await conn.query(part);
        } catch (err) {
          if (IGNORABLE.has(err.code)) {
            console.warn(`[migrate] ${file}: ${err.message}`);
            continue;
          }
          throw err;
        }
      }
      await conn.query('INSERT INTO schema_migrations (id) VALUES (?)', [file]);
    }
    console.log('[migrate] complete');
  } finally {
    conn.release();
    await pool.end();
  }
}

migrate().catch((err) => {
  console.error('[migrate]', err.message || err);
  process.exit(1);
});
