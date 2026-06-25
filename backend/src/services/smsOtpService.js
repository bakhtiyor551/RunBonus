import crypto from 'crypto';
import { pool } from '../db.js';
import { config } from '../config.js';
import { normalizePhone } from '../utils/phone.js';
import { sendOtpSms, isSmsEnabled } from './smsService.js';

const CODE_TTL_MS = 10 * 60 * 1000;
const RESEND_COOLDOWN_MS = 60 * 1000;
const MAX_ATTEMPTS = 5;

let tableReady = null;

async function ensureTable() {
  if (tableReady) return tableReady;
  tableReady = (async () => {
    try {
      await pool.query(`SELECT 1 FROM sms_verification_codes LIMIT 1`);
    } catch (err) {
      if (err.code !== 'ER_NO_SUCH_TABLE') throw err;
      await pool.query(`
        CREATE TABLE sms_verification_codes (
          id BIGINT AUTO_INCREMENT PRIMARY KEY,
          phone VARCHAR(20) NOT NULL,
          code_hash VARCHAR(64) NOT NULL,
          purpose ENUM('register', 'login') NOT NULL,
          expires_at DATETIME NOT NULL,
          attempts INT NOT NULL DEFAULT 0,
          created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
          KEY idx_sms_phone_purpose (phone, purpose),
          KEY idx_sms_expires (expires_at)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
      `);
    }
    return true;
  })();
  return tableReady;
}

function getFixedTestCode(phone) {
  const t = config.sms.testOtp;
  if (t && phone === t.phone) return t.code;
  return null;
}

function generateCode(phone) {
  const fixed = getFixedTestCode(phone);
  if (fixed) return fixed;
  if (process.env.NODE_ENV !== 'production' && config.sms.devCode) {
    return String(config.sms.devCode).replace(/\D/g, '').slice(0, 6).padStart(6, '0');
  }
  return String(crypto.randomInt(100000, 999999));
}

function hashCode(code) {
  return crypto.createHash('sha256').update(String(code)).digest('hex');
}

async function cleanupExpired() {
  await pool.query(`DELETE FROM sms_verification_codes WHERE expires_at < NOW()`);
}

export async function sendVerificationCode(phoneRaw, purpose) {
  await ensureTable();
  if (!['register', 'login'].includes(purpose)) {
    const err = new Error('Неверный тип запроса');
    err.status = 400;
    throw err;
  }

  const phone = normalizePhone(phoneRaw);
  if (!phone) {
    const err = new Error('Неверный формат номера');
    err.status = 400;
    throw err;
  }

  if (!isSmsEnabled()) {
    const err = new Error('SMS-авторизация не настроена');
    err.status = 503;
    throw err;
  }

  const [users] = await pool.query(`SELECT id, status FROM users WHERE phone = ?`, [phone]);
  const userExists = users.length > 0;

  if (purpose === 'register' && userExists) {
    const err = new Error('Номер уже зарегистрирован. Войдите по SMS.');
    err.status = 409;
    throw err;
  }
  if (purpose === 'login' && !userExists) {
    const err = new Error('Номер не найден. Создайте аккаунт.');
    err.status = 404;
    throw err;
  }
  if (purpose === 'login' && users[0]?.status === 'blocked') {
    const err = new Error('Аккаунт заблокирован');
    err.status = 403;
    throw err;
  }

  await cleanupExpired();

  const [recent] = await pool.query(
    `SELECT created_at FROM sms_verification_codes
     WHERE phone = ? AND purpose = ?
     ORDER BY id DESC LIMIT 1`,
    [phone, purpose]
  );
  if (recent.length) {
    const last = new Date(recent[0].created_at).getTime();
    if (Date.now() - last < RESEND_COOLDOWN_MS) {
      const err = new Error('Подождите минуту перед повторной отправкой');
      err.status = 429;
      throw err;
    }
  }

  await pool.query(`DELETE FROM sms_verification_codes WHERE phone = ? AND purpose = ?`, [
    phone,
    purpose,
  ]);

  const code = generateCode(phone);
  const expiresAt = new Date(Date.now() + CODE_TTL_MS);

  await pool.query(
    `INSERT INTO sms_verification_codes (phone, code_hash, purpose, expires_at) VALUES (?, ?, ?, ?)`,
    [phone, hashCode(code), purpose, expiresAt]
  );

  const isTestPhone = Boolean(getFixedTestCode(phone));
  const devMode = process.env.NODE_ENV !== 'production' && config.sms.devCode;
  if (!devMode && !isTestPhone) {
    await sendOtpSms(phone, code);
  }

  const payload = {
    message: isTestPhone ? 'Тестовый код (SMS не отправляется)' : 'Код отправлен на ваш номер',
    phone,
    expires_in: Math.floor(CODE_TTL_MS / 1000),
  };
  if (devMode || isTestPhone) {
    payload.dev_code = code;
  }
  return payload;
}

export async function verifyCode(phoneRaw, purpose, code) {
  await ensureTable();
  const phone = normalizePhone(phoneRaw);
  if (!phone) {
    const err = new Error('Неверный формат номера');
    err.status = 400;
    throw err;
  }
  const codeStr = String(code || '').replace(/\D/g, '');
  if (codeStr.length !== 6) {
    const err = new Error('Введите 6-значный код');
    err.status = 400;
    throw err;
  }

  const [rows] = await pool.query(
    `SELECT * FROM sms_verification_codes
     WHERE phone = ? AND purpose = ?
     ORDER BY id DESC LIMIT 1`,
    [phone, purpose]
  );
  if (!rows.length) {
    const err = new Error('Код не найден. Запросите новый.');
    err.status = 400;
    throw err;
  }

  const row = rows[0];
  if (new Date(row.expires_at) < new Date()) {
    const err = new Error('Код истёк. Запросите новый.');
    err.status = 400;
    throw err;
  }

  if (row.attempts >= MAX_ATTEMPTS) {
    const err = new Error('Слишком много попыток. Запросите новый код.');
    err.status = 400;
    throw err;
  }

  const ok = hashCode(codeStr) === row.code_hash;
  if (!ok) {
    await pool.query(`UPDATE sms_verification_codes SET attempts = attempts + 1 WHERE id = ?`, [
      row.id,
    ]);
    const err = new Error('Неверный код');
    err.status = 400;
    throw err;
  }

  await pool.query(`DELETE FROM sms_verification_codes WHERE id = ?`, [row.id]);
  return phone;
}
