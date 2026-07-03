import { mkdirSync, writeFileSync, appendFileSync } from 'fs';
import { join } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { config } from '../config.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const LOGS_DIR = join(__dirname, '..', '..', 'logs');

let sessionLogPath = null;

export function initSessionLog() {
  mkdirSync(LOGS_DIR, { recursive: true });
  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  sessionLogPath = join(LOGS_DIR, `qa-${ts}.log`);
  appendFileSync(sessionLogPath, `RunBonus QA Bot — ${new Date().toISOString()}\n`);
  appendFileSync(sessionLogPath, `API: ${config.baseApiUrl}\n\n`);
  return sessionLogPath;
}

export function logEvent(type, data) {
  if (!sessionLogPath) initSessionLog();
  const line = JSON.stringify({ ts: new Date().toISOString(), type, ...data });
  appendFileSync(sessionLogPath, `${line}\n`);
}

export function logGps(workoutId, point, extra = {}) {
  logEvent('gps', { workoutId, point, ...extra });
}

export function logSync(workoutId, status, extra = {}) {
  logEvent('sync', { workoutId, status, ...extra });
}

export function logError(testId, error, extra = {}) {
  logEvent('error', { testId, error: String(error), ...extra });
}

export function getLogsDir() {
  return LOGS_DIR;
}
