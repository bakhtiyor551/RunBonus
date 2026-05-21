import { Router } from 'express';
import { pool } from '../db.js';
import { authUser, requireActiveUser } from '../middleware/auth.js';
import { validateWorkout } from '../services/workoutValidation.js';
import {
  getDailyEarned,
  getShoeTotalEarned,
  calcBonusAmount,
  calcRawBonus,
  applyBonus,
} from '../services/bonusService.js';
import { getActiveBonusSettings } from '../services/bonusSettingsService.js';
import { getActiveBonusFund } from '../services/accountService.js';
import {
  buildClientFinishResponse,
  CLIENT_START_ERRORS,
} from '../utils/clientWorkoutResponse.js';
import { normalizeGpsPoint, shouldSaveGpsPoint } from '../utils/geo.js';

const router = Router();

async function getActiveShoe(userId) {
  const [rows] = await pool.query(
    `SELECT s.* FROM user_active_shoes uas
     JOIN shoes s ON s.id = uas.shoe_id WHERE uas.user_id = ?`,
    [userId]
  );
  return rows[0] || null;
}

async function assertWorkoutOwner(workoutId, userId) {
  const [rows] = await pool.query(
    `SELECT * FROM workouts WHERE id = ? AND user_id = ? AND status = 'in_progress'`,
    [workoutId, userId]
  );
  return rows[0] || null;
}

/** Закрыть только очень старые незавершённые тренировки (>24 ч). */
async function closeStaleWorkouts(conn, userId) {
  await conn.query(
    `UPDATE workouts SET
       status = 'rejected',
       reject_reason = 'Тренировка отменена (не завершена)',
       finished_at = NOW()
     WHERE user_id = ? AND status = 'in_progress'
       AND started_at < DATE_SUB(NOW(), INTERVAL 24 HOUR)`,
    [userId]
  );
}

async function getInProgressWorkout(conn, userId) {
  const [rows] = await conn.query(
    `SELECT id FROM workouts
     WHERE user_id = ? AND status = 'in_progress'
     ORDER BY started_at DESC LIMIT 1`,
    [userId]
  );
  return rows[0] || null;
}

router.post('/start', authUser, requireActiveUser, async (req, res) => {
  const conn = await pool.getConnection();
  try {
    const shoe = await getActiveShoe(req.userId);
    if (!shoe) {
      return res.status(400).json({ error: CLIENT_START_ERRORS.NO_SHOE });
    }
    if (shoe.status !== 'activated') {
      return res.status(400).json({ error: CLIENT_START_ERRORS.SHOE_INACTIVE });
    }

    await conn.beginTransaction();
    await closeStaleWorkouts(conn, req.userId);

    const existing = await getInProgressWorkout(conn, req.userId);
    if (existing) {
      await conn.commit();
      return res.status(200).json({
        workoutId: existing.id,
        id: existing.id,
        resumed: true,
      });
    }

    const [result] = await conn.query(
      `INSERT INTO workouts (user_id, shoe_id, started_at, status, background_tracking)
       VALUES (?, ?, NOW(), 'in_progress', TRUE)`,
      [req.userId, shoe.id]
    );

    await conn.commit();

    res.status(201).json({
      workoutId: result.insertId,
      id: result.insertId,
    });
  } catch (err) {
    await conn.rollback();
    console.error(err);
    res.status(500).json({ error: CLIENT_START_ERRORS.GENERIC });
  } finally {
    conn.release();
  }
});

async function getLastWorkoutPoint(workoutId, conn = pool) {
  const [rows] = await conn.query(
    `SELECT latitude, longitude, speed, accuracy, recorded_at
     FROM workout_points WHERE workout_id = ? ORDER BY recorded_at DESC LIMIT 1`,
    [workoutId]
  );
  return rows[0] ? normalizeGpsPoint(rows[0]) : null;
}

