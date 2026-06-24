import { WebSocketServer } from 'ws';
import { attachAdminWss, handleAdminUpgrade } from './liveTrackingWs.js';
import { attachWorkoutWss, handleWorkoutUpgrade, WS_PATH as WORKOUT_WS_PATH } from './workoutWs.js';
import { WS_PATH as ADMIN_WS_PATH } from './liveTrackingWs.js';
import { config } from '../config.js';

export function initWebSockets(httpServer) {
  const adminWss = new WebSocketServer({ noServer: true });
  const workoutWss = new WebSocketServer({ noServer: true });

  attachAdminWss(adminWss);
  attachWorkoutWss(workoutWss);

  httpServer.on('upgrade', (req, socket, head) => {
    const url = new URL(req.url, `http://${req.headers.host}`);

    if (url.pathname === ADMIN_WS_PATH) {
      handleAdminUpgrade(req, socket, head, adminWss);
      return;
    }

    if (url.pathname === WORKOUT_WS_PATH) {
      handleWorkoutUpgrade(req, socket, head, workoutWss);
      return;
    }

    socket.destroy();
  });

  console.log(`WebSocket workout: ws://0.0.0.0:${config.port}${WORKOUT_WS_PATH}`);
}
