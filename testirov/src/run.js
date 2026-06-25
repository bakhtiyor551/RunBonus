import { assertConfig, config } from './config.js';
import { resolveAuthToken } from './auth.js';
import { logFail, logInfo } from './logger.js';
import { runScenarioA } from './scenarios/scenarioA.js';
import { runScenarioB } from './scenarios/scenarioB.js';
import { runScenarioC } from './scenarios/scenarioC.js';

function parseScenario(argv) {
  for (const arg of argv) {
    const m = arg.match(/^--scenario=([ABCabc])$/);
    if (m) return m[1].toUpperCase();
    if (arg === '--scenario' || arg === '-s') {
      const next = argv[argv.indexOf(arg) + 1];
      if (next) return next.toUpperCase();
    }
  }
  return null;
}

function printUsage() {
  console.log(`
RunBonus — тест WebSocket-транспорта и антифрода

Использование:
  npm run test:workout -- --scenario=A
  npm run test:workout -- --scenario=B
  npm run test:workout -- --scenario=C

Настройки: testirov/.env (см. .env.example)
  BASE_API_URL=${config.baseApiUrl}
  WS_URL=${config.wsUrl}
`);
}

async function main() {
  const scenario = parseScenario(process.argv.slice(2));

  if (!scenario || !['A', 'B', 'C'].includes(scenario)) {
    printUsage();
    process.exit(scenario ? 1 : 0);
    return;
  }

  try {
    assertConfig();
  } catch (err) {
    logFail(err.message);
    process.exit(1);
    return;
  }

  logInfo(`API: ${config.baseApiUrl}`);
  logInfo(`WS:  ${config.wsUrl}`);

  try {
    config.token = await resolveAuthToken();
  } catch (err) {
    logFail(err.message);
    process.exit(1);
    return;
  }

  try {
    if (scenario === 'A') await runScenarioA();
    else if (scenario === 'B') await runScenarioB();
    else if (scenario === 'C') await runScenarioC();
  } catch (err) {
    logFail(`Сценарий ${scenario}: ${err.message}`);
    if (err.body) console.error(err.body);
    process.exit(1);
  }
}

main();
