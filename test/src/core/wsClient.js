import WebSocket from 'ws';
import { config } from '../config.js';

let ackSeq = 0;

function buildWsUrl(workoutId) {
  const params = new URLSearchParams({
    token: config.token,
    device_id: config.deviceId,
    workout_id: String(workoutId),
  });
  return `${config.wsUrl}?${params}`;
}

export class WorkoutWsClient {
  constructor(workoutId) {
    this.workoutId = workoutId;
    this.ws = null;
    this.pendingAcks = new Map();
    this.forceStopAt = null;
    this.forceStopReason = null;
    this.onCommand = null;
    this.connected = false;
  }

  connect() {
    return new Promise((resolve, reject) => {
      const socket = new WebSocket(buildWsUrl(this.workoutId));
      this.ws = socket;

      const timeout = setTimeout(() => {
        if (socket.readyState !== WebSocket.OPEN) {
          socket.terminate();
          reject(new Error('WebSocket timeout'));
        }
      }, 15000);

      socket.on('open', () => {
        clearTimeout(timeout);
        this.connected = true;
        resolve();
      });

      socket.on('message', (raw) => {
        let msg;
        try {
          msg = JSON.parse(String(raw));
        } catch {
          return;
        }

        if (msg.type === 'workout_force_stop') {
          this.forceStopAt = Date.now();
          this.forceStopReason = msg.message || msg.reason;
          this.onCommand?.(msg);
          return;
        }

        if (msg.type === 'points_ack' || msg.type === 'finish_ack') {
          const key = msg.request_id;
          if (key && this.pendingAcks.has(key)) {
            const pending = this.pendingAcks.get(key);
            clearTimeout(pending.timer);
            this.pendingAcks.delete(key);
            if (msg.ok === false) pending.reject(new Error(msg.error || 'points_rejected'));
            else pending.resolve(msg);
          }
        }
      });

      socket.on('error', (err) => {
        clearTimeout(timeout);
        reject(err);
      });

      socket.on('close', () => {
        clearTimeout(timeout);
        this.connected = false;
        for (const [, pending] of this.pendingAcks) {
          clearTimeout(pending.timer);
          pending.reject(new Error('WebSocket closed'));
        }
        this.pendingAcks.clear();
      });
    });
  }

  isOpen() {
    return this.ws?.readyState === WebSocket.OPEN;
  }

  disconnect() {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.connected = false;
  }

  async sendPoints(points, stepsCount) {
    if (!this.isOpen()) throw new Error('WebSocket не подключён');
    if (!points?.length) return { saved: 0 };

    const requestId = `pt-${++ackSeq}`;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pendingAcks.delete(requestId);
        reject(new Error('points_ack timeout'));
      }, 15000);

      this.pendingAcks.set(requestId, { resolve, reject, timer });

      this.ws.send(
        JSON.stringify({
          type: 'client_point_send',
          request_id: requestId,
          points,
          steps_count: stepsCount,
        })
      );
    });
  }

  waitForForceStop(timeoutMs = 5000) {
    if (this.forceStopAt) {
      return Promise.resolve({ reason: this.forceStopReason });
    }

    return new Promise((resolve, reject) => {
      const prev = this.onCommand;
      this.onCommand = (msg) => {
        prev?.(msg);
        if (msg.type === 'workout_force_stop') {
          clearTimeout(timer);
          resolve({ reason: this.forceStopReason });
        }
      };

      const timer = setTimeout(() => {
        this.onCommand = prev;
        reject(new Error('workout_force_stop не получен'));
      }, timeoutMs);
    });
  }
}

export function createWsClient(workoutId) {
  return new WorkoutWsClient(workoutId);
}
