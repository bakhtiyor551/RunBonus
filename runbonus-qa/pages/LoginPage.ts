import { BasePage } from './BasePage';
import { ensureWebView, fillInput, isTextOnScreen } from '../helpers/webviewHelper';

export class LoginPage extends BasePage {
  async waitForLoginScreen(): Promise<void> {
    await this.waitForText('Бегай. Зарабатывай.');
  }

  async isOnOtpStep(): Promise<boolean> {
    if (await isTextOnScreen('Код отправлен', 2000)) return true;
    const otp = await $('[aria-label="Код из SMS"]');
    return otp.isExisting();
  }

  async enterPhone(phone: string): Promise<void> {
    await ensureWebView();
    if (await this.isOnOtpStep()) {
      const back = await $('button[aria-label="Назад"]');
      if (await back.isExisting()) {
        await back.click();
        await browser.pause(800);
      }
    }
    const local = phone.replace('+992', '');
    const inputs = await $$('input');
    if (inputs.length) {
      await driver.execute((val) => {
        const input = document.querySelector('input[type="tel"], input');
        if (!input) return;
        const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
        setter?.call(input, val);
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));
      }, local);
      await browser.pause(300);
      return;
    }
    await fillInput('Телефон', phone);
  }

  /**
   * OTP-экран без API-запроса (код уже в TEST_SMS_CODE после npm run auth:sms-send).
   * Требует debug APK с window.__rbE2EGotoOtp в LoginPage.
   */
  async gotoOtpStepWithoutSend(phone: string): Promise<void> {
    if (await this.isOnOtpStep()) return;

    await ensureWebView();
    const deadline = Date.now() + 15000;
    while (Date.now() < deadline) {
      const ok = await driver.execute((p) => {
        const fn = (window as unknown as { __rbE2EGotoOtp?: (phone?: string) => boolean })
          .__rbE2EGotoOtp;
        return typeof fn === 'function' && fn(p);
      }, phone);
      if (ok) {
        await browser.pause(800);
        return;
      }
      await browser.pause(500);
    }

    throw new Error(
      'Не удалось открыть шаг OTP без SMS. Пересоберите APK (cd mobile && npm run build:release) ' +
        'или подождите 60 сек и используйте requestSmsCodeOnce()'
    );
  }

  /** Одна отправка SMS на сьют — не жмёт повторно, если уже на шаге OTP. */
  async requestSmsCodeOnce(): Promise<void> {
    if (await this.isOnOtpStep()) return;

    const getCode = await $('button*=Получить код');
    if (await getCode.isExisting()) {
      await getCode.waitForClickable({ timeout: 10000 });
      await getCode.click();
      await browser.pause(1500);
      return;
    }

    const resend = await $('button*=Отправить код снова');
    if (await resend.isExisting() && (await resend.isEnabled())) {
      await resend.click();
      await browser.pause(1500);
    }
  }

  async tapGetCode(): Promise<void> {
    await this.requestSmsCodeOnce();
  }

  async enterOtp(code: string): Promise<void> {
    await ensureWebView();
    const otpInput = await $('[aria-label="Код из SMS"]');
    if (await otpInput.isExisting()) {
      await otpInput.clearValue();
      await otpInput.setValue(code);
      return;
    }
    const inputs = await $$('input');
    for (const input of inputs) {
      const type = await input.getAttribute('type');
      if (type === 'tel' || type === 'text' || type === 'number') {
        await input.clearValue();
        await input.setValue(code);
        return;
      }
    }
  }

  async tapLogin(): Promise<void> {
    const btn = await $('button*=Войти');
    await btn.waitForClickable({ timeout: 10000 });
    await btn.click();
    await browser.pause(2000);
  }

  async loginWithSms(phone: string, code: string): Promise<void> {
    await this.waitForLoginScreen();
    await this.enterPhone(phone);
    await this.requestSmsCodeOnce();
    await browser.pause(1500);
    await this.enterOtp(code);
    await this.tapLogin();
  }

  async getErrorText(): Promise<string> {
    await ensureWebView();
    const err = await $('.rb-text-error');
    if (await err.isExisting()) return err.getText();
    return '';
  }
}

export default new LoginPage();
