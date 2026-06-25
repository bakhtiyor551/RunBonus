import { assertConfig, config } from './config.js';
import { sendSmsLoginCode } from './auth.js';
import { logFail, logInfo, logSuccess } from './logger.js';

async function main() {
  try {
    assertConfig();
  } catch (err) {
    if (!config.phone) {
      logFail(err.message);
      process.exit(1);
      return;
    }
  }

  if (!config.phone) {
    logFail('Укажите TEST_USER_PHONE в testirov/.env');
    process.exit(1);
    return;
  }

  try {
    logInfo(`Отправка SMS на ${config.phone}…`);
    const result = await sendSmsLoginCode(config.phone);
    logSuccess('Код отправлен');
    if (result.dev_code) {
      logInfo(`DEV-код (только dev-сервер): ${result.dev_code}`);
      console.log(`\nДобавьте в .env:\nTEST_SMS_CODE=${result.dev_code}`);
    } else {
      console.log('\nДобавьте в testirov/.env код из SMS:\nTEST_SMS_CODE=123456');
      console.log('Затем: npm run test:workout -- --scenario=A');
    }
  } catch (err) {
    logFail(err.message);
    if (err.body) console.error(err.body);
    process.exit(1);
  }
}

main();
