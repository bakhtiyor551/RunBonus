import { Router } from 'express';
import { pool } from '../db.js';
import { authUser, requireActiveUser } from '../middleware/auth.js';
import { requireActiveShoe } from '../middleware/requireActiveShoe.js';
import { validateWorkout } from '../services/workoutValidation.js';
import { getDailyEarned, calcBonusAmount, calcRawBonus, applyBonus } from '../services/bonusService.js';
import {
  getActiveCustomerLevels,
  ensureShoeProgress,
  calcTieredBonus,
  capBonusByRemaining,
  applyWorkoutProgress,
  getLevelForKm,
  getMaxShoeKmFromLevels,
} from '../services/customerLevelService.js';
import { getActiveBonusSettings } from '../services/bonusSettingsService.js';
import { getActiveBonusFund } from '../services/accountService.js';
import {
  buildClientFinishResponse,
  CLIENT_START_ERRORS,
} from '../utils/clientWorkoutResponse.js';
import {
  calcDistanceFromPoints,
  isSameCoordinates,
  normalizeGpsPoint,
  shouldSaveGpsPoint,
} from '../utils/geo.js';

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

router.get('/active', authUser, async (req, res) => {
  try {
    const conn = await pool.getConnection();
    try {
      await closeStaleWorkouts(conn, req.userId);
      const [rows] = await conn.query(
        `SELECT id, started_at, status FROM workouts
         WHERE user_id = ? AND status = 'in_progress'
         ORDER BY started_at DESC LIMIT 1`,
        [req.userId]
      );
      if (!rows.length) {
        return res.json({ active: false, workoutId: null, id: null });
      }
      res.json({
        active: true,
        workoutId: rows[0].id,
        id: rows[0].id,
        started_at: rows[0].started_at,
        status: rows[0].status,
      });
    } finally {
      conn.release();
    }
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Ошибка загрузки активной тренировки' });
  }
});

