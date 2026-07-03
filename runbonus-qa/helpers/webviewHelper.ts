import { config } from './config';
import { clearAppData } from './adbHelper';

const WEBVIEW_CONTEXT = 'WEBVIEW_com.runbonus.app';

/**
 * Переключение на WebView Capacitor (React-приложение).
 */
export async function switchToWebView(timeoutMs = 60000): Promise<string> {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const contexts = await driver.getContexts();
    const webview = contexts.find(
      (c) => typeof c === 'string' && c.includes('WEBVIEW')
    ) as string | undefined;

    if (webview) {
      await driver.switchContext(webview);
      await browser.pause(800);
      return webview;
    }
    await driver.pause(1000);
  }

  const contexts = await driver.getContexts();
  throw new Error(
    `WebView контекст не найден (доступно: ${contexts.join(', ')}). ` +
      'Пересоберите debug APK: cd mobile && npm run build:release'
  );
}

export async function switchToNative(): Promise<void> {
  const contexts = await driver.getContexts();
  const native = contexts.find((c) => String(c).includes('NATIVE')) as string | undefined;
  if (native) await driver.switchContext(native);
}

export async function ensureWebView(): Promise<void> {
  const current = await driver.getContext();
  if (!String(current).includes('WEBVIEW')) {
    await switchToWebView(30000);
  }
}

/** SPA-навигация без browser.url (стабильнее для Capacitor). */
export async function navigateToPath(path: string): Promise<void> {
  await ensureWebView();
  const normalized = path.startsWith('/') ? path : `/${path}`;

  await driver.execute((p) => {
    window.history.pushState({}, '', p);
    window.dispatchEvent(new PopStateEvent('popstate', { state: {} }));
  }, normalized);

  await browser.pause(2000);

  const onPage = await driver.execute((p) => window.location.pathname === p, normalized);
  if (onPage) return;

  const bases = ['http://localhost', 'https://localhost', 'capacitor://localhost'];
  for (const base of bases) {
    try {
      await browser.url(`${base}${normalized}`);
      await browser.pause(2000);
      return;
    } catch {
      /* следующий base */
    }
  }
}

/** Запуск приложения и ожидание WebView. */
export async function prepareAppSession(options?: { clearData?: boolean }): Promise<void> {
  if (options?.clearData) {
    try {
      await switchToNative();
      clearAppData();
      await driver.terminateApp(config.appPackage);
      await browser.pause(1500);
    } catch {
      /* adb / terminate может быть недоступен */
    }
  }

  try {
    await driver.activateApp(config.appPackage);
  } catch {
    /* уже запущено через app capability */
  }

  await browser.pause(options?.clearData ? 5000 : 3000);
  await switchToWebView();
  await browser.pause(1500);
}

export async function waitForText(text: string, timeoutMs = 15000): Promise<void> {
  await ensureWebView();
  const el = await $(`//*[contains(text(),"${text}")]`);
  await el.waitForDisplayed({ timeout: timeoutMs });
}

export async function isTextOnScreen(text: string, timeoutMs = 8000): Promise<boolean> {
  await ensureWebView();
  try {
    const el = await $(`//*[contains(text(),"${text}")]`);
    await el.waitForExist({ timeout: timeoutMs });
    return await el.isDisplayed();
  } catch {
    return false;
  }
}

export async function clickByText(text: string): Promise<void> {
  await ensureWebView();
  const el = await $(`//*[contains(text(),"${text}")]`);
  await el.waitForClickable({ timeout: 15000 });
  await el.click();
}

export async function fillInput(labelOrPlaceholder: string, value: string): Promise<void> {
  await ensureWebView();
  let input = await $(`[aria-label*="${labelOrPlaceholder}"]`);
  if (!(await input.isExisting())) {
    input = await $(`input[placeholder*="${labelOrPlaceholder}"]`);
  }
  if (!(await input.isExisting())) {
    input = await $('input[type="tel"], input[type="text"], input[type="number"]');
  }
  await input.waitForDisplayed({ timeout: 10000 });
  await input.clearValue();
  await input.setValue(value);
}

export async function saveScreenshotOnError(testId: string): Promise<void> {
  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  const file = `screenshots/${testId}_${ts}.png`;
  await driver.saveScreenshot(file);
}

export { WEBVIEW_CONTEXT };
