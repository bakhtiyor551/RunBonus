import { pool } from '../db.js';
import { config } from '../config.js';

const DEFAULTS = {
  price_per_km: Number(config.bonusPerKm || 3),
  daily_limit: Number(config.dailyBonusLimit || 10),
  total_limit_per_shoe: Number(config.shoeBonusLimit || 200),
  min_distance_km: 0.5,
  min_duration_minutes: 5,
  max_speed_kmh: 18,
};

function mapRow(row) {
  return {
    id: row.id,
    price_per_km: Number(row.price_per_km),
    daily_limit: Number(row.daily_limit),
    total_limit_per_shoe: Number(row.total_limit_per_shoe),
    min_distance_km: Number(row.min_distance_km),
    min_duration_minutes: Number(row.min_duration_minutes),
    max_speed_kmh: Number(row.max_speed_kmh),
    status: row.status,
    updated_at: row.updated_at,
  };
}

/** Активные лимиты/тарифы для начисления бонусов за тренировку (из БД или defaults). */
export async function getActiveBonusSettings(conn = pool) {
  try {
    const [rows] = await conn.query(
      `SELECT * FROM bonus_settings WHERE status = 'active' ORDER BY id DESC LIMIT 1`
    );
    if (!rows.length) return { ...DEFAULTS };
    return mapRow(rows[0]);
  } catch (err) {
    if (err.code === 'ER_NO_SUCH_TABLE') return { ...DEFAULTS };
    throw err;
  }
}
