import { Router } from 'express';
import { authUser, requireActiveUser } from '../middleware/auth.js';
import {
  getUserProgress,
  getMilestoneRewardOptions,
  selectReward,
  getMyRewards,
  listActiveMilestones,
} from '../services/rewardService.js';

const router = Router();

router.get('/progress', authUser, requireActiveUser, async (req, res) => {
  try {
    const data = await getUserProgress(req.userId);
    res.json(data);
  } catch (e) {
    console.error('[rewards/progress]', e);
    res.status(500).json({ error: 'Не удалось загрузить прогресс' });
  }
});

router.get('/milestones', authUser, requireActiveUser, async (req, res) => {
  try {
    const progress = await getUserProgress(req.userId);
    res.json(progress.milestones);
  } catch (e) {
    console.error('[rewards/milestones]', e);
    try {
      const list = await listActiveMilestones();
      res.json(list);
    } catch (err) {
      res.status(500).json({ error: 'Не удалось загрузить контрольные точки' });
    }
  }
});

router.get('/milestones/:id', authUser, requireActiveUser, async (req, res) => {
  try {
    const data = await getMilestoneRewardOptions(req.userId, req.params.id);
    res.json(data);
  } catch (e) {
    const code = e.code === 'NOT_FOUND' ? 404 : 400;
    res.status(code).json({ error: e.message });
  }
});

router.get('/my', authUser, requireActiveUser, async (req, res) => {
  try {
    const items = await getMyRewards(req.userId);
    res.json(items);
  } catch (e) {
    console.error('[rewards/my]', e);
    res.status(500).json({ error: 'Не удалось загрузить награды' });
  }
});

router.post('/select', authUser, requireActiveUser, async (req, res) => {
  try {
    const { milestoneId, rewardId, size, color, phone, address, city } = req.body || {};
    if (!milestoneId || !rewardId) {
      return res.status(400).json({ error: 'Укажите milestoneId и rewardId' });
    }
    const data = await selectReward(req.userId, {
      milestoneId: Number(milestoneId),
      rewardId: Number(rewardId),
      size,
      color,
      phone,
      address,
      city,
    });
    res.json(data);
  } catch (e) {
    const map = {
      LOCKED: 403,
      ALREADY_SELECTED: 409,
      OUT_OF_STOCK: 409,
      SIZE_REQUIRED: 400,
      NO_SHOE: 403,
      BLOCKED: 403,
      NOT_FOUND: 404,
      INVALID_REWARD: 400,
    };
    const status = map[e.code] || 400;
    const raw = String(e.message || '');
    const leak = /Table |ER_|SQLSYNTAX|doesn't exist|Duplicate entry/i.test(raw);
    if (!map[e.code]) console.error('[rewards/select]', e);
    res.status(status).json({
      error: map[e.code] || !leak ? raw || 'Не удалось выбрать награду' : 'Не удалось выбрать награду',
      code: e.code,
    });
  }
});

export default router;
