import { pool } from '../db.js';
import { emitWorkoutClosed } from './liveTrackingWs.js';

const AUTO_CLOSE_HOURS = 24;

/**
 * TZ §29: IN_PROGRESS / PAUSED старше 24ч → AUTO_CLOSED (0 approved KM).
 */
export async function autoCloseStaleWorkouts() {
  const [rows] = await pool.query(
    `SELECT id, user_id FROM workouts
     WHERE status IN ('in_progress', 'paused')
       AND started_at < (NOW() - INTERVAL ? HOUR)
     LIMIT 50`,
    [AUTO_CLOSE_HOURS]
  );

  for (const w of rows) {
    try {
      await pool.query(
        `UPDATE workouts SET
           status = 'auto_closed',
           finished_at = COALESCE(finished_at, NOW()),
           approved_distance_km = 0,
           validation_status = 'auto_closed',
           reject_reason = 'Автоматически закрыта: более 24 часов без завершения',
           validation_reasons = JSON_ARRAY('AUTO_CLOSED')
         WHERE id = ? AND status IN ('in_progress', 'paused')`,
        [w.id]
      );
      emitWorkoutClosed(w.id, 'auto_closed', { distance_km: 0, client_name: null });
    } catch (err) {
      console.warn('[auto-close]', w.id, err.message);
    }
  }

  return rows.length;
}
