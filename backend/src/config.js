import dotenv from 'dotenv';
dotenv.config();

export const config = {
  port: Number(process.env.PORT || 3001),
  db: {
    host: process.env.DB_HOST || 'localhost',
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER || 'runbonus',
    password: process.env.DB_PASSWORD || 'runbonus',
    database: process.env.DB_NAME || 'runbonus',
  },
  jwtSecret: process.env.JWT_SECRET || 'dev-secret',
  jwtAdminSecret: process.env.JWT_ADMIN_SECRET || 'dev-admin-secret',
  bonusPerKm: Number(process.env.BONUS_PER_KM || 3),
  dailyBonusLimit: Number(process.env.DAILY_BONUS_LIMIT || 10),
  shoeBonusLimit: Number(process.env.SHOE_BONUS_LIMIT || 200),
  telegram: {
    botToken: process.env.TELEGRAM_BOT_TOKEN || '',
    chatId: process.env.TELEGRAM_CHAT_ID || '',
  },
  /** Публичный URL API для ссылок и Telegram (например https://runbonus.online) */
  publicApiUrl: (process.env.PUBLIC_API_URL || process.env.API_PUBLIC_URL || '').replace(/\/$/, ''),
  sms: {
    login: process.env.SMS_LOGIN || '',
    token: process.env.SMS_TOKEN || '',
    sender: process.env.SMS_SENDER || 'RunBonus',
    server: (process.env.SMS_SERVER || 'https://api.osonsms.com').replace(/\/$/, ''),
    /** Если задано — SMS не отправляется, в ответе API вернётся dev_code (только NODE_ENV !== production) */
    devCode: process.env.SMS_DEV_CODE || '',
    /** 11-символьный хеш Android для автоподстановки кода (SMS Retriever) */
    appHash: (process.env.SMS_APP_HASH || '').trim(),
  },
  firebase: {
    /** JSON строка service account (FIREBASE_SERVICE_ACCOUNT_JSON) */
    serviceAccount: (() => {
      const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON?.trim();
      if (!raw) return null;
      try {
        return JSON.parse(raw);
      } catch {
        console.warn('[config] FIREBASE_SERVICE_ACCOUNT_JSON is not valid JSON');
        return null;
      }
    })(),
    /** Путь к JSON файлу service account относительно backend/ */
    serviceAccountPath: process.env.FIREBASE_SERVICE_ACCOUNT_PATH?.trim() || '',
  },
};
