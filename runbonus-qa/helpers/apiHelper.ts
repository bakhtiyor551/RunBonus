import { config } from './config';
import { ensureWebView } from './webviewHelper';

function deviceHeaders(extra: Record<string, string> = {}): Record<string, string> {
  return {
    'X-Device-Id': config.deviceId,
    'Content-Type': 'application/json',
    ...extra,
  };
}

async function parseResponse(res: Response) {
  const text = await res.text();
  let data: Record<string, unknown> | null = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = { raw: text };
    }
  }
  if (!res.ok) {
    const err = new Error(String(data?.error || res.statusText));
    (err as Error & { status?: number; body?: unknown }).status = res.status;
    (err as Error & { body?: unknown }).body = data;
    throw err;
  }
  return data as Record<string, unknown>;
}

export async function sendSmsCode(
  phone: string,
  purpose: 'login' | 'register' = 'login'
): Promise<{ dev_code?: string; message?: string }> {
  const res = await fetch(`${config.baseApiUrl}/api/auth/sms/send`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone, purpose }),
  });
  return parseResponse(res) as { dev_code?: string; message?: string };
}

export async function loginWithSms(
  phone: string,
  code: string
): Promise<{ token: string; user?: Record<string, unknown> }> {
  const res = await fetch(`${config.baseApiUrl}/api/auth/sms/login`, {
    method: 'POST',
    headers: deviceHeaders(),
    body: JSON.stringify({ phone, code }),
  });
  const data = await parseResponse(res);
  return {
    token: String(data.token),
    user: data.user as Record<string, unknown> | undefined,
  };
}

export async function getBonusBalance(token: string): Promise<number> {
  const res = await fetch(`${config.baseApiUrl}/api/bonus/balance`, {
    headers: deviceHeaders({ Authorization: `Bearer ${token}` }),
  });
  const data = await parseResponse(res);
  return Number(data.balance) || 0;
}

export async function getUserLevel(token: string) {
  const res = await fetch(`${config.baseApiUrl}/api/me/level`, {
    headers: deviceHeaders({ Authorization: `Bearer ${token}` }),
  });
  return parseResponse(res);
}

/**
 * Код из .env (без повторной отправки SMS).
 * Для отправки: npm run auth:sms-send → обновите TEST_SMS_CODE.
 */
export async function resolveSmsCode(phone: string): Promise<string> {
  if (config.smsCode) return config.smsCode;

  const result = await sendSmsCode(phone);
  if (result.dev_code) return String(result.dev_code);

  throw new Error(
    `Укажите TEST_SMS_CODE в runbonus-qa/.env (npm run auth:sms-send)`
  );
}

export async function injectAuthToken(
  token: string,
  options?: { user?: Record<string, unknown> }
): Promise<void> {
  await ensureWebView();
  const deviceId = config.deviceId;
  const userJson = options?.user ? JSON.stringify(options.user) : '';

  await driver.execute(
    (t: string, dId: string, cachedUser: string) => {
      if (dId) localStorage.setItem('runbonus_device_id', dId);
      localStorage.setItem('token', t);
      if (cachedUser) localStorage.setItem('rb_user_cache', cachedUser);
    },
    token,
    deviceId,
    userJson
  );

  await driver.execute(() => {
    window.location.reload();
  });
  await browser.pause(4000);
}

export async function clearAuth(): Promise<void> {
  await ensureWebView();
  await driver.execute(() => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
  });
}

export async function apiLoginAndInject(): Promise<string> {
  const phone = config.phone;
  if (!phone) throw new Error('TEST_USER_PHONE не задан');

  if (config.smsCode) {
    try {
      const { token, user } = await loginWithSms(phone, config.smsCode);
      await injectAuthToken(token, { user });
      return token;
    } catch (err) {
      const msg = (err as Error).message || '';
      if (!config.userToken) {
        throw new Error(`${msg}. Обновите TEST_SMS_CODE: npm run auth:sms-send`);
      }
      /* SMS не сработал — пробуем JWT */
    }
  }

  if (config.userToken) {
    await injectAuthToken(config.userToken);
    return config.userToken;
  }

  throw new Error(
    'Укажите TEST_SMS_CODE (npm run auth:sms-send) или TEST_USER_TOKEN в .env'
  );
}
