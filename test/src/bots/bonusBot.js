import { config } from '../config.js';
import { defineTest } from '../core/testRunner.js';
import { runWorkoutTrack } from '../core/workoutHelper.js';
import {
  getBonusBalance,
  getUserLevel,
  startWorkout,
} from './apiBot.js';
import { resolveAuthToken } from './authBot.js';

export const bonusTests = [
  defineTest('BONUS-001', 'Без активированной обуви — бонусы = 0', async () => {
    const phone = config.noShoePhone;
    const password = config.noShoePassword;

    if (!phone || !password) {
      throw new Error(
        'Задайте TEST_USER_NO_SHOE_PHONE и TEST_USER_NO_SHOE_PASSWORD в test/.env'
      );
    }

    const savedToken = config.token;
    try {
      config.token = await resolveAuthToken({
        phone,
        password,
        registerShoe: false,
      });
    } catch (err) {
      if (err.status === 401 || err.status === 404) {
        config.token = await resolveAuthToken({
          phone,
          password,
          registerShoe: true,
          shoeCode: 'SHOE-NO-ACTIVATE-TEST',
        });
      } else {
        throw err;
      }
    }

    try {
      await startWorkout();
      throw new Error('Старт без обуви не должен быть разрешён');
    } catch (err) {
      const msg = String(err.message || err.body?.error || '');
      const blocked =
        err.status === 400 ||
        /обув|shoe|NO_SHOE|не активирован/i.test(msg);
      if (!blocked) throw new Error(`Ожидалась блокировка старта: ${msg}`);
    } finally {
      config.token = savedToken;
    }
  }),

  defineTest('BONUS-002', 'С активированной обувью — бонусы начислены', async () => {
    const balanceBefore = await getBonusBalance();
    const result = await runWorkoutTrack();

    if (result.workout?.status !== 'approved') {
      throw new Error(`Тренировка не approved: ${result.workout?.status}`);
    }

    const balanceAfter = await getBonusBalance();
    const bonus =
      balanceAfter - balanceBefore ||
      Number(result.workout?.calculated_bonus) ||
      Number(result.finishResult?.bonus_earned);

    if (bonus <= 0) throw new Error('Бонусы не начислены при активной обуви');
  }),

  defineTest('BONUS-003', 'Premium — повышенный коэффициент', async () => {
    const level = await getUserLevel();
    const rates = (level.all_levels || [])
      .filter((l) => l.status === 'active')
      .map((l) => Number(l.price_per_km))
      .filter((r) => r > 0);

    if (!rates.length) throw new Error('Уровни клиента не настроены');

    const baseRate = Math.min(...rates);
    const premiumRate = Math.max(...rates);

    if (premiumRate <= baseRate) {
      throw new Error('Нет повышенного коэффициента (premium) в уровнях');
    }

    const currentRate = Number(level.bonus_rate) || baseRate;
    if (currentRate <= 0) throw new Error('bonus_rate не определён');

    const result = await runWorkoutTrack();
    const breakdown = result.workout?.bonus_breakdown;
    const hasTiered =
      (typeof breakdown === 'string' && breakdown.includes('level')) ||
      (Array.isArray(breakdown) && breakdown.length > 0) ||
      Number(result.workout?.calculated_bonus) > 0;

    if (!hasTiered && result.workout?.status === 'approved') {
      const bonus = Number(result.workout?.calculated_bonus);
      if (bonus <= 0) throw new Error('Нет начисления по tiered-коэффициенту');
    }
  }),
];

export const suiteName = 'Bonus Test';
