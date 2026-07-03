import { config } from '../config.js';
import { logInfo, logStep } from '../core/logger.js';

function deviceHeaders() {
  return {
    'X-Device-Id': config.deviceId,
    'Content-Type': 'application/json',
  };
}

async function parseResponse(res) {
  const text = await res.text();
  let data = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = { raw: text };
    }
  }
  if (!res.ok) {
    const err = new Error(data?.error || res.statusText);
    err.status = res.status;
    err.body = data;
    throw err;
  }
  return data;
}

export async function loginWithPassword(phone, password) {
  const res = await fetch(`${config.baseApiUrl}/api/auth/login`, {
    method: 'POST',
    headers: deviceHeaders(),
    body: JSON.stringify({ phone, password }),
  });
  return parseResponse(res);
}

export async function sendSmsLoginCode(phone) {
  const res = await fetch(`${config.baseApiUrl}/api/auth/sms/send`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone, purpose: 'login' }),
  });
  return parseResponse(res);
}

export async function loginWithSmsCode(phone, code) {
  const res = await fetch(`${config.baseApiUrl}/api/auth/sms/login`, {
    method: 'POST',
    headers: deviceHeaders(),
    body: JSON.stringify({ phone, code }),
  });
  return parseResponse(res);
}

export async function registerTestUser({ phone, password, uniqueId }) {
  const res = await fetch(`${config.baseApiUrl}/api/auth/register`, {
    method: 'POST',
    headers: deviceHeaders(),
    body: JSON.stringify({
      firstName: 'Test',
      lastName: 'Runner',
      phone,
      password,
      city: 'Душанбе',
      unique_id: uniqueId,
    }),
  });
  return parseResponse(res);
}

/**
 * Auth Bot — получение JWT.
 * При наличии телефона/пароля всегда выполняет вход (привязка TEST_DEVICE_ID).
 */
export async function resolveAuthToken(options = {}) {
  const phone = options.phone ?? config.phone;
  const password = options.password ?? config.password;
  const smsCode = options.smsCode ?? config.smsCode;
  const shoeCode = options.shoeCode ?? config.shoeCode;
  const registerShoe = options.registerShoe !== false;

  if (phone && (password || smsCode)) {
    if (smsCode) {
      logInfo('Auth Bot: вход по SMS…');
      const data = await loginWithSmsCode(phone, smsCode);
      logStep('SMS-вход выполнен');
      return data.token;
    }

    logInfo(`Auth Bot: вход ${phone}…`);
    try {
      const data = await loginWithPassword(phone, password);
      logStep('Вход выполнен (device привязан)');
      return data.token;
    } catch (err) {
      if (err.status !== 401 && err.status !== 404) throw err;
      if (!registerShoe) throw err;
      logStep('Регистрация с обувью…');
      const data = await registerTestUser({ phone, password, uniqueId: shoeCode });
      return data.token;
    }
  }

  const tokenOverride = options.token ?? config.token;
  if (tokenOverride) return tokenOverride;

  if (!phone) throw new Error('Укажите TEST_USER_PHONE или TEST_USER_TOKEN');
  throw new Error('Укажите TEST_USER_PASSWORD или TEST_SMS_CODE');
}