async function insertGpsPoint(conn, workoutId, rawPoint) {
  const p = normalizeGpsPoint(rawPoint);
  if (!p) return false;

  await conn.query(
    `INSERT INTO workout_points (workout_id, latitude, longitude, speed, accuracy, recorded_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [
      workoutId,
      p.latitude,
      p.longitude,
      p.speed,
      p.accuracy,
      p.recorded_at ? new Date(p.recorded_at) : new Date(),
    ]
  );
  return true;
}

async function savePoints(workoutId, userId, points) {
  const workout = await assertWorkoutOwner(workoutId, userId);
  if (!workout) return null;

  const list = Array.isArray(points) ? points : [points];
  let last = await getLastWorkoutPoint(workoutId);

  for (const raw of list) {
    if (!shouldSaveGpsPoint(last, raw)) continue;
    const p = normalizeGpsPoint(raw);
    await insertGpsPoint(pool, workoutId, p);
    last = p;
  }
  return workout;
}

router.post('/point', authUser, async (req, res) => {
  try {
    const workout_id = req.body.workout_id ?? req.params.id;
    const saved = await savePoints(workout_id, req.userId, req.body);
    if (!saved) return res.status(404).json({ error: 'Тренировка не найдена' });
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Ошибка сохранения точки' });
  }
});

router.post('/:id/points', authUser, async (req, res) => {
  try {
    const workoutId = req.params.id;
    const payload = req.body.points?.length ? req.body.points : req.body;
    const saved = await savePoints(workoutId, req.userId, payload);
    if (!saved) return res.status(404).json({ error: 'Тренировка не найдена' });
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Ошибка сохранения точек' });
  }
});

async function finishWorkout(workoutId, userId, clientPoints) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const [workouts] = await conn.query(
      `SELECT w.*, s.status AS shoe_status FROM workouts w
       JOIN shoes s ON s.id = w.shoe_id
       WHERE w.id = ? AND w.user_id = ? FOR UPDATE`,
      [workoutId, userId]
    );

    if (!workouts.length) {
      await conn.rollback();
      return { status: 404, body: { error: 'Тренировка не найдена' } };
    }

    const workout = workouts[0];
    if (workout.status !== 'in_progress') {
      await conn.rollback();
      return { status: 400, body: { error: 'Тренировка уже завершена' } };
    }

    if (clientPoints?.length) {
      let last = await getLastWorkoutPoint(workoutId, conn);
      const batch = Array.isArray(clientPoints) ? clientPoints : [clientPoints];
      for (const raw of batch) {
        if (!shouldSaveGpsPoint(last, raw)) continue;
        const saved = await insertGpsPoint(conn, workoutId, raw);
        if (saved) last = normalizeGpsPoint(raw);
      }
    }

    const [dbPoints] = await conn.query(
      'SELECT latitude, longitude, speed, accuracy, recorded_at FROM workout_points WHERE workout_id = ? ORDER BY recorded_at',
      [workoutId]
    );

    const startedAt = new Date(workout.started_at);
    const finishedAt = new Date();
    const durationSeconds = Math.floor((finishedAt - startedAt) / 1000);

    const settings = await getActiveBonusSettings(conn);
    const validation = validateWorkout(dbPoints, durationSeconds, settings);

    const distanceKm = validation.distanceKm ?? 0;
    const pricePerKm = settings.price_per_km;
    const rawCalculatedBonus = calcRawBonus(distanceKm, pricePerKm);

    let bonusAmount = 0;
    let finalStatus = validation.status;
    let rejectReason = validation.ok ? null : validation.reason;

    if (validation.ok) {
      const today = new Date().toISOString().slice(0, 10);
      const dailyEarned = await getDailyEarned(userId, workout.shoe_id, today);
      const shoeTotal = await getShoeTotalEarned(userId, workout.shoe_id);

      if (dailyEarned >= settings.daily_limit) {
        finalStatus = 'rejected';
        rejectReason = 'Дневной лимит уже достигнут';
      } else if (shoeTotal >= settings.total_limit_per_shoe) {
        finalStatus = 'rejected';
        rejectReason = 'Общий лимит по кроссовкам достигнут';
      } else if (workout.shoe_status === 'blocked') {
        finalStatus = 'rejected';
        rejectReason = 'Кроссовки заблокированы';
      } else {
        bonusAmount = calcBonusAmount(distanceKm, dailyEarned, shoeTotal, settings);
        if (bonusAmount <= 0) {
          finalStatus = 'rejected';
          rejectReason = 'Лимит бонусов исчерпан';
        } else {
          const fund = await getActiveBonusFund(conn);
          if (!fund || Number(fund.current_balance) < bonusAmount) {
            finalStatus = 'rejected_no_fund';
            rejectReason = 'Бонус не начислен — недостаточно средств в бонусном фонде';
            bonusAmount = 0;
          }
        }
      }
    }

    await conn.query(
      `UPDATE workouts SET
        distance_km = ?, duration_seconds = ?, avg_speed = ?, max_speed = ?,
        finished_at = ?, status = ?, reject_reason = ?,
        price_per_km = ?, calculated_bonus = ?
       WHERE id = ?`,
      [
        distanceKm,
        durationSeconds,
        validation.avgSpeed ?? null,
        validation.maxSpeed ?? null,
        finishedAt,
        finalStatus,
        rejectReason,
        pricePerKm,
        rawCalculatedBonus,
        workoutId,
      ]
    );

    let balanceAfter = null;
    if (bonusAmount > 0 && finalStatus === 'approved') {
      try {
        const result = await applyBonus(conn, {
          userId,
          shoeId: workout.shoe_id,
          workoutId,
          amount: bonusAmount,
        });
        balanceAfter = result.balanceAfter;
      } catch (err) {
        if (err.code === 'INSUFFICIENT_FUND' || err.code === 'NO_BONUS_FUND') {
          finalStatus = 'rejected_no_fund';
          rejectReason = 'Бонус не начислен — недостаточно средств в бонусном фонде';
          bonusAmount = 0;
          await conn.query(
            `UPDATE workouts SET status = ?, reject_reason = ?, calculated_bonus = 0 WHERE id = ?`,
            [finalStatus, rejectReason, workoutId]
          );
        } else {
          throw err;
        }
      }
    }

    await conn.commit();

    const client = buildClientFinishResponse({
      finalStatus,
      bonusAmount,
      distanceKm: validation.distanceKm ?? 0,
      balanceAfter,
    });

    return { status: 200, body: client };
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

router.post('/finish', authUser, async (req, res) => {
  try {
    const workout_id = req.body.workout_id ?? req.params.id;
    const result = await finishWorkout(workout_id, req.userId, req.body.points);
    res.status(result.status).json(result.body);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Ошибка завершения тренировки' });
  }
});

router.post('/:id/finish', authUser, async (req, res) => {
  try {
    const result = await finishWorkout(req.params.id, req.userId, req.body.points);
    res.status(result.status).json(result.body);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Ошибка завершения тренировки' });
  }
});

router.get('/history', authUser, async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT id, distance_km, duration_seconds, avg_speed, max_speed,
              started_at, finished_at, status, calculated_bonus, reject_reason
       FROM workouts WHERE user_id = ? ORDER BY started_at DESC LIMIT 50`,
      [req.userId]
    );
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Ошибка загрузки истории' });
  }
});

export default router;
