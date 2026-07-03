import { assertConfig, config } from './config.js';
import { resolveAuthToken } from './bots/authBot.js';
import { logInfo, logSuccess } from './core/logger.js';

async function main() {
  assertConfig();
  const token = await resolveAuthToken();
  logInfo(`Token получен (${token.slice(0, 20)}…)`);
  logSuccess('Скопируйте в test/.env:\nTEST_USER_TOKEN=' + token);
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
