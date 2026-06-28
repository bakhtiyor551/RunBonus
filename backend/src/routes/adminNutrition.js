import { Router } from 'express';
import { authAdmin } from '../middleware/auth.js';
import { pool } from '../db.js';
import {
  getAdminStats,
  adminListFoods,
  adminUpsertFood,
} from '../services/nutritionService.js';
import { grantPremium, revokePremium, getSubscriptionInfo } from '../services/subscriptionService.js';

const router = Router();

router.use(authAdmin);

router.get('/stats', async (_req, res) => {
  try {
    const stats = await getAdminStats();
    res.json(stats);
  } catch (err) {
    console.error('[admin/nutrition/stats]', err);
    res.status(500).json({ error: 'Ошибка статистики' });
  }
});

router.get('/foods', async (req, res) => {
  try {
    const foods = await adminListFoods({ q: req.query.q });
    res.json({ foods });
  } catch (err) {
    res.status(500).json({ error: 'Ошибка загрузки продуктов' });
  }
});

router.post('/foods', async (req, res) => {
  try {
    const result = await adminUpsertFood(req.body);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: 'Ошибка сохранения продукта' });
  }
});

router.put('/foods/:id', async (req, res) => {
  try {
    const result = await adminUpsertFood({ ...req.body, id: Number(req.params.id) });
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: 'Ошибка обновления продукта' });
  }
});

router.get('/categories', async (_req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM food_categories ORDER BY sort_order');
    res.json({ categories: rows });
  } catch (err) {
    res.status(500).json({ error: 'Ошибка категорий' });
  }
});

router.post('/premium/grant', async (req, res) => {
  try {
    const { user_id, phone, days = 30 } = req.body;
    let userId = user_id;
    if (!userId && phone) {
      const [rows] = await pool.query('SELECT id FROM users WHERE phone = ?', [phone]);
      if (!rows.length) return res.status(404).json({ error: 'Пользователь не найден' });
      userId = rows[0].id;
    }
    if (!userId) return res.status(400).json({ error: 'Укажите user_id или phone' });
    const sub = await grantPremium(userId, { days: Number(days) || 30 });
    res.json(sub);
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message || 'Ошибка' });
  }
});

router.post('/premium/revoke', async (req, res) => {
  try {
    const { user_id, phone } = req.body;
    let userId = user_id;
    if (!userId && phone) {
      const [rows] = await pool.query('SELECT id FROM users WHERE phone = ?', [phone]);
      if (!rows.length) return res.status(404).json({ error: 'Пользователь не найден' });
      userId = rows[0].id;
    }
    if (!userId) return res.status(400).json({ error: 'Укажите user_id или phone' });
    await revokePremium(userId);
    const sub = await getSubscriptionInfo(userId);
    res.json(sub);
  } catch (err) {
    res.status(500).json({ error: 'Ошибка отзыва подписки' });
  }
});

router.get('/premium/:userId', async (req, res) => {
  try {
    const sub = await getSubscriptionInfo(Number(req.params.userId));
    res.json(sub);
  } catch (err) {
    res.status(500).json({ error: 'Ошибка' });
  }
});

export default router;
