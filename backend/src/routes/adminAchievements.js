import { Router } from 'express';
import { authAdmin } from '../middleware/auth.js';
import {
  listAchievements,
  createAchievement,
  updateAchievement,
  setAchievementActive,
} from '../services/achievementService.js';

const router = Router();

router.get('/achievements', authAdmin, async (_req, res) => {
  try {
    res.json(await listAchievements({ activeOnly: false }));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Ошибка загрузки достижений' });
  }
});

router.post('/achievements', authAdmin, async (req, res) => {
  try {
    const { code, name, type } = req.body || {};
    if (!code || !name || !type) {
      return res.status(400).json({ error: 'Укажите code, name и type' });
    }
    const row = await createAchievement(req.body);
    res.status(201).json(row);
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ error: 'Код достижения уже существует' });
    }
    console.error(err);
    res.status(500).json({ error: 'Ошибка создания достижения' });
  }
});

router.put('/achievements/:id', authAdmin, async (req, res) => {
  try {
    const row = await updateAchievement(Number(req.params.id), req.body);
    if (!row) return res.status(404).json({ error: 'Не найден' });
    res.json(row);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Ошибка сохранения' });
  }
});

router.patch('/achievements/:id/status', authAdmin, async (req, res) => {
  try {
    const active = req.body?.active !== false && req.body?.active !== 0;
    const row = await setAchievementActive(Number(req.params.id), active);
    if (!row) return res.status(404).json({ error: 'Не найден' });
    res.json(row);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Ошибка статуса' });
  }
});

export default router;
