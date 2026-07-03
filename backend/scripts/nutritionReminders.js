#!/usr/bin/env node
/**
 * Push-напоминания питания — cron:
 *   0 10 * * * node scripts/nutritionReminders.js breakfast
 *   0 14 * * * node scripts/nutritionReminders.js midday
 *   0 18 * * * node scripts/nutritionReminders.js protein
 */
import 'dotenv/config';
import { runNutritionReminders, slotForHour } from '../src/services/nutritionRemindersService.js';

const arg = process.argv[2];
const slot = arg || slotForHour(new Date().getHours());

if (!slot) {
  console.error('Usage: node scripts/nutritionReminders.js [breakfast|midday|protein|lunch|water]');
  process.exit(1);
}

const result = await runNutritionReminders(slot);
console.log(`[nutrition/reminders] slot=${slot}`, result);
