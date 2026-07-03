import { BasePage } from './BasePage';
import { ensureWebView, fillInput } from '../helpers/webviewHelper';

export class ActivatePage extends BasePage {
  async openActivate(): Promise<void> {
    await browser.url('capacitor://localhost/activate');
    await browser.pause(1500);
    await this.waitForText('Сканируйте QR');
  }

  async enterManualCode(code: string): Promise<void> {
    await ensureWebView();
    const inputs = await $$('input');
    const last = inputs[inputs.length - 1];
    await last.setValue(code);
  }

  async tapActivate(): Promise<void> {
    const btn = await $('button*=Активировать');
    await btn.waitForClickable({ timeout: 10000 });
    await btn.click();
    await browser.pause(2000);
  }

  async getStatusMessage(): Promise<string> {
    await ensureWebView();
    const success = await $('//*[contains(@style,"neon") or contains(@class,"success")]');
    if (await success.isExisting()) return success.getText();
    const err = await $('.rb-text-error');
    if (await err.isExisting()) return err.getText();
    return '';
  }

  async isActivated(): Promise<boolean> {
    const msg = await this.getStatusMessage();
    return /активирован|успешно/i.test(msg);
  }

  async isAlreadyUsed(): Promise<boolean> {
    const msg = await this.getStatusMessage();
    return /уже|использован|привязан/i.test(msg);
  }
}

export default new ActivatePage();
