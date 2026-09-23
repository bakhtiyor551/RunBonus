import { Router } from 'express';
import { authAdmin } from '../middleware/auth.js';
import {
  listMilestones,
  saveMilestone,
  listRewards,
  saveReward,
  setMilestoneRewards,
  getMilestoneRewardLinks,
  upsertStockVariant,
  listUserRewards,
  updateUserRewardStatus,
  adminChangeReward,
  listPromoCodes,
  getRewardsStats,
} from '../services/rewardAdminService.js';
import { unlockMilestonesForUser, syncUserTotalDistance } from '../services/rewardService.js';

const router = Router();

router.get('/stats', authAdmin, async (_req, res) => {
  try {
    res.json(await getRewardsStats());
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

router.get('/milestones', authAdmin, async (_req, res) => {
  try {
    const rows = await listMilestones();
    for (const m of rows) {
      m.linked_rewards = await getMilestoneRewardLinks(m.id);
    }
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/milestones', authAdmin, async (req, res) => {
  try {
    const id = await saveMilestone(req.body);
    if (Array.isArray(req.body.reward_ids)) {
      await setMilestoneRewards(id, req.body.reward_ids.map(Number));
    }
    res.status(201).json({ id });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

router.put('/milestones/:id', authAdmin, async (req, res) => {
  try {
    await saveMilestone(req.body, Number(req.params.id));
    if (Array.isArray(req.body.reward_ids)) {
      await setMilestoneRewards(Number(req.params.id), req.body.reward_ids.map(Number));
    }
    res.json({ ok: true });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

router.get('/catalog', authAdmin, async (_req, res) => {
  try {
    res.json(await listRewards());
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/catalog', authAdmin, async (req, res) => {
  try {
    const id = await saveReward(req.body);
    if (Array.isArray(req.body.stock_variants)) {
      for (const v of req.body.stock_variants) {
        await upsertStockVariant({
          rewardId: id,
          size: v.size || '',
          color: v.color || '',
          quantity: Number(v.quantity) || 0,
        });
      }
    }
    res.status(201).json({ id });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

router.put('/catalog/:id', authAdmin, async (req, res) => {
  try {
    const id = Number(req.params.id);
    await saveReward(req.body, id);
    if (Array.isArray(req.body.stock_variants)) {
      for (const v of req.body.stock_variants) {
        await upsertStockVariant({
          rewardId: id,
          size: v.size || '',
          color: v.color || '',
          quantity: Number(v.quantity) || 0,
        });
      }
    }
    res.json({ ok: true });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

router.put('/stock', authAdmin, async (req, res) => {
  try {
    const { reward_id, size, color, quantity } = req.body || {};
    await upsertStockVariant({
      rewardId: Number(reward_id),
      size: size || '',
      color: color || '',
      quantity: Number(quantity) || 0,
    });
    res.json({ ok: true });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

router.get('/user-rewards', authAdmin, async (req, res) => {
  try {
    res.json(await listUserRewards(req.query));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.put('/user-rewards/:id/status', authAdmin, async (req, res) => {
  try {
    const row = await updateUserRewardStatus(Number(req.params.id), req.body.status, {
      adminComment: req.body.admin_comment,
      trackingNumber: req.body.tracking_number,
    });
    res.json(row || { ok: true });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

router.put('/user-rewards/:id/change', authAdmin, async (req, res) => {
  try {
    await adminChangeReward(Number(req.params.id), {
      rewardId: Number(req.body.reward_id),
      size: req.body.size,
      comment: req.body.comment,
    });
    res.json({ ok: true });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

router.get('/promos', authAdmin, async (req, res) => {
  try {
    res.json(await listPromoCodes(req.query));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/** Recompute distance + unlock for a user (admin tool). */
router.post('/users/:userId/sync', authAdmin, async (req, res) => {
  try {
    const userId = Number(req.params.userId);
    const total = await syncUserTotalDistance(userId);
    const result = await unlockMilestonesForUser(userId);
    res.json({ totalDistance: total, ...result });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

export default router;
