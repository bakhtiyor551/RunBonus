import { Router } from 'express';
import { authUser } from '../middleware/auth.js';
import {
  getAchievementsCatalog,
  getMyAchievements,
} from '../services/achievementService.js';

const router = Router();

router.get('/', authUser, async (_req, res) => {
  try {
    const achievements = await getAchievementsCatalog();
    res.json(achievements);
  } catch (err) {
    console.error('[achievements]', err);
    res.status(500).json({ error: 'Ошибка загрузки достижений' });
  }
});

router.get('/me', authUser, async (req, res) => {
  try {
    const data = await getMyAchievements(req.userId);
    res.json(data);
  } catch (err) {
    console.error('[achievements/me]', err);
    res.status(500).json({ error: 'Ошибка загрузки моих достижений' });
  }
});

export default router;
