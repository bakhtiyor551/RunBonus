import { Router } from 'express';
import { authUser, requireActiveUser } from '../middleware/auth.js';
import { requirePremium } from '../middleware/requirePremium.js';
import { config } from '../config.js';
import { isPremiumActive } from '../services/subscriptionService.js';
import { analyzeFoodPhoto } from '../services/nutritionAiService.js';
import {
  getDailyStats,
  getWeekStats,
  getChartData,
  getHistory,
  addLogEntry,
  deleteLogEntry,
  searchFoods,
  getFavorites,
  toggleFavorite,
  getRecommendations,
  getAnalytics,
  upsertNutritionProfile,
} from '../services/nutritionService.js';

const router = Router();

async function premiumGate(req, res, next) {
  if (config.nutritionDevFree) return next();
  return requirePremium(req, res, next);
}

router.get('/status', authUser, requireActiveUser, async (req, res) => {
  try {
    const is_premium = config.nutritionDevFree || (await isPremiumActive(req.userId));
    res.json({ is_premium, plan: is_premium ? 'runbonus_plus' : null });
  } catch (err) {
    console.error('[nutrition/status]', err);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

router.use(authUser, requireActiveUser, premiumGate);

router.get('/today', async (req, res) => {
  try {
    const stats = await getDailyStats(req.userId);
    res.json(stats);
  } catch (err) {
    console.error('[nutrition/today]', err);
    res.status(err.status || 500).json({ error: err.message || 'Ошибка загрузки' });
  }
});

router.get('/day', async (req, res) => {
  try {
    const stats = await getDailyStats(req.userId);
    res.json(stats);
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message || 'Ошибка' });
  }
});

router.get('/week', async (req, res) => {
  try {
    const data = await getWeekStats(req.userId);
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: 'Ошибка загрузки недели' });
  }
});

router.get('/chart', async (req, res) => {
  try {
    const period = req.query.period === 'month' ? 'month' : 'week';
    const data = await getChartData(req.userId, period);
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: 'Ошибка загрузки графика' });
  }
});

router.get('/history', async (req, res) => {
  try {
    const items = await getHistory(req.userId, {
      date: req.query.date || null,
      limit: req.query.limit,
    });
    res.json({ items });
  } catch (err) {
    res.status(500).json({ error: 'Ошибка загрузки истории' });
  }
});

router.get('/foods/search', async (req, res) => {
  try {
    const foods = await searchFoods(req.query.q, { country: req.query.country });
    res.json({ foods });
  } catch (err) {
    res.status(500).json({ error: 'Ошибка поиска' });
  }
});

router.get('/favorites', async (req, res) => {
  try {
    const favorites = await getFavorites(req.userId);
    res.json({ favorites });
  } catch (err) {
    res.status(500).json({ error: 'Ошибка загрузки избранного' });
  }
});

router.post('/favorites/:foodId', async (req, res) => {
  try {
    const result = await toggleFavorite(req.userId, Number(req.params.foodId));
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: 'Ошибка избранного' });
  }
});

router.get('/recommendations', async (req, res) => {
  try {
    const data = await getRecommendations(req.userId);
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: 'Ошибка рекомендаций' });
  }
});

router.get('/analytics', async (req, res) => {
  try {
    const data = await getAnalytics(req.userId);
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: 'Ошибка аналитики' });
  }
});

router.get('/profile', async (req, res) => {
  try {
    const stats = await getDailyStats(req.userId);
    res.json({ profile: stats.profile, goals: stats.macros_goal, daily_goal: stats.daily_goal });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message || 'Ошибка' });
  }
});

router.put('/profile', async (req, res) => {
  try {
    const profile = await upsertNutritionProfile(req.userId, req.body);
    res.json({ profile });
  } catch (err) {
    res.status(500).json({ error: 'Не удалось сохранить профиль' });
  }
});

router.post('/photo', async (req, res) => {
  try {
    const photo = req.body.photo_base64 ?? req.body.photo ?? req.body.image;
    if (!photo) {
      return res.status(400).json({ error: 'Загрузите фото' });
    }
    const result = await analyzeFoodPhoto(req.userId, photo);
    res.json(result);
  } catch (err) {
    console.error('[nutrition/photo]', err);
    res.status(err.status || 500).json({ error: err.message || 'Ошибка анализа фото' });
  }
});

router.post('/', async (req, res) => {
  try {
    const entry = await addLogEntry(req.userId, req.body);
    res.status(201).json(entry);
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message || 'Не удалось добавить запись' });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const ok = await deleteLogEntry(req.userId, Number(req.params.id));
    if (!ok) return res.status(404).json({ error: 'Запись не найдена' });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Ошибка удаления' });
  }
});

export default router;
