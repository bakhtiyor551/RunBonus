import { mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SCREENSHOTS_DIR = join(__dirname, '..', '..', 'screenshots');

/**
 * Screenshot Bot — сохраняет артефакты при ошибках
 * (скриншот UI недоступен в CLI; сохраняем JSON-снимок состояния).
 */
export function saveErrorArtifact(testId, payload) {
  mkdirSync(SCREENSHOTS_DIR, { recursive: true });
  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  const filename = `${testId}_${ts}.json`;
  const filepath = join(SCREENSHOTS_DIR, filename);

  const artifact = {
    testId,
    timestamp: new Date().toISOString(),
    ...payload,
  };

  writeFileSync(filepath, JSON.stringify(artifact, null, 2), 'utf8');
  return filepath;
}

export function getScreenshotsDir() {
  return SCREENSHOTS_DIR;
}
