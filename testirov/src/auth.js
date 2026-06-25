import { config } from './config.js';
import { logInfo, logStep } from './logger.js';

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
 * Возвращает JWT: из TEST_USER_TOKEN, SMS-кода или пароля.
 */
export async function resolveAuthToken() {
  if (config.token) return config.token;

  const phone = config.phone;
  if (!phone) {
    throw new Error('Укажите TEST_USER_PHONE или TEST_USER_TOKEN в testirov/.env');
  }

  if (config.smsCode) {
    logInfo('Вход по SMS-коду…');
    const data = await loginWithSmsCode(phone, config.smsCode);
    logStep('SMS-вход выполнен');
    return data.token;
  }

  if (!config.password) {
    throw new Error('Заполните TEST_USER_PASSWORD или TEST_SMS_CODE в testirov/.env');
  }

  logInfo('Вход по паролю…');

  try {
    const data = await loginWithPassword(phone, config.password);
    logStep('Вход выполнен');
    return data.token;
  } catch (err) {
    if (err.status !== 401 && err.status !== 404) throw err;
  }

  logStep('Пользователь не найден — регистрация с кроссовками…');
  const data = await registerTestUser({
    phone,
    password: config.password,
    uniqueId: config.shoeCode,
  });
  logStep('Регистрация выполнена');
  return data.token;
}
