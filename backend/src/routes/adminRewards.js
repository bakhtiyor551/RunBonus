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
import { unlockMilestonesForUser, syncUserTotalDistance, adminGiftReward } from '../services/rewardService.js';
import { normalizePhone } from '../utils/phone.js';
import { pool } from '../db.js';

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

/** Gift milestone / concrete reward to a user by phone (no km check). */
router.post('/gift', authAdmin, async (req, res) => {
  try {
    const { phone, user_id, milestone_id, reward_id, size, color, comment } = req.body || {};
    let userId = user_id ? Number(user_id) : null;

    if (!userId) {
      const phoneNorm = normalizePhone(phone) || String(phone || '').replace(/\D/g, '');
      if (!phoneNorm) {
        return res.status(400).json({ error: 'Укажите телефон клиента или user_id' });
      }
      const variants = [
        phoneNorm,
        phoneNorm.startsWith('992') ? phoneNorm : `992${phoneNorm}`,
        phoneNorm.startsWith('992') ? phoneNorm.slice(3) : phoneNorm,
      ];
      const [rows] = await pool.query(
        `SELECT id, name, phone FROM users WHERE phone IN (?, ?, ?) LIMIT 1`,
        variants
      );
      if (!rows.length) {
        return res.status(404).json({ error: 'Клиент с таким телефоном не найден' });
      }
      userId = rows[0].id;
    }

    if (!milestone_id) {
      return res.status(400).json({ error: 'Укажите контрольную точку (milestone_id)' });
    }

    const result = await adminGiftReward({
      userId,
      milestoneId: Number(milestone_id),
      rewardId: reward_id ? Number(reward_id) : null,
      size: size || null,
      color: color || null,
      comment: comment || null,
    });
    res.status(201).json(result);
  } catch (e) {
    console.error('[rewards/gift]', e);
    res.status(e.code === 'NOT_FOUND' ? 404 : 400).json({ error: e.message });
  }
});

export default router;
