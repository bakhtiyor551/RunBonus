import { logFail, logStep, logSuccess } from './logger.js';
import { logError } from './sessionLog.js';
import { saveErrorArtifact } from '../bots/screenshotBot.js';
import { cleanupActiveWorkout } from './workoutHelper.js';

/**
 * Test Runner — выполняет массив тестов и собирает результаты.
 */
export async function runTests(tests, suiteName) {
  const results = [];

  for (const test of tests) {
    const started = Date.now();
    const entry = {
      id: test.id,
      name: test.name,
      suite: suiteName,
      pass: false,
      error: null,
      durationMs: 0,
      artifact: null,
    };

    try {
      logStep(`${test.id}: ${test.name}`);
      await cleanupActiveWorkout();
      await test.run();
      entry.pass = true;
      entry.durationMs = Date.now() - started;
      logSuccess(`${test.id} — OK (${entry.durationMs} мс)`);
    } catch (err) {
      entry.pass = false;
      entry.error = err.message || String(err);
      entry.durationMs = Date.now() - started;
      entry.artifact = saveErrorArtifact(test.id, {
        suite: suiteName,
        error: entry.error,
        apiResponse: err.body ?? null,
        stack: err.stack,
      });
      logError(test.id, entry.error, { artifact: entry.artifact });
      logFail(`${test.id} — ${entry.error}`);
    }

    results.push(entry);
  }

  return results;
}

export function defineTest(id, name, run) {
  return { id, name, run };
}