router.post('/start', authUser, requireActiveUser, requireActiveShoe, async (req, res) => {
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

async function finishWorkout(workoutId, userId, clientPoints, clientMeta = {}) {
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
      const [any] = await conn.query(
        'SELECT id, status FROM workouts WHERE id = ? AND user_id = ?',
        [workoutId, userId]
      );
      await conn.rollback();
      if (any.length) {
        return {
          status: 400,
          body: {
            error: 'Эта тренировка уже завершена. Начните новую с главного экрана.',
            code: 'WORKOUT_NOT_ACTIVE',
            workout_id: any[0].id,
            status: any[0].status,
          },
        };
      }
      return { status: 404, body: { error: 'Тренировка не найдена' } };
    }

    const workout = workouts[0];

    if (workout.status !== 'in_progress') {
      await conn.rollback();
      return {
        status: 400,
        body: {
          error: 'Эта тренировка уже завершена. Начните новую с главного экрана.',
          code: 'WORKOUT_NOT_ACTIVE',
          workout_id: workout.id,
          status: workout.status,
        },
      };
    }

    if (clientPoints?.length) {
      let last = await getLastWorkoutPoint(workoutId, conn);
      const batch = Array.isArray(clientPoints) ? clientPoints : [clientPoints];
      for (const raw of batch) {
        const p = normalizeGpsPoint(raw);
        if (!p) continue;
        if (last && isSameCoordinates(last, p)) continue;
        const saved = await insertGpsPoint(conn, workoutId, p);
        if (saved) last = p;
      }
    }

    const [dbPoints] = await conn.query(
      'SELECT latitude, longitude, speed, accuracy, recorded_at FROM workout_points WHERE workout_id = ? ORDER BY recorded_at',
      [workoutId]
    );

    const startedAt = new Date(workout.started_at);
    const finishedAt = new Date();
    const serverDuration = Math.floor((finishedAt - startedAt) / 1000);
    const clientDuration = Number(clientMeta.duration_seconds);
    const durationSeconds =
      clientDuration > 0 ? Math.floor(clientDuration) : serverDuration;
    const stepsCount =
      clientMeta.steps_count != null ? Math.max(0, Math.floor(Number(clientMeta.steps_count))) : null;
    const movingSeconds =
      clientMeta.moving_seconds != null
        ? Math.max(0, Math.floor(Number(clientMeta.moving_seconds)))
        : null;
    const pauseSeconds =
      clientMeta.pause_seconds != null
        ? Math.max(0, Math.floor(Number(clientMeta.pause_seconds)))
        : null;

    const settings = await getActiveBonusSettings(conn);
    let validation = validateWorkout(dbPoints, durationSeconds, settings);

    let clientTrackDistance = 0;
    if (clientPoints?.length) {
      const batch = Array.isArray(clientPoints) ? clientPoints : [clientPoints];
      clientTrackDistance = calcDistanceFromPoints(
        batch.map(normalizeGpsPoint).filter(Boolean)
      );
    }
    const clientDistanceKm = Number(clientMeta.distance_km);

    let distanceKm = validation.distanceKm ?? 0;
    if (distanceKm < 0.001 && clientTrackDistance > distanceKm) {
      distanceKm = clientTrackDistance;
    }
    if (distanceKm < 0.001 && clientDistanceKm > 0) {
      distanceKm = clientDistanceKm;
    }

    const minDurationSec = (settings?.min_duration_minutes ?? 5) * 60;
    const minDistanceKm = settings?.min_distance_km ?? 0.5;

    if (!validation.ok && validation.reason?.includes('GPS')) {
      if (durationSeconds >= minDurationSec && distanceKm >= minDistanceKm) {
        const avgSpeed =
          durationSeconds > 0 ? (distanceKm / durationSeconds) * 3600 : 0;
        validation = {
          ok: true,
          status: 'approved',
          distanceKm,
          avgSpeed,
          maxSpeed: validation.maxSpeed ?? 0,
        };
      } else {
        validation = {
          ...validation,
          distanceKm,
          reason:
            durationSeconds < minDurationSec
              ? `Минимум ${settings?.min_duration_minutes ?? 5} мин (сейчас ${Math.floor(durationSeconds / 60)} мин)`
              : `Минимум ${minDistanceKm} км (сейчас ${distanceKm.toFixed(2)} км)`,
        };
      }
    }
    const customerLevels = await getActiveCustomerLevels(conn);
    let pricePerKm = settings.price_per_km;
    let rawCalculatedBonus = 0;
    let bonusBreakdown = null;
    let levelSnapshot = null;
    let levelUp = null;
    let progressKm = 0;

    let bonusAmount = 0;
    let finalStatus = validation.status;
    let rejectReason = validation.ok ? null : validation.reason;

    if (validation.ok) {
      const today = new Date().toISOString().slice(0, 10);
      const dailyEarned = await getDailyEarned(userId, workout.shoe_id, today);

      if (workout.shoe_status === 'blocked') {
        finalStatus = 'rejected';
        rejectReason = 'Кроссовки заблокированы';
      } else if (customerLevels.length) {
        const progress = await ensureShoeProgress(conn, userId, workout.shoe_id);
        const kmBefore = Number(progress.total_km) || 0;

        const maxShoeKm = getMaxShoeKmFromLevels(customerLevels);
        if (progress.is_completed || kmBefore >= maxShoeKm) {
          finalStatus = 'rejected';
          rejectReason = 'Лимит километража по этой паре кроссовок достигнут';
        } else {
          const tiered = calcTieredBonus(kmBefore, distanceKm, customerLevels);
          rawCalculatedBonus = tiered.bonus;
          bonusBreakdown = tiered.breakdown;
          progressKm = tiered.effectiveKm;
          const { level } = getLevelForKm(kmBefore, customerLevels);
          levelSnapshot = {
            km_before: kmBefore,
            km_after: tiered.kmAfter,
            current_level: level?.name ?? null,
            current_level_code: level?.code ?? null,
          };
          pricePerKm =
            progressKm > 0
              ? Math.round((rawCalculatedBonus / progressKm) * 100) / 100
              : level?.price_per_km ?? 0;

          if (dailyEarned >= settings.daily_limit) {
            finalStatus = 'rejected';
            rejectReason = 'Дневной лимит уже достигнут';
            bonusAmount = 0;
          } else {
            bonusAmount = capBonusByRemaining(
              tiered.bonus,
              progress,
              dailyEarned,
              settings.daily_limit
            );

            if (bonusAmount <= 0) {
              finalStatus = 'rejected';
              rejectReason =
                tiered.bonus <= 0
                  ? 'Бонус не начисляется для этого километража'
                  : 'Лимит бонусов исчерпан';
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
      } else if (dailyEarned >= settings.daily_limit) {
        finalStatus = 'rejected';
        rejectReason = 'Дневной лимит уже достигнут';
      } else {
        rawCalculatedBonus = calcRawBonus(distanceKm, pricePerKm);
        bonusAmount = calcBonusAmount(distanceKm, dailyEarned, 0, settings);
        progressKm = distanceKm;
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
        steps_count = ?, moving_seconds = ?, pause_seconds = ?,
        finished_at = ?, status = ?, reject_reason = ?,
        price_per_km = ?, calculated_bonus = ?,
        level_snapshot = ?, bonus_breakdown = ?
       WHERE id = ?`,
      [
        distanceKm,
        durationSeconds,
        validation.avgSpeed ?? null,
        validation.maxSpeed ?? null,
        stepsCount,
        movingSeconds,
        pauseSeconds,
        finishedAt,
        finalStatus,
        rejectReason,
        pricePerKm,
        rawCalculatedBonus,
        levelSnapshot ? JSON.stringify(levelSnapshot) : null,
        bonusBreakdown ? JSON.stringify(bonusBreakdown) : null,
        workoutId,
      ]
    );

    if (validation.ok && customerLevels.length && progressKm > 0) {
      const progressResult = await applyWorkoutProgress(
        conn,
        userId,
        workout.shoe_id,
        progressKm,
        finalStatus === 'approved' ? bonusAmount : 0
      );
      if (progressResult.newLevels?.length) {
        const top = progressResult.newLevels[progressResult.newLevels.length - 1];
        levelUp = {
          level: top.name,
          message: `Поздравляем! Вы перешли на уровень ${top.name}`,
        };
      } else if (progressResult.completed) {
        levelUp = {
          level: 'completed',
          message: 'Вы достигли максимального километража по этой паре кроссовок',
        };
      }
    }

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
      distanceKm: validation.distanceKm ?? distanceKm,
      durationSeconds,
      balanceAfter,
      rejectReason,
      levelUp,
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
    const result = await finishWorkout(workout_id, req.userId, req.body.points, req.body);
    res.status(result.status).json(result.body);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Ошибка завершения тренировки' });
  }
});

router.post('/:id/finish', authUser, async (req, res) => {
  try {
    const result = await finishWorkout(req.params.id, req.userId, req.body.points, req.body);
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
              steps_count, moving_seconds, pause_seconds,
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

router.get('/:id/points', authUser, async (req, res) => {
  try {
    const workoutId = Number(req.params.id);
    const [workouts] = await pool.query(
      'SELECT id FROM workouts WHERE id = ? AND user_id = ?',
      [workoutId, req.userId]
    );
    if (!workouts.length) {
      return res.status(404).json({ error: 'Тренировка не найдена' });
    }
    const [rows] = await pool.query(
      `SELECT latitude, longitude, speed, accuracy, recorded_at
       FROM workout_points WHERE workout_id = ? ORDER BY recorded_at`,
      [workoutId]
    );
    res.json({ points: rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Ошибка загрузки маршрута' });
  }
});

export default router;
