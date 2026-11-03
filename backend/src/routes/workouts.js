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
} from '../services/rewardService.js';
import { applyWorkoutToActiveChallenge, ensureChallengeForFinishedWorkout } from '../services/challengeService.js';
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
    `SELECT * FROM workouts WHERE id = ? AND user_id = ? AND status IN ('in_progress', 'paused')`,
    [workoutId, userId]
  );
  return rows[0] || null;
}

/** Закрыть только очень старые незавершённые тренировки (>24 ч) → AUTO_CLOSED. */
async function closeStaleWorkouts(conn, userId) {
  await conn.query(
    `UPDATE workouts SET
       status = 'auto_closed',
       approved_distance_km = 0,
       validation_status = 'auto_closed',
       reject_reason = 'Автоматически закрыта: более 24 часов без завершения',
       finished_at = NOW()
     WHERE user_id = ? AND status IN ('in_progress', 'paused')
       AND started_at < DATE_SUB(NOW(), INTERVAL 24 HOUR)`,
    [userId]
  );
}

async function getInProgressWorkout(conn, userId) {
  const [rows] = await conn.query(
    `SELECT id, status FROM workouts
     WHERE user_id = ? AND status IN ('in_progress', 'paused')
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
         WHERE user_id = ? AND status IN ('in_progress', 'paused')
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

/** TZ §33: GET /api/workouts/current */
router.get('/current', authUser, async (req, res) => {
  try {
    const conn = await pool.getConnection();
    try {
      await closeStaleWorkouts(conn, req.userId);
      await closeAbandonedInProgressWorkouts(conn);
      const [rows] = await conn.query(
        `SELECT id, started_at, status FROM workouts
         WHERE user_id = ? AND status IN ('in_progress', 'paused')
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

    // Задание стартуем при финише (start_at = начало этой тренировки)
    const challengeBoot = { started: false, reason: 'deferred_to_finish' };

    await conn.beginTransaction();
    await closeStaleWorkouts(conn, req.userId);
    await closeAbandonedInProgressWorkouts(conn);

    const existing = await getInProgressWorkout(conn, req.userId);
    if (existing) {
      await conn.commit();
      // TZ §28: одна активная тренировка — нельзя стартовать вторую
      return res.status(409).json({
        error: 'ACTIVE_WORKOUT_EXISTS',
        code: 'ACTIVE_WORKOUT_EXISTS',
        workoutId: existing.id,
        id: existing.id,
      });
    }

    const deviceId =
      req.body?.deviceId != null
        ? String(req.body.deviceId).slice(0, 128)
        : req.body?.device_id != null
          ? String(req.body.device_id).slice(0, 128)
          : null;

    let result;
    try {
      [result] = await conn.query(
        `INSERT INTO workouts (user_id, shoe_id, device_id, started_at, status, background_tracking)
         VALUES (?, ?, ?, NOW(), 'in_progress', TRUE)`,
        [req.userId, shoe.id, deviceId]
      );
    } catch (insertErr) {
      if (insertErr?.code === 'ER_BAD_FIELD_ERROR') {
        [result] = await conn.query(
          `INSERT INTO workouts (user_id, shoe_id, started_at, status, background_tracking)
           VALUES (?, ?, NOW(), 'in_progress', TRUE)`,
          [req.userId, shoe.id]
        );
      } else {
        throw insertErr;
      }
    }

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
      challenge: challengeBoot,
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

async function insertGpsPointsBulk(conn, workoutId, points) {
  const rows = [];
  for (const raw of points) {
    const p = normalizeGpsPoint(raw);
    if (!p) continue;
    rows.push([
      workoutId,
      p.latitude,
      p.longitude,
      p.speed,
      p.accuracy,
      p.recorded_at ? new Date(p.recorded_at) : new Date(),
    ]);
  }
  if (!rows.length) return 0;
  const placeholders = rows.map(() => '(?, ?, ?, ?, ?, ?)').join(', ');
  await conn.query(
    `INSERT INTO workout_points (workout_id, latitude, longitude, speed, accuracy, recorded_at)
     VALUES ${placeholders}`,
    rows.flat()
  );
  return rows.length;
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

/** TZ §33 Pause */
router.post('/:id/pause', authUser, async (req, res) => {
  try {
    const workout = await assertWorkoutOwner(req.params.id, req.userId);
    if (!workout) {
      return res.status(404).json({ error: 'Активная тренировка не найдена', code: 'WORKOUT_NOT_ACTIVE' });
    }
    if (workout.status === 'paused') {
      return res.json({ ok: true, status: 'paused', workoutId: workout.id });
    }
    await pool.query(
      `UPDATE workouts SET status = 'paused', paused_at = NOW() WHERE id = ? AND user_id = ?`,
      [workout.id, req.userId]
    );
    res.json({ ok: true, status: 'paused', workoutId: workout.id });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Не удалось поставить на паузу' });
  }
});

/** TZ §33 Resume */
router.post('/:id/resume', authUser, async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT * FROM workouts WHERE id = ? AND user_id = ? AND status IN ('in_progress', 'paused')`,
      [req.params.id, req.userId]
    );
    const workout = rows[0];
    if (!workout) {
      return res.status(404).json({ error: 'Активная тренировка не найдена', code: 'WORKOUT_NOT_ACTIVE' });
    }
    await pool.query(
      `UPDATE workouts SET status = 'in_progress', paused_at = NULL WHERE id = ? AND user_id = ?`,
      [workout.id, req.userId]
    );
    res.json({ ok: true, status: 'in_progress', workoutId: workout.id });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Не удалось продолжить тренировку' });
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

    if (workout.status !== 'in_progress' && workout.status !== 'paused') {
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
      const toSave = [];
      for (const raw of batch) {
        const p = normalizeGpsPoint(raw);
        if (!p) continue;
        if (last && isSameCoordinates(last, p)) continue;
        toSave.push(p);
        last = p;
      }
      if (toSave.length) {
        await insertGpsPointsBulk(conn, workoutId, toSave);
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
    // Mark processing while validating (source of truth on server)
    await conn.query(`UPDATE workouts SET status = 'processing' WHERE id = ? AND status IN ('in_progress', 'paused')`, [
      workoutId,
    ]);

    let validation = validateWorkout(dbPoints, durationSeconds, settings);

    let clientTrackDistance = 0;
    if (clientPoints?.length) {
      const batch = Array.isArray(clientPoints) ? clientPoints : [clientPoints];
      clientTrackDistance = calcDistanceFromPoints(
        batch.map(normalizeGpsPoint).filter(Boolean)
      );
    }
    const clientDistanceKm = Number(clientMeta.distance_km);

    // Official distance = server GPS track only (client distance is never trusted as approved)
    let distanceKm = validation.distanceKm ?? calcDistanceFromPoints(dbPoints) ?? 0;
    if (distanceKm < 0.001 && clientTrackDistance > 0) {
      // fallback display only if server track empty — still subject to validation status
      distanceKm = clientTrackDistance;
      if (validation.ok) {
        validation = { ...validation, distanceKm, approvedDistanceKm: 0, ok: false, status: 'suspicious', reason: 'Недостаточно серверных GPS-точек', reasons: ['GPS_GAP'] };
      }
    }
    void clientDistanceKm;

    let pricePerKm = 0;
    let rawCalculatedBonus = 0;
    let bonusBreakdown = null;
    let levelSnapshot = null;
    let progressKm = 0;

    let bonusAmount = 0;
    let finalStatus = validation.status || 'rejected';
    let rejectReason = validation.ok ? null : validation.reason;
    let approvedDistanceKm = 0;

    if (validation.ok && validation.status === 'approved') {
      if (workout.shoe_status === 'blocked') {
        finalStatus = 'rejected';
        rejectReason = 'Кроссовки заблокированы';
        approvedDistanceKm = 0;
      } else {
        finalStatus = 'approved';
        approvedDistanceKm = Number(validation.approvedDistanceKm ?? distanceKm) || 0;
        progressKm = approvedDistanceKm;
        await ensureShoeProgress(conn, userId, workout.shoe_id);
      }
    } else if (finalStatus === 'suspicious') {
      approvedDistanceKm = 0;
      progressKm = 0;
    } else {
      finalStatus = 'rejected';
      approvedDistanceKm = 0;
      progressKm = 0;
    }

    const avgPace =
      approvedDistanceKm > 0 && durationSeconds > 0
        ? durationSeconds / approvedDistanceKm
        : null;

    const validationReasonsJson = validation.reasons?.length
      ? JSON.stringify(validation.reasons)
      : null;

    await conn.query(
      `UPDATE workouts SET
        distance_km = ?, approved_distance_km = ?, duration_seconds = ?,
        active_duration_seconds = ?, avg_speed = ?, max_speed = ?, avg_pace = ?,
        gps_points_count = ?,
        steps_count = ?, moving_seconds = ?, pause_seconds = ?,
        finished_at = ?, status = ?, reject_reason = ?,
        validation_status = ?, validation_score = ?, validation_reasons = ?,
        price_per_km = ?, calculated_bonus = ?,
        level_snapshot = ?, bonus_breakdown = ?
       WHERE id = ?`,
      [
        distanceKm,
        approvedDistanceKm,
        durationSeconds,
        movingSeconds ?? durationSeconds,
        validation.avgSpeed ?? null,
        validation.maxSpeed ?? null,
        avgPace,
        dbPoints.length,
        stepsCount,
        movingSeconds,
        pauseSeconds,
        finishedAt,
        finalStatus,
        rejectReason,
        finalStatus,
        validation.score ?? null,
        validationReasonsJson,
        pricePerKm,
        rawCalculatedBonus,
        levelSnapshot ? JSON.stringify(levelSnapshot) : null,
        bonusBreakdown ? JSON.stringify(bonusBreakdown) : null,
        workoutId,
      ]
    );

    if (finalStatus === 'approved' && progressKm > 0) {
      await applyWorkoutProgress(conn, userId, workout.shoe_id, progressKm, 0);
    }

    const balanceAfter = null;

    await conn.commit();

    let unlockedRewards = [];
    let challengeUpdate = null;
    // TZ: only APPROVED KM → challenge
    if (finalStatus === 'approved') {
      try {
        await ensureChallengeForFinishedWorkout(userId, workout.started_at);
        challengeUpdate = await applyWorkoutToActiveChallenge(userId, {
          distanceKm: approvedDistanceKm,
          finishedAt,
        });
      } catch (chErr) {
        console.warn('[workout/finish/challenge]', chErr.message);
      }
      if (!challengeUpdate) {
        try {
          const { getChallengeState } = await import('../services/challengeService.js');
          const state = await getChallengeState(userId);
          challengeUpdate = state?.challenge || null;
        } catch {
          /* optional */
        }
      }
      try {
        const unlock = await unlockMilestonesForUser(userId);
        unlockedRewards = unlock.unlocked || [];
        notifyUserRewardUnlocked(userId, unlockedRewards);
      } catch (rewErr) {
        console.warn('[workout/finish/rewards]', rewErr.message);
      }
    } else {
      try {
        const { getChallengeState } = await import('../services/challengeService.js');
        const state = await getChallengeState(userId);
        challengeUpdate = state?.challenge || null;
      } catch {
        /* optional */
      }
    }

    emitWorkoutClosed(workoutId, finalStatus, {
      distance_km: distanceKm,
      approved_distance_km: approvedDistanceKm,
      client_name: null,
    });

    const client = buildClientFinishResponse({
      finalStatus,
      bonusAmount,
      distanceKm,
      approvedDistanceKm,
      durationSeconds,
      balanceAfter,
      rejectReason,
      validationReasons: validation.reasons,
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

    if (challengeUpdate) {
      client.challenge = challengeUpdate;
      if (challengeUpdate.status === 'COMPLETED') {
        client.challenge_completed = true;
        client.challenge_popup = {
          title: 'Задание выполнено!',
          message: `${challengeUpdate.currentKm} / ${challengeUpdate.targetKm} KM`,
          challengeId: challengeUpdate.id,
        };
      }
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
