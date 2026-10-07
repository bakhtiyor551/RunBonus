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
  'ER_FK_DUP_NAME',
  'ER_CANNOT_ADD_FOREIGN',
  'ER_FK_COLUMN_NOT_NULL',
  'ER_DUP_CONSTRAINT_NAME',
  'ER_CANT_CREATE_TABLE',
]);

function splitSql(sql) {
  return sql
    .split(';')
    .map((s) => s.trim())
    .filter((s) => s.length > 0 && !s.startsWith('--'));
}

async function tableExists(conn, name) {
  const [rows] = await conn.query(
    `SELECT 1 AS ok FROM information_schema.tables
     WHERE table_schema = DATABASE() AND table_name = ? LIMIT 1`,
    [name]
  );
  return rows.length > 0;
}

async function ensureMigrationsTable(conn) {
  await conn.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id VARCHAR(255) NOT NULL PRIMARY KEY,
      applied_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
}

async function applySqlFile(conn, filePath, { soft = false } = {}) {
  const sql = fs.readFileSync(filePath, 'utf8');
  const parts = splitSql(sql);
  for (const part of parts) {
    const upper = part.toUpperCase();
    if (upper.startsWith('CREATE DATABASE') || upper.startsWith('USE ')) continue;
    try {
      await conn.query(part);
    } catch (err) {
      if (soft || IGNORABLE.has(err.code) || Number(err.errno) === 150) {
        console.warn(`[migrate] ${path.basename(filePath)}: ${err.message}`);
        continue;
      }
      throw err;
    }
  }
}

async function resetOrphanTables(conn) {
  const [tables] = await conn.query(
    `SELECT table_name AS name FROM information_schema.tables
     WHERE table_schema = DATABASE() AND table_type = 'BASE TABLE'`
  );
  if (!tables.length) return;
  console.warn(`[migrate] incomplete DB without users — dropping ${tables.length} orphan table(s)`);
  await conn.query('SET FOREIGN_KEY_CHECKS = 0');
  for (const t of tables) {
    const name = t.name || t.TABLE_NAME || t.table_name;
    await conn.query(`DROP TABLE IF EXISTS \`${name}\``);
  }
  await conn.query('SET FOREIGN_KEY_CHECKS = 1');
}

async function ensureBaseSchema(conn) {
  if (await tableExists(conn, 'users')) {
    return;
  }
  const schemaPath = path.join(__dirname, '../../database/schema.sql');
  if (!fs.existsSync(schemaPath)) {
    throw new Error(`[migrate] нет таблицы users и не найден schema.sql: ${schemaPath}`);
  }
  await resetOrphanTables(conn);
  console.log('[migrate] empty database — applying database/schema.sql');
  await conn.query('SET FOREIGN_KEY_CHECKS = 0');
  try {
    await applySqlFile(conn, schemaPath, { soft: true });
  } finally {
    await conn.query('SET FOREIGN_KEY_CHECKS = 1');
  }
  // resetOrphanTables мог удалить schema_migrations
  await ensureMigrationsTable(conn);
  if (!(await tableExists(conn, 'users'))) {
    throw new Error('[migrate] schema.sql применён, но таблица users не появилась');
  }
}

async function migrate() {
  const migrationsDir = path.join(__dirname, '../../database/migrations');
  if (!fs.existsSync(migrationsDir)) {
    throw new Error(`Не найден каталог миграций: ${migrationsDir}`);
  }

  const allowDestructive = process.env.ALLOW_DESTRUCTIVE_MIGRATIONS === '1';
  const softMigrations = process.env.MIGRATE_SOFT !== '0';
  const conn = await pool.getConnection();
  try {
    await ensureMigrationsTable(conn);
    await ensureBaseSchema(conn);
    await ensureMigrationsTable(conn);

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
      await conn.query('SET FOREIGN_KEY_CHECKS = 0');
      try {
        await applySqlFile(conn, path.join(migrationsDir, file), { soft: softMigrations });
      } finally {
        await conn.query('SET FOREIGN_KEY_CHECKS = 1');
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
