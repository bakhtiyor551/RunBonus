import { Router } from 'express';
import { pool } from '../db.js';
import { config } from '../config.js';
import { authUser, requireActiveUser } from '../middleware/auth.js';
import { validateWorkout } from '../services/workoutValidation.js';
import {
  getDailyEarned,
  getShoeTotalEarned,
  calcBonusAmount,
  applyBonus,
} from '../services/bonusService.js';
import { getActiveBonusFund } from '../services/accountService.js';
import {
  buildClientFinishResponse,
  CLIENT_START_ERRORS,
} from '../utils/clientWorkoutResponse.js';

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

async function canStartWorkout(userId, shoeId) {
  const shoeTotal = await getShoeTotalEarned(userId, shoeId);
  if (shoeTotal >= config.shoeBonusLimit) return false;

  const today = new Date().toISOString().slice(0, 10);
  const dailyEarned = await getDailyEarned(userId, shoeId, today);
  if (dailyEarned >= config.dailyBonusLimit) return false;

  return true;
}

router.post('/start', authUser, requireActiveUser, async (req, res) => {
  try {
    const shoe = await getActiveShoe(req.userId);
    if (!shoe) {
      return res.status(400).json({ error: CLIENT_START_ERRORS.NO_SHOE });
    }
    if (shoe.status !== 'activated') {
      return res.status(400).json({ error: CLIENT_START_ERRORS.SHOE_INACTIVE });
    }

    if (!(await canStartWorkout(req.userId, shoe.id))) {
      return res.status(400).json({ error: CLIENT_START_ERRORS.CANNOT_START });
    }

    const [result] = await pool.query(
      `INSERT INTO workouts (
         user_id, shoe_id, started_at, status,
         client_visible_map, client_visible_limits, background_tracking
       ) VALUES (?, ?, NOW(), 'in_progress', FALSE, FALSE, TRUE)`,
      [req.userId, shoe.id]
    );

    res.status(201).json({
      workoutId: result.insertId,
      id: result.insertId,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: CLIENT_START_ERRORS.GENERIC });
  }
});

async function savePoints(workoutId, userId, points) {
  const workout = await assertWorkoutOwner(workoutId, userId);
  if (!workout) return null;

  const list = Array.isArray(points) ? points : [points];
  for (const p of list) {
    const lat = p.latitude ?? p.lat;
    const lng = p.longitude ?? p.lng;
    if (lat == null || lng == null) continue;

    await pool.query(
      `INSERT INTO workout_points (workout_id, latitude, longitude, speed, accuracy, recorded_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        workoutId,
        lat,
        lng,
        p.speed ?? null,
        p.accuracy ?? null,
        p.recorded_at ? new Date(p.recorded_at) : new Date(),
      ]
    );
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
      for (const p of clientPoints) {
        const lat = p.latitude ?? p.lat;
        const lng = p.longitude ?? p.lng;
        if (lat == null || lng == null) continue;
        await conn.query(
          `INSERT INTO workout_points (workout_id, latitude, longitude, speed, accuracy, recorded_at)
           VALUES (?, ?, ?, ?, ?, ?)`,
          [
            workoutId,
            lat,
            lng,
            p.speed ?? null,
            p.accuracy ?? null,
            p.recorded_at ? new Date(p.recorded_at) : new Date(),
          ]
        );
      }
    }

    const [dbPoints] = await conn.query(
      'SELECT latitude, longitude, speed, accuracy, recorded_at FROM workout_points WHERE workout_id = ? ORDER BY recorded_at',
      [workoutId]
    );

    const startedAt = new Date(workout.started_at);
    const finishedAt = new Date();
    const durationSeconds = Math.floor((finishedAt - startedAt) / 1000);

    const validation = validateWorkout(dbPoints, durationSeconds);

    let bonusAmount = 0;
    let finalStatus = validation.status;
    let rejectReason = validation.ok ? null : validation.reason;

    if (validation.ok) {
      const today = new Date().toISOString().slice(0, 10);
      const dailyEarned = await getDailyEarned(userId, workout.shoe_id, today);
      const shoeTotal = await getShoeTotalEarned(userId, workout.shoe_id);

      if (dailyEarned >= config.dailyBonusLimit) {
        finalStatus = 'rejected';
        rejectReason = 'Дневной лимит уже достигнут';
      } else if (shoeTotal >= config.shoeBonusLimit) {
        finalStatus = 'rejected';
        rejectReason = 'Общий лимит 200 сомони достигнут';
      } else if (workout.shoe_status === 'blocked') {
        finalStatus = 'rejected';
        rejectReason = 'Кроссовки заблокированы';
      } else {
        bonusAmount = calcBonusAmount(validation.distanceKm, dailyEarned, shoeTotal);
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
        finished_at = ?, status = ?, reject_reason = ?
       WHERE id = ?`,
      [
        validation.distanceKm ?? 0,
        durationSeconds,
        validation.avgSpeed ?? null,
        validation.maxSpeed ?? null,
        finishedAt,
        finalStatus,
        rejectReason,
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
            'UPDATE workouts SET status = ?, reject_reason = ? WHERE id = ?',
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
      `SELECT id, distance_km, duration_seconds, started_at, finished_at, status
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
