import { API_URL } from '../api';
import { getDeviceId } from './deviceId';

const WS_PATH = '/app/workout';
const RECONNECT_MS = 4000;
const ACK_TIMEOUT_MS = 15000;

function getToken() {
  return localStorage.getItem('token');
}

function buildWsUrl(workoutId) {
  const token = getToken();
  const deviceId = getDeviceId();
  const base = (API_URL || window.location.origin).replace(/\/$/, '');
  const wsBase = base.replace(/^http/i, (m) => (m.toLowerCase() === 'https' ? 'wss' : 'ws'));
  const params = new URLSearchParams({
    token: token || '',
    device_id: deviceId || '',
    workout_id: String(workoutId),
  });
  return `${wsBase}${WS_PATH}?${params}`;
}

let ws = null;
let workoutId = null;
let reconnectTimer = null;
let intentionalClose = false;
let onCommand = null;
let onStatusChange = null;
/** @type {Map<string, { resolve, reject, timer }>} */
const pendingAcks = new Map();
let ackSeq = 0;

function setStatus(status) {
  onStatusChange?.(status);
}

function rejectAllPending(err) {
  for (const [, pending] of pendingAcks) {
    clearTimeout(pending.timer);
    pending.reject(err);
  }
  pendingAcks.clear();
}

function handleMessage(ev) {
  let msg;
  try {
    msg = JSON.parse(ev.data);
  } catch {
    return;
  }

  if (msg.type === 'points_ack' || msg.type === 'finish_ack') {
    const key = msg.request_id;
    if (key && pendingAcks.has(key)) {
      const pending = pendingAcks.get(key);
      clearTimeout(pending.timer);
      pendingAcks.delete(key);
      if (msg.ok === false) pending.reject(new Error(msg.error || 'points_rejected'));
      else pending.resolve(msg);
    }
    return;
  }

  if (msg.type === 'fund_exhausted' || msg.type === 'workout_force_stop') {
    onCommand?.(msg);
    return;
  }

  if (msg.type === 'connected') {
    setStatus('connected');
  }
}

function scheduleReconnect() {
  if (intentionalClose || !workoutId) return;
  setStatus('reconnecting');
  clearTimeout(reconnectTimer);
  reconnectTimer = setTimeout(() => {
    connectWorkoutSocket(workoutId, { onCommand, onStatusChange }).catch(() => {});
  }, RECONNECT_MS);
}

export function connectWorkoutSocket(id, handlers = {}) {
  workoutId = Number(id);
  onCommand = handlers.onCommand ?? onCommand;
  onStatusChange = handlers.onStatusChange ?? onStatusChange;
  intentionalClose = false;

  if (ws?.readyState === WebSocket.OPEN && ws.workoutId === workoutId) {
    setStatus('connected');
    return Promise.resolve();
  }

  if (ws) {
    ws.onclose = null;
    ws.close();
    ws = null;
  }

  return new Promise((resolve, reject) => {
    const token = getToken();
    if (!token) {
      reject(new Error('Нет токена авторизации'));
      return;
    }

    setStatus('connecting');
    const socket = new WebSocket(buildWsUrl(workoutId));
    ws = socket;
    ws.workoutId = workoutId;

    const connectTimeout = setTimeout(() => {
      if (socket.readyState !== WebSocket.OPEN) {
        socket.close();
        reject(new Error('WebSocket timeout'));
      }
    }, ACK_TIMEOUT_MS);

    socket.onopen = () => {
      clearTimeout(connectTimeout);
      setStatus('connected');
      resolve();
    };

    socket.onmessage = handleMessage;

    socket.onerror = () => {
      clearTimeout(connectTimeout);
      setStatus('error');
    };

    socket.onclose = () => {
      clearTimeout(connectTimeout);
      if (ws === socket) ws = null;
      rejectAllPending(new Error('WebSocket closed'));
      if (!intentionalClose) scheduleReconnect();
    };
  });
}

export function isWorkoutSocketOpen() {
  return ws?.readyState === WebSocket.OPEN;
}

/**
 * @returns {Promise<{ saved: number }>}
 */
export function sendWorkoutPoints(points, stepsCount) {
  return new Promise((resolve, reject) => {
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      reject(new Error('WebSocket не подключён'));
      return;
    }
    if (!points?.length) {
      resolve({ saved: 0 });
      return;
    }

    const requestId = `pt-${++ackSeq}`;
    const timer = setTimeout(() => {
      pendingAcks.delete(requestId);
      reject(new Error('points_ack timeout'));
    }, ACK_TIMEOUT_MS);

    pendingAcks.set(requestId, { resolve, reject, timer });

    ws.send(
      JSON.stringify({
        type: 'client_point_send',
        request_id: requestId,
        points,
        steps_count: stepsCount,
      })
    );
  });
}

export function sendWorkoutFinishAck() {
  return new Promise((resolve, reject) => {
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      resolve();
      return;
    }

    const requestId = `fin-${++ackSeq}`;
    const timer = setTimeout(() => {
      pendingAcks.delete(requestId);
      resolve();
    }, ACK_TIMEOUT_MS);

    pendingAcks.set(requestId, {
      resolve: () => resolve(),
      reject,
      timer,
    });

    ws.send(JSON.stringify({ type: 'client_finish', request_id: requestId }));
  });
}

export async function disconnectWorkoutSocket() {
  intentionalClose = true;
  clearTimeout(reconnectTimer);
  rejectAllPending(new Error('disconnect'));

  if (ws?.readyState === WebSocket.OPEN) {
    try {
      await sendWorkoutFinishAck();
    } catch {
      /* ignore */
    }
  }

  if (ws) {
    ws.onclose = null;
    ws.close();
    ws = null;
  }

  workoutId = null;
  setStatus('idle');
}

export function getWorkoutSocketStatus() {
  if (!ws) return 'idle';
  if (ws.readyState === WebSocket.OPEN) return 'connected';
  if (ws.readyState === WebSocket.CONNECTING) return 'connecting';
  return 'closed';
}
