import jwt from 'jsonwebtoken';
import { config } from '../config.js';
import { buildLiveSnapshot } from './liveTrackingService.js';

export const WS_PATH = '/admin/live-tracking';
export const RECONNECT_HINT_MS = 5000;

let wss = null;

function sendJson(ws, payload) {
  if (ws.readyState === ws.OPEN) {
    ws.send(JSON.stringify(payload));
  }
}

function broadcast(type, data) {
  if (!wss) return;
  const message = JSON.stringify({ type, ...data });
  for (const client of wss.clients) {
    if (client.readyState === client.OPEN && client.isAdmin) {
      client.send(message);
    }
  }
}

function verifyAdminToken(token) {
  if (!token) return null;
  try {
    const payload = jwt.verify(token, config.jwtAdminSecret);
    if (!payload.adminId) return null;
    return payload;
  } catch {
    return null;
  }
}

export function attachAdminWss(server) {
  wss = server;

  wss.on('connection', async (ws) => {
    try {
      const snapshot = await buildLiveSnapshot();
      sendJson(ws, { type: 'live_snapshot', ...snapshot });
    } catch (err) {
      console.error('[live-ws] snapshot error', err.message);
      sendJson(ws, { type: 'error', message: 'Не удалось загрузить снимок' });
    }
  });

  console.log(`WebSocket live tracking: ws://0.0.0.0:${config.port}${WS_PATH}`);
}

export function handleAdminUpgrade(req, socket, head, server) {
  const url = new URL(req.url, `http://${req.headers.host}`);

  const token = url.searchParams.get('token');
  const admin = verifyAdminToken(token);
  if (!admin) {
    socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
    socket.destroy();
    return;
  }

  server.handleUpgrade(req, socket, head, (ws) => {
    ws.isAdmin = true;
    ws.adminId = admin.adminId;
    server.emit('connection', ws, req);
  });
}

export function emitLiveSnapshot() {
  buildLiveSnapshot()
    .then((snapshot) => broadcast('live_snapshot', snapshot))
    .catch((err) => console.error('[live-ws] broadcast snapshot', err.message));
}

export function emitPointReceived(workoutId, points, distanceKm, workoutMeta = {}) {
  if (!points?.length) return;
  broadcast('point_received', {
    workout_id: workoutId,
    points,
    distance_km: distanceKm,
    ...workoutMeta,
  });
}

export function emitWorkoutStarted(workout) {
  broadcast('workout_started', { workout });
}

export function emitWorkoutClosed(workoutId, status, extra = {}) {
  broadcast('workout_closed', { workout_id: workoutId, status, ...extra });
}
