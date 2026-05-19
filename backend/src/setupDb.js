import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { pool } from './db.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const schemaPath = path.join(__dirname, '../../database/schema.sql');

async function setupDb() {
  if (!fs.existsSync(schemaPath)) {
    throw new Error(`Не найден файл схемы: ${schemaPath}`);
  }

  const sql = fs.readFileSync(schemaPath, 'utf8');
  const statements = sql
    .split(';')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  const migrationsDir = path.join(__dirname, '../../database/migrations');

  const conn = await pool.getConnection();
  try {
    for (const statement of statements) {
      const upper = statement.toUpperCase();
      if (upper.startsWith('CREATE DATABASE') || upper.startsWith('USE ')) {
        continue;
      }
      await conn.query(statement);
    }

    if (fs.existsSync(migrationsDir)) {
      const files = fs.readdirSync(migrationsDir).filter((f) => f.endsWith('.sql')).sort();
      for (const file of files) {
        const migrationSql = fs.readFileSync(path.join(migrationsDir, file), 'utf8');
        const parts = migrationSql
          .split(';')
          .map((s) => s.trim())
          .filter((s) => s.length > 0);
        for (const part of parts) {
          try {
            await conn.query(part);
          } catch (err) {
            if (err.code !== 'ER_DUP_FIELDNAME' && err.code !== 'ER_TABLE_EXISTS_ERROR') {
              console.warn(`Миграция ${file}:`, err.message);
            }
          }
        }
      }
    }

    console.log('Таблицы созданы успешно.');
  } finally {
    conn.release();
    await pool.end();
  }
}

setupDb().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
