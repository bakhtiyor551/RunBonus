import jwt from 'jsonwebtoken';
import { config } from '../config.js';
import { pool } from '../db.js';
import { assertMatchingDevice } from './deviceBinding.js';
import { getActiveBonusFund } from './accountService.js';
import {
  forceStopWorkout,
  saveWorkoutPoints,
} from './workoutPointsService.js';
import { emitWorkoutClosed } from './liveTrackingWs.js';

export const WS_PATH = '/app/workout';

let wss = null;
/** @type {Map<number, import('ws').WebSocket>} */
const userSockets = new Map();

function sendJson(ws, payload) {
  if (ws?.readyState === ws.OPEN) {
    ws.send(JSON.stringify(payload));
  }
}

function verifyUserToken(token) {
  if (!token) return null;
  try {
    const payload = jwt.verify(token, config.jwtSecret);
    if (!payload.userId) return null;
    return payload;
  } catch {
    return null;
  }
}

export function sendWorkoutCommand(userId, type, data = {}) {
  const ws = userSockets.get(Number(userId));
  if (!ws || ws.readyState !== ws.OPEN) return false;
  sendJson(ws, { type, ...data });
  return true;
}

async function checkBonusFundAndNotify(ws) {
  if (ws.fundWarningSent) return;
  try {
    const fund = await getActiveBonusFund(pool);
    const balance = fund ? Number(fund.current_balance) : 0;
    if (balance <= 0) {
      ws.fundWarningSent = true;
      sendJson(ws, {
        type: 'fund_exhausted',
        message: 'Бонусный фонд пуст, начисление временно приостановлено',
      });
    }
  } catch (err) {
    console.error('[workout-ws] fund check', err.message);
  }
}

async function authenticateUpgrade(req, url) {
  const token = url.searchParams.get('token');
  const deviceId =
    url.searchParams.get('device_id') ||
    req.headers['x-device-id'] ||
    req.headers['X-Device-Id'];
  const workoutId = Number(url.searchParams.get('workout_id'));

  const auth = verifyUserToken(token);
  if (!auth) return { error: 'invalid_token' };

  try {
    await assertMatchingDevice(pool, auth.userId, deviceId);
  } catch (err) {
    return { error: err.code || 'device_mismatch' };
  }

  if (!workoutId) return { error: 'workout_required' };

  const [rows] = await pool.query(
    `SELECT id FROM workouts WHERE id = ? AND user_id = ? AND status = 'in_progress'`,
    [workoutId, auth.userId]
  );
  if (!rows.length) return { error: 'workout_not_active' };

  return { userId: auth.userId, workoutId, deviceId };
}

async function handleClientMessage(ws, raw) {
  let msg;
  try {
    msg = JSON.parse(raw);
  } catch {
    sendJson(ws, { type: 'error', message: 'Некорректный JSON' });
    return;
  }

  if (msg.type === 'ping') {
    sendJson(ws, { type: 'pong' });
    return;
  }

  if (msg.type === 'client_point_send') {
    const points = msg.points ?? [];
    const result = await saveWorkoutPoints(ws.workoutId, ws.userId, points, {
      steps_count: msg.steps_count,
    });

    if (!result) {
      sendJson(ws, {
        type: 'points_ack',
        ok: false,
        error: 'workout_not_active',
        request_id: msg.request_id,
      });
      return;
    }

    if (result.fraud?.fraud) {
      const reason = result.fraud.reason;
      await forceStopWorkout(ws.workoutId, ws.userId, reason);
      emitWorkoutClosed(ws.workoutId, 'rejected', { reason });
      sendJson(ws, {
        type: 'workout_force_stop',
        message: reason,
        reason: 'speed_fraud',
      });
      ws.close(4000, 'speed_fraud');
      userSockets.delete(ws.userId);
      return;
    }

    await checkBonusFundAndNotify(ws);

    sendJson(ws, {
      type: 'points_ack',
      ok: true,
      saved: result.savedPoints.length,
      distance_km: result.distanceKm,
      request_id: msg.request_id,
    });
    return;
  }

  if (msg.type === 'client_finish') {
    sendJson(ws, { type: 'finish_ack', ok: true, request_id: msg.request_id });
    ws.close(1000, 'finish');
    userSockets.delete(ws.userId);
    return;
  }

  sendJson(ws, { type: 'error', message: 'Неизвестный тип события' });
}

export function attachWorkoutWss(server) {
  wss = server;

  wss.on('connection', (ws) => {
    console.log(`[workout-ws] connected user=${ws.userId} workout=${ws.workoutId}`);
    userSockets.set(ws.userId, ws);

    sendJson(ws, {
      type: 'connected',
      workout_id: ws.workoutId,
      ok: true,
    });

    checkBonusFundAndNotify(ws).catch(() => {});

    ws.on('message', (data) => {
      handleClientMessage(ws, data.toString()).catch((err) => {
        console.error('[workout-ws] message error', err.message);
        sendJson(ws, { type: 'error', message: 'Ошибка обработки' });
      });
    });

    ws.on('close', () => {
      if (userSockets.get(ws.userId) === ws) {
        userSockets.delete(ws.userId);
      }
      console.log(`[workout-ws] disconnected user=${ws.userId}`);
    });
  });
}

export async function handleWorkoutUpgrade(req, socket, head, server) {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const auth = await authenticateUpgrade(req, url);

  if (auth.error) {
    socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
    socket.destroy();
    return;
  }

  server.handleUpgrade(req, socket, head, (ws) => {
    ws.userId = auth.userId;
    ws.workoutId = auth.workoutId;
    ws.deviceId = auth.deviceId;
    ws.fundWarningSent = false;
    ws.isWorkout = true;
    server.emit('connection', ws, req);
  });
}
