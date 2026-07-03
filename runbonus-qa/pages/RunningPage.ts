import { BasePage } from './BasePage';
import { ensureWebView } from '../helpers/webviewHelper';

export class RunningPage extends BasePage {
  async waitForWorkoutScreen(): Promise<void> {
    await browser.pause(2000);
    await ensureWebView();
    const timer = await $('//*[contains(@class,"rb-workout")]');
    await timer.waitForDisplayed({ timeout: 30000 });
  }

  async isTimerRunning(): Promise<boolean> {
    await ensureWebView();
    const active = await $('//*[contains(text(),"Активна")]');
    return active.isDisplayed();
  }

  async tapPause(): Promise<void> {
    const btn = await $('button*=Пауза');
    if (await btn.isExisting()) {
      await btn.click();
      await browser.pause(1000);
    }
  }

  async tapResume(): Promise<void> {
    const btn = await $('button*=Продолжить');
    await btn.waitForClickable({ timeout: 10000 });
    await btn.click();
    await browser.pause(1000);
  }

  async isPaused(): Promise<boolean> {
    return this.isTextVisible('Пауза');
  }

  async hasGpsWarning(): Promise<boolean> {
    const err = await $('.rb-text-error');
    if (await err.isExisting()) return true;
    return this.isTextVisible('GPS');
  }

  async getDistanceText(): Promise<string> {
    await ensureWebView();
    const dist = await $('//*[contains(text(),"км") or contains(text(),"м")]');
    if (await dist.isExisting()) return dist.getText();
    return '';
  }

  async holdToFinish(): Promise<void> {
    await ensureWebView();
    const started = await driver.execute(() => {
      const btn = document.querySelector('.rb-hold-stop');
      if (!btn || btn.getAttribute('aria-disabled') === 'true') return false;
      btn.dispatchEvent(
        new TouchEvent('touchstart', { bubbles: true, cancelable: true })
      );
      return true;
    });

    if (started) {
      await browser.pause(2500);
      return;
    }

    const finish = await $('button*=Завершить');
    if (await finish.isExisting()) {
      await finish.click();
    }
  }

  async waitForResult(): Promise<void> {
    await browser.pause(3000);
    await this.waitForText('Тренировка');
  }
}

export default new RunningPage();
