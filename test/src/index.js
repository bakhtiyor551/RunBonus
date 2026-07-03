import { assertConfig, config } from './config.js';
import { resolveAuthToken } from './bots/authBot.js';
import { logInfo, logFail, logSuite } from './core/logger.js';
import { initSessionLog } from './core/sessionLog.js';
import { runTests } from './core/testRunner.js';
import { generateReport } from './bots/reportBot.js';

import * as gpsBot from './bots/gpsBot.js';
import * as runningBot from './bots/runningBot.js';
import * as offlineBot from './bots/offlineBot.js';
import * as syncBot from './bots/syncBot.js';
import * as fraudBot from './bots/fraudBot.js';
import * as bonusBot from './bots/bonusBot.js';

const SUITES = {
  gps: { key: 'gps', name: gpsBot.suiteName, tests: gpsBot.gpsTests },
  running: { key: 'running', name: runningBot.suiteName, tests: runningBot.runningTests },
  offline: { key: 'offline', name: offlineBot.suiteName, tests: offlineBot.offlineTests },
  sync: { key: 'sync', name: syncBot.suiteName, tests: syncBot.syncTests },
  fraud: { key: 'fraud', name: fraudBot.suiteName, tests: fraudBot.fraudTests },
  bonus: { key: 'bonus', name: bonusBot.suiteName, tests: bonusBot.bonusTests },
};

function parseArgs(argv) {
  let suites = null;
  let all = false;

  for (const arg of argv) {
    if (arg === '--all' || arg === '-a') all = true;
    const m = arg.match(/^--suite=(.+)$/);
    if (m) suites = m[1].split(',').map((s) => s.trim().toLowerCase());
    if (arg === '--help' || arg === '-h') return { help: true };
  }

  if (!suites && !all) all = true;
  return { suites, all, help: false };
}

function printUsage() {
  console.log(`
RunBonus QA Bot — GPS / Бег / Offline / Антифрод / Бонусы

Использование:
  npm test                  # все сьюты
  npm run test:all
  npm run test:gps
  npm run test:running
  npm run test:offline
  npm run test:sync
  npm run test:fraud
  npm run test:bonus
  node src/index.js --suite=gps,fraud

Настройки: test/.env (см. .env.example)
`);
}

async function main() {
  const { suites, all, help } = parseArgs(process.argv.slice(2));
  if (help) {
    printUsage();
    process.exit(0);
  }

  try {
    assertConfig();
  } catch (err) {
    logFail(err.message);
    process.exit(1);
  }

  initSessionLog();
  logInfo('RunBonus QA Bot');
  logInfo(`API: ${config.baseApiUrl}`);
  logInfo(`WS:  ${config.wsUrl}`);
  logInfo(`Режим: ${config.fastMode ? 'FAST (CI)' : 'PRODUCTION'}`);

  try {
    config.token = await resolveAuthToken();
  } catch (err) {
    logFail(`Auth Bot: ${err.message}`);
    process.exit(1);
  }

  const selectedKeys = all
    ? Object.keys(SUITES)
    : (suites || []).filter((k) => SUITES[k]);

  if (!selectedKeys.length) {
    logFail('Неизвестный suite. Доступны: gps, running, offline, sync, fraud, bonus');
    process.exit(1);
  }

  const suiteResults = [];

  for (const key of selectedKeys) {
    const suite = SUITES[key];
    logSuite(suite.name);
    const results = await runTests(suite.tests, suite.name);
    suiteResults.push({ key, suiteName: suite.name, results });
  }

  const { reportText, releaseAllowed, failed } = generateReport(suiteResults);
  console.log(reportText);

  process.exit(releaseAllowed && failed === 0 ? 0 : 1);
}

main().catch((err) => {
  logFail(err.message);
  process.exit(1);
});
