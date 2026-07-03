import LoginPage from '../../pages/LoginPage';
import HomePage from '../../pages/HomePage';
import { config } from '../../helpers/config';
import { prepareAppSession } from '../../helpers/webviewHelper';
import { sendSmsCode } from '../../helpers/apiHelper';

/**
 * AUTH-сьют: SMS отправляется один раз через npm run auth:sms-send (вне теста).
 * UI переходит на OTP без повторной отправки — лимит бэкенда 1 SMS / мин.
 * Порядок: негативные кейсы на одном OTP-экране, затем успешный вход.
 */
describe('AUTH', () => {
  before(async () => {
    if (!config.phone) throw new Error('TEST_USER_PHONE не задан');
    if (!config.smsCode) {
      throw new Error(
        'Укажите TEST_SMS_CODE в runbonus-qa/.env:\n' +
          '  1) npm run auth:sms-send\n' +
          '  2) вставьте код из SMS в TEST_SMS_CODE\n' +
          '  3) npm run test:auth (в течение 10 мин)'
      );
    }

    await prepareAppSession({ clearData: true });
    await LoginPage.open('/login');
    await LoginPage.waitForLoginScreen();
    await LoginPage.enterPhone(config.phone);

    // Запись кода в БД (без UI-отправки). При лимите — код уже есть после auth:sms-send.
    try {
      const sent = await sendSmsCode(config.phone);
      if (sent.dev_code && sent.dev_code !== config.smsCode) {
        throw new Error(
          `TEST_SMS_CODE устарел. Обновите в .env:\nTEST_SMS_CODE=${sent.dev_code}`
        );
      }
    } catch (err) {
      const msg = (err as Error).message || '';
      if (!/минуту/i.test(msg)) throw err;
    }

    await LoginPage.gotoOtpStepWithoutSend(config.phone);
  });

  it('TC-AUTH-002: Неверный SMS код', async () => {
    await LoginPage.enterOtp('000000');
    await LoginPage.tapLogin();
    await browser.pause(1500);
    const err = await LoginPage.getErrorText();
    expect(err.length).toBeGreaterThan(0);
  });

  it('TC-AUTH-003: Истекший / неверный код', async () => {
    await LoginPage.enterOtp('999999');
    await LoginPage.tapLogin();
    await browser.pause(1500);
    const err = await LoginPage.getErrorText();
    expect(/истек|не найден|неверн|ошибка/i.test(err)).toBe(true);
  });

  it('TC-AUTH-001: Успешный вход по SMS', async () => {
    await LoginPage.enterOtp(config.smsCode!);
    await LoginPage.tapLogin();
    const err = await LoginPage.getErrorText();
    if (err) {
      throw new Error(`${err}. Обновите TEST_SMS_CODE: npm run auth:sms-send`);
    }
    await HomePage.waitForHome();
    expect(await HomePage.isOnHome()).toBe(true);
  });
});
