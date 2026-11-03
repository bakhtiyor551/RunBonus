import { pool } from '../db.js';

function round2(n) {
  return Math.round(Number(n) * 100) / 100;
}

export async function backfillShoeKm(conn, userId, shoeId) {
  const [rows] = await conn.query(
    `SELECT COALESCE(SUM(distance_km), 0) AS km
     FROM workouts
     WHERE user_id = ? AND shoe_id = ? AND status = 'approved'`,
    [userId, shoeId]
  );
  return Number(rows[0]?.km || 0);
}

/** Создаёт/обновляет прогресс по паре кроссовок (только км, без уровней). */
export async function ensureShoeProgress(conn, userId, shoeId) {
  const [existing] = await conn.query(
    `SELECT * FROM user_shoe_progress WHERE user_id = ? AND shoe_id = ?`,
    [userId, shoeId]
  );
  if (existing.length) {
    const row = existing[0];
    if (Number(row.total_km) === 0 && !row.is_completed) {
      const km = await backfillShoeKm(conn, userId, shoeId);
      if (km > 0) {
        await conn.query(
          `UPDATE user_shoe_progress SET total_km = ?, current_level_id = NULL
           WHERE id = ?`,
          [round2(km), row.id]
        );
        row.total_km = km;
      }
    }
    return row;
  }

  const km = await backfillShoeKm(conn, userId, shoeId);
  const [result] = await conn.query(
    `INSERT INTO user_shoe_progress
       (user_id, shoe_id, total_km, total_bonus, current_level_id, is_completed, completed_at)
     VALUES (?, ?, ?, 0, NULL, 0, NULL)`,
    [userId, shoeId, round2(km)]
  );

  const [rows] = await conn.query('SELECT * FROM user_shoe_progress WHERE id = ?', [result.insertId]);
  return rows[0];
}

/** Добавляет км тренировки к прогрессу пары. */
export async function applyWorkoutProgress(conn, userId, shoeId, distanceKm, bonusCredited = 0) {
  const progress = await ensureShoeProgress(conn, userId, shoeId);
  const kmBefore = Number(progress.total_km) || 0;
  const kmAfter = round2(kmBefore + Math.max(0, Number(distanceKm) || 0));

  await conn.query(
    `UPDATE user_shoe_progress SET
       total_km = ?,
       total_bonus = total_bonus + ?,
       current_level_id = NULL
     WHERE user_id = ? AND shoe_id = ?`,
    [kmAfter, round2(bonusCredited), userId, shoeId]
  );

  return { kmBefore, kmAfter };
}
