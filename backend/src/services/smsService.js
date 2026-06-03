import { randomUUID } from 'crypto';
import { config } from '../config.js';
import { normalizePhone } from '../utils/phone.js';

function smsConfigured() {
  return Boolean(config.sms.login && config.sms.token);
}

/**
 * @param {string} phone992 - 992XXXXXXXXX
 * @param {string} message
 */
export async function sendSms(phone992, message) {
  if (!smsConfigured()) {
    const err = new Error('SMS не настроен на сервере');
    err.status = 503;
    throw err;
  }

  const base = config.sms.server.replace(/\/sendsms_v1\.php$/i, '');
  const url = new URL(`${base}/sendsms_v1.php`);
  const txnId = randomUUID().replace(/-/g, '').slice(0, 24);

  url.searchParams.set('from', config.sms.sender);
  url.searchParams.set('phone_number', phone992);
  url.searchParams.set('msg', message);
  url.searchParams.set('txn_id', txnId);
  url.searchParams.set('login', config.sms.login);

  const res = await fetch(url.toString(), {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${config.sms.token}`,
      Accept: 'application/json',
    },
    signal: AbortSignal.timeout(20000),
  });

  const text = await res.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    const err = new Error('Некорректный ответ SMS-шлюза');
    err.status = 502;
    throw err;
  }

  if (!res.ok || data.error) {
    const msg = data?.error?.msg || data?.message || 'Не удалось отправить SMS';
    const err = new Error(msg);
    err.status = 502;
    throw err;
  }

  return { msg_id: data.msg_id, txn_id: txnId };
}

/** Текст SMS с хешем приложения для автоподстановки кода на Android/iOS */
export function buildOtpMessage(code) {
  const codeStr = String(code).replace(/\D/g, '').slice(0, 6);
  const hash = config.sms.appHash;
  if (hash) {
    return `<#> RunBonus: код ${codeStr}. Никому не сообщайте.\n${hash}`;
  }
  return `RunBonus: код ${codeStr}. Никому не сообщайте.`;
}

export function sendOtpSms(phoneRaw, code) {
  const phone = normalizePhone(phoneRaw);
  if (!phone) {
    const err = new Error('Неверный формат номера (пример: +992 90 123 4567)');
    err.status = 400;
    throw err;
  }
  return sendSms(phone, buildOtpMessage(code));
}

export function isSmsEnabled() {
  return smsConfigured() || (process.env.NODE_ENV !== 'production' && config.sms.devCode);
}
