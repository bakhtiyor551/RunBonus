import { Router } from 'express';
import { pool } from '../db.js';
import { authUser, requireActiveUser } from '../middleware/auth.js';
import { requireActiveShoe } from '../middleware/requireActiveShoe.js';
import { validateWorkout } from '../services/workoutValidation.js';
import { ensureShoeProgress, applyWorkoutProgress } from '../services/shoeProgressService.js';
import { getActiveBonusSettings } from '../services/bonusSettingsService.js';
import {
  buildClientFinishResponse,
  CLIENT_START_ERRORS,
} from '../utils/clientWorkoutResponse.js';
import {
  unlockMilestonesForUser,
  notifyUserRewardUnlocked,
  getConfirmedDistanceKm,
} from '../services/rewardService.js';
import {
  unlockAchievementsForUser,
  notifyAchievementsUnlocked,
} from '../services/achievementService.js';
import { detectLevelUp } from '../services/levelService.js';
import { sendPushToUser } from '../services/pushNotificationService.js';
import {
  calcDistanceFromPoints,
  isSameCoordinates,
  normalizeGpsPoint,
} from '../utils/geo.js';
import {
  buildWorkoutLiveRow,
  calcWorkoutDistanceKm,
  closeAbandonedInProgressWorkouts,
  isPointTimestampValid,
} from '../services/liveTrackingService.js';
import {
  emitWorkoutClosed,
  emitWorkoutStarted,
} from '../services/liveTrackingWs.js';
import { saveWorkoutPoints } from '../services/workoutPointsService.js';

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
      await closeAbandonedInProgressWorkouts(conn);
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
    await closeAbandonedInProgressWorkouts(conn);

    const existing = await getInProgressWorkout(conn, req.userId);
    if (existing) {
      await conn.commit();

      const [resumeRows] = await pool.query(
        `SELECT w.id, w.user_id, u.name AS client_name, u.phone, w.started_at, w.status,
                w.steps_count, w.pause_seconds
         FROM workouts w
         JOIN users u ON u.id = w.user_id
         WHERE w.id = ?`,
        [existing.id]
      );
      const [resumePoints] = await pool.query(
        `SELECT latitude AS lat, longitude AS lng, speed, accuracy, recorded_at
         FROM workout_points WHERE workout_id = ? ORDER BY recorded_at`,
        [existing.id]
      );
      if (resumeRows[0]) {
        emitWorkoutStarted(buildWorkoutLiveRow(resumeRows[0], resumePoints));
      }

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

    const [userRows] = await conn.query(
      'SELECT name AS client_name, phone FROM users WHERE id = ?',
      [req.userId]
    );
    const user = userRows[0] || {};
    const workoutRow = buildWorkoutLiveRow(
      {
        id: result.insertId,
        user_id: req.userId,
        client_name: user.client_name,
        phone: user.phone,
        started_at: new Date(),
        status: 'in_progress',
        steps_count: 0,
        pause_seconds: 0,
      },
      []
    );
    emitWorkoutStarted(workoutRow);

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

async function savePoints(workoutId, userId, points, meta = {}) {
  const result = await saveWorkoutPoints(workoutId, userId, points, meta);
  if (!result) return null;
  if (result.fraud?.fraud) {
    await forceStopWorkoutFromService(workoutId, userId, result.fraud.reason);
    emitWorkoutClosed(workoutId, 'rejected', { reason: result.fraud.reason });
    return null;
  }
  return result.workout;
}

async function forceStopWorkoutFromService(workoutId, userId, reason) {
  const { forceStopWorkout } = await import('../services/workoutPointsService.js');
  const { sendWorkoutCommand } = await import('../services/workoutWs.js');
  await forceStopWorkout(workoutId, userId, reason);
  sendWorkoutCommand(userId, 'workout_force_stop', { message: reason, reason: 'speed_fraud' });
}

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
    let pricePerKm = 0;
    let rawCalculatedBonus = 0;
    let bonusBreakdown = null;
    let levelSnapshot = null;
    let progressKm = 0;

    // Rewards mode: no money-per-km. Approve on GPS OK; progress feeds milestones.
    let bonusAmount = 0;
    let finalStatus = validation.status;
    let rejectReason = validation.ok ? null : validation.reason;

    if (validation.ok) {
      if (workout.shoe_status === 'blocked') {
        finalStatus = 'rejected';
        rejectReason = 'Кроссовки заблокированы';
      } else {
        finalStatus = 'approved';
        progressKm = distanceKm;
        await ensureShoeProgress(conn, userId, workout.shoe_id);
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

    if (validation.ok && finalStatus === 'approved' && progressKm > 0) {
      await applyWorkoutProgress(conn, userId, workout.shoe_id, progressKm, 0);
    }

    const balanceAfter = null;

    await conn.commit();

    let unlockedRewards = [];
    let unlockedAchievements = [];
    let levelUp = null;
    if (finalStatus === 'approved') {
      try {
        const prevDistance = Math.max(
          0,
          (await getConfirmedDistanceKm(userId)) - (Number(validation.distanceKm ?? distanceKm) || 0)
        );
        const unlock = await unlockMilestonesForUser(userId);
        unlockedRewards = unlock.unlocked || [];
        notifyUserRewardUnlocked(userId, unlockedRewards);

        const ach = await unlockAchievementsForUser(userId);
        unlockedAchievements = ach.unlocked || [];
        notifyAchievementsUnlocked(userId, unlockedAchievements);

        levelUp = await detectLevelUp(prevDistance, unlock.totalDistance);
        if (levelUp) {
          sendPushToUser(userId, {
            title: '🎉 Новый уровень!',
            body: `Вы достигли Level ${levelUp.level} — ${levelUp.name}.`,
            data: {
              type: 'level_up',
              level: String(levelUp.level),
              path: '/achievements?tab=level',
            },
          }).catch(() => {});
        }
      } catch (rewErr) {
        console.warn('[workout/finish/rewards]', rewErr.message);
      }
    }

    emitWorkoutClosed(workoutId, finalStatus, {
      distance_km: validation.distanceKm ?? distanceKm,
      client_name: null,
    });

    const client = buildClientFinishResponse({
      finalStatus,
      bonusAmount,
      distanceKm: validation.distanceKm ?? distanceKm,
      durationSeconds,
      balanceAfter,
      rejectReason,
    });

    if (unlockedRewards.length) {
      client.rewards_unlocked = unlockedRewards.map((m) => ({
        id: m.id,
        distance: Number(m.distance_km),
        name: m.name,
      }));
      client.reward_popup = {
        title: 'Поздравляем!',
        message: `Вы достигли ${unlockedRewards[0].distance_km} км! Вам доступна награда`,
        milestoneId: unlockedRewards[0].id,
        distance: Number(unlockedRewards[0].distance_km),
      };
    }

    if (unlockedAchievements.length) {
      client.achievements_unlocked = unlockedAchievements.map((a) => ({
        id: a.id,
        code: a.code,
        name: a.name,
        type: a.type,
        icon: a.icon,
      }));
    }

    if (levelUp) {
      client.level_up = {
        level: levelUp.level,
        name: levelUp.name,
        icon: levelUp.icon,
        message: `Вы достигли Level ${levelUp.level} — ${levelUp.name}`,
      };
    }

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
              started_at, finished_at, status, reject_reason
       FROM workouts WHERE user_id = ? ORDER BY started_at DESC LIMIT 50`,
      [req.userId]
    );
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Ошибка загрузки истории' });
  }
});

/** Alias per TZ: GET /api/workouts */
router.get('/', authUser, async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT id, distance_km, duration_seconds, avg_speed, max_speed,
              steps_count, moving_seconds, pause_seconds,
              started_at, finished_at, status, reject_reason
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
