import net from 'net';
import { pool } from '../db.js';
import { config } from '../config.js';
import { summarizeHealth } from './healthPayload.js';

export { summarizeHealth };

async function pingDatabase() {
  try {
    await pool.query('SELECT 1');
    return 'ok';
  } catch {
    return 'error';
  }
}

export function pingRedis(redisUrl = config.redisUrl, timeoutMs = 2000) {
  return new Promise((resolve) => {
    if (!redisUrl) {
      resolve('skipped');
      return;
    }
    let parsed;
    try {
      parsed = new URL(redisUrl);
    } catch {
      resolve('error');
      return;
    }
    const host = parsed.hostname;
    const port = Number(parsed.port || 6379);
    const socket = net.connect({ host, port });
    const timer = setTimeout(() => {
      socket.destroy();
      resolve('error');
    }, timeoutMs);
    socket.on('connect', () => {
      socket.write('PING\r\n');
    });
    socket.on('data', (buf) => {
      clearTimeout(timer);
      socket.end();
      resolve(String(buf).includes('PONG') ? 'ok' : 'error');
    });
    socket.on('error', () => {
      clearTimeout(timer);
      resolve('error');
    });
  });
}

export async function checkHealth() {
  const [database, redis] = await Promise.all([pingDatabase(), pingRedis()]);
  return summarizeHealth({ database, redis });
}
