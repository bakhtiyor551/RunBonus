import { BasePage } from './BasePage';
import { ensureWebView } from '../helpers/webviewHelper';

export class HomePage extends BasePage {
  async waitForHome(): Promise<void> {
    await this.waitForText('Баланс бонусов');
  }

  async tapStartWorkout(): Promise<void> {
    await ensureWebView();
    let btn = await $('button*=Начать тренировку');
    if (!(await btn.isExisting())) {
      btn = await $('button*=Продолжить тренировку');
    }
    await btn.waitForClickable({ timeout: 15000 });
    await btn.click();
    await browser.pause(2000);
  }

  async getBalanceText(): Promise<string> {
    await ensureWebView();
    const card = await $('//*[contains(text(),"Баланс бонусов")]/..');
    return card.getText();
  }

  async isOnHome(): Promise<boolean> {
    return this.isTextVisible('Баланс бонусов');
  }
}

export default new HomePage();
