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
};
