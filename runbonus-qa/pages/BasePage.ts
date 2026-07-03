import { navigateToPath, ensureWebView } from '../helpers/webviewHelper';

export class BasePage {
  async open(path = '/'): Promise<void> {
    await navigateToPath(path);
    await ensureWebView();
  }

  async tapNav(label: string): Promise<void> {
    await ensureWebView();
    const link = await $(`//*[contains(@class,"rb-bottom-nav")]//*[contains(text(),"${label}")]`);
    await link.waitForClickable({ timeout: 10000 });
    await link.click();
    await browser.pause(800);
  }

  async isTextVisible(text: string): Promise<boolean> {
    const { isTextOnScreen } = await import('../helpers/webviewHelper');
    return isTextOnScreen(text);
  }

  async waitForText(text: string, timeout = 15000): Promise<void> {
    const { waitForText: wait } = await import('../helpers/webviewHelper');
    await wait(text, timeout);
  }
}
