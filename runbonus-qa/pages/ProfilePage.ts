import { BasePage } from './BasePage';
import { ensureWebView } from '../helpers/webviewHelper';

export class ProfilePage extends BasePage {
  async openProfile(): Promise<void> {
    await this.tapNav('Профиль');
    await browser.pause(1000);
  }

  async tapEdit(): Promise<void> {
    const btn = await $('button*=Редактировать');
    if (await btn.isExisting()) {
      await btn.click();
      return;
    }
    const alt = await $('button*=Изменить');
    await alt.click();
  }

  async fillProfile(data: {
    firstName?: string;
    lastName?: string;
  }): Promise<void> {
    await ensureWebView();
    const inputs = await $$('input[type="text"]');
    if (data.firstName && inputs[0]) {
      await inputs[0].clearValue();
      await inputs[0].setValue(data.firstName);
    }
    if (data.lastName && inputs[1]) {
      await inputs[1].clearValue();
      await inputs[1].setValue(data.lastName);
    }
  }

  async saveProfile(): Promise<void> {
    const btn = await $('button*=Сохранить');
    await btn.waitForClickable({ timeout: 10000 });
    await btn.click();
    await browser.pause(2000);
  }

  async getDisplayedName(): Promise<string> {
    await ensureWebView();
    const h = await $('h1, h2, .rb-profile-name');
    if (await h.isExisting()) return h.getText();
    return '';
  }
}

export default new ProfilePage();
