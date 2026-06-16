import { Router } from 'express';
import { authUser } from '../middleware/auth.js';
import { getUserSummary } from '../services/summaryService.js';

const router = Router();

router.get('/summary', authUser, async (req, res) => {
  try {
    const summary = await getUserSummary(req.userId);
    res.json(summary);
  } catch (err) {
    console.error('[user/summary]', err);
    res.status(500).json({ error: 'Ошибка загрузки сводки' });
  }
});

export default router;
