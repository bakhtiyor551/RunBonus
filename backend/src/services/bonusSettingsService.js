import { pool } from '../db.js';
import { config } from '../config.js';

const FIELD_LABELS = {
  price_per_km: 'Цена за 1 км',
  daily_limit: 'Дневной лимит',
  total_limit_per_shoe: 'Общий лимит по кроссовкам',
  min_distance_km: 'Минимальная дистанция',
  min_duration_minutes: 'Минимальное время тренировки',
  max_speed_kmh: 'Максимальная скорость',
};

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

function formatValue(field, value) {
  if (field === 'min_duration_minutes') return `${value} мин`;
  if (field === 'min_distance_km') return `${value} км`;
  if (field === 'max_speed_kmh') return `${value} км/ч`;
  return `${value} сомони`;
}

export async function getBonusSettingsLog(limit = 50) {
  const [rows] = await pool.query(
    `SELECT l.*, a.login AS admin_login
     FROM bonus_settings_log l
     JOIN admin_users a ON a.id = l.admin_id
     ORDER BY l.created_at DESC
     LIMIT ?`,
    [limit]
  );
  return rows.map((r) => ({
    id: r.id,
    admin_login: r.admin_login,
    field_name: r.field_name,
    field_label: r.field_label,
    old_value: r.old_value,
    new_value: r.new_value,
    message: r.old_value
      ? `${r.field_label}: ${r.old_value} → ${r.new_value}`
      : `${r.field_label}: ${r.new_value}`,
    created_at: r.created_at,
  }));
}

export async function updateBonusSettings(conn, data, adminId) {
  const current = await getActiveBonusSettings(conn);
  let settingsId = current.id;

  if (!settingsId) {
    const [ins] = await conn.query(
      `INSERT INTO bonus_settings (
         price_per_km, daily_limit, total_limit_per_shoe,
         min_distance_km, min_duration_minutes, max_speed_kmh, status, created_by
       ) VALUES (?, ?, ?, ?, ?, ?, 'active', ?)`,
      [
        DEFAULTS.price_per_km,
        DEFAULTS.daily_limit,
        DEFAULTS.total_limit_per_shoe,
        DEFAULTS.min_distance_km,
        DEFAULTS.min_duration_minutes,
        DEFAULTS.max_speed_kmh,
        adminId,
      ]
    );
    settingsId = ins.insertId;
    Object.assign(current, DEFAULTS, { id: settingsId });
  }

  const updates = {};
  const fields = [
    'price_per_km',
    'daily_limit',
    'total_limit_per_shoe',
    'min_distance_km',
    'min_duration_minutes',
    'max_speed_kmh',
  ];

  for (const field of fields) {
    if (data[field] == null) continue;
    const num = field === 'min_duration_minutes' ? parseInt(data[field], 10) : Number(data[field]);
    if (Number.isNaN(num) || num < 0) {
      const err = new Error(`INVALID_${field.toUpperCase()}`);
      err.code = 'INVALID_VALUE';
      throw err;
    }
    updates[field] = num;
  }

  const logEntries = [];

  for (const [field, newVal] of Object.entries(updates)) {
    const oldVal = current[field];
    if (oldVal === newVal) continue;

    const oldFmt = formatValue(field, oldVal);
    const newFmt = formatValue(field, newVal);

    await conn.query(
      `INSERT INTO bonus_settings_log (admin_id, field_name, field_label, old_value, new_value)
       VALUES (?, ?, ?, ?, ?)`,
      [adminId, field, FIELD_LABELS[field], oldFmt, newFmt]
    );

    logEntries.push({
      field,
      field_label: FIELD_LABELS[field],
      old_value: oldFmt,
      new_value: newFmt,
      message: `${FIELD_LABELS[field]}: ${oldFmt} → ${newFmt}`,
    });
  }

  if (Object.keys(updates).length) {
    const sets = Object.keys(updates).map((f) => `${f} = ?`).join(', ');
    const vals = [...Object.values(updates), adminId, settingsId];
    await conn.query(
      `UPDATE bonus_settings SET ${sets}, created_by = ? WHERE id = ?`,
      vals
    );
  }

  const updated = await getActiveBonusSettings(conn);
  return { settings: updated, changes: logEntries };
}
