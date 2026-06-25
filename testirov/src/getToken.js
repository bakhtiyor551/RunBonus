import { writeFileSync, readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { assertConfig, config } from './config.js';
import { resolveAuthToken } from './auth.js';
import { logFail, logInfo, logSuccess } from './logger.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const envPath = join(__dirname, '..', '.env');

async function main() {
  try {
    assertConfig();
  } catch (err) {
    logFail(err.message);
    process.exit(1);
    return;
  }

  try {
    const token = await resolveAuthToken();
    logSuccess(`Токен получен (${token.slice(0, 20)}…)`);
    console.log('\nTEST_USER_TOKEN=' + token);

    if (existsSync(envPath)) {
      let env = readFileSync(envPath, 'utf8');
      if (/^TEST_USER_TOKEN=.*/m.test(env)) {
        env = env.replace(/^TEST_USER_TOKEN=.*/m, `TEST_USER_TOKEN=${token}`);
      } else {
        env += `\nTEST_USER_TOKEN=${token}\n`;
      }
      writeFileSync(envPath, env, 'utf8');
      logInfo('Записано в testirov/.env');
    }
  } catch (err) {
    logFail(err.message);
    if (err.body) console.error(err.body);
    process.exit(1);
  }
}

main();
