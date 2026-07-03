#!/usr/bin/env node
/** Ежедневный AI-отчёт диетолога — cron: 0 20 * * * cd /var/www/RunBonus/backend && node scripts/nutritionCoachDaily.js */
import 'dotenv/config';
import { runDailyCoachForPremiumUsers } from '../src/services/nutritionCoachService.js';

const result = await runDailyCoachForPremiumUsers();
console.log(`[nutrition/coach] processed ${result.processed} users`);
