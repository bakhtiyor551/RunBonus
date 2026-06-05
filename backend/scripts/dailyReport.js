#!/usr/bin/env node
/** Ежедневный отчёт в Telegram — cron: 0 8 * * * cd /var/www/RunBonus/backend && node scripts/dailyReport.js */
import 'dotenv/config';
import { buildDailyTelegramReport } from '../src/services/reportsService.js';
import { sendTelegramMessage } from '../src/services/telegramService.js';

const text = await buildDailyTelegramReport();
const id = await sendTelegramMessage(text);
if (id) {
  console.log('Daily report sent, message_id:', id);
} else {
  console.error('Failed to send daily report');
  process.exit(1);
}
