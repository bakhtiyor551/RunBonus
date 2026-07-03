import { assertConfig, config } from './config.js';
import { sendSmsLoginCode } from './bots/authBot.js';
import { logFail, logInfo, logSuccess } from './core/logger.js';

async function main() {
  try {
    assertConfig();
  } catch (err) {
    if (!config.phone) {
      logFail(err.message);
      process.exit(1);
    }
  }

  if (!config.phone) {
    logFail('Укажите TEST_USER_PHONE в test/.env');
    process.exit(1);
  }

  try {
    logInfo(`Отправка SMS на ${config.phone}…`);
    const result = await sendSmsLoginCode(config.phone);
    logSuccess('Код отправлен');
    if (result.dev_code) {
      logInfo(`DEV-код: ${result.dev_code}`);
      console.log(`\nДобавьте в test/.env:\nTEST_SMS_CODE=${result.dev_code}`);
    } else {
      console.log('\nДобавьте в test/.env код из SMS:\nTEST_SMS_CODE=123456');
    }
  } catch (err) {
    logFail(err.message);
    if (err.body) console.error(err.body);
    process.exit(1);
  }
}

main();
