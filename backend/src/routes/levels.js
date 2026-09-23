import { Router } from 'express';
import { authUser } from '../middleware/auth.js';
import { getMyLevel } from '../services/levelService.js';

const router = Router();

router.get('/me', authUser, async (req, res) => {
  try {
    const data = await getMyLevel(req.userId);
    res.json(data);
  } catch (err) {
    console.error('[levels/me]', err);
    res.status(500).json({ error: 'Ошибка загрузки уровня' });
  }
});

export default router;
