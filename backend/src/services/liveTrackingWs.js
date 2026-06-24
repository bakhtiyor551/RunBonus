import { WebSocketServer } from 'ws';
import jwt from 'jsonwebtoken';
import { config } from '../config.js';
import { buildLiveSnapshot } from './liveTrackingService.js';

const WS_PATH = '/admin/live-tracking';
const RECONNECT_HINT_MS = 5000;

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

/**
 * @param {import('http').Server} httpServer
 */
export function initLiveTrackingWs(httpServer) {
  wss = new WebSocketServer({ noServer: true });

  httpServer.on('upgrade', (req, socket, head) => {
    const url = new URL(req.url, `http://${req.headers.host}`);
    if (url.pathname !== WS_PATH) {
      socket.destroy();
      return;
    }

    const token = url.searchParams.get('token');
    const admin = verifyAdminToken(token);
    if (!admin) {
      socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
      socket.destroy();
      return;
    }

    wss.handleUpgrade(req, socket, head, (ws) => {
      ws.isAdmin = true;
      ws.adminId = admin.adminId;
      wss.emit('connection', ws, req);
    });
  });

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
  return wss;
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

export { WS_PATH, RECONNECT_HINT_MS };
