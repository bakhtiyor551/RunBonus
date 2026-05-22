import { Router } from 'express';
import { authUser } from '../middleware/auth.js';
import { getUserLevelSummary } from '../services/customerLevelService.js';
import { pool } from '../db.js';

const router = Router();

router.get('/level', authUser, async (req, res) => {
  try {
    const summary = await getUserLevelSummary(req.userId);
    res.json({
      current_level: summary.current_level,
      current_level_code: summary.current_level_code,
      total_km: summary.total_km,
      next_level: summary.next_level,
      bonus_rate: summary.bonus_rate,
      progress_to_next_km: summary.progress_to_next_km,
      is_completed: summary.is_completed,
      color: summary.color,
      icon: summary.icon,
      total_bonus: summary.total_bonus,
      achievements: summary.achievements,
      all_levels: summary.all_levels,
      max_shoe_km: summary.max_shoe_km,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Ошибка загрузки уровня' });
  }
});

router.get('/level-history', authUser, async (req, res) => {
  try {
    const [shoes] = await pool.query(
      'SELECT shoe_id FROM user_active_shoes WHERE user_id = ?',
      [req.userId]
    );
    if (!shoes.length) {
      return res.json([]);
    }
    const [rows] = await pool.query(
      `SELECT ulh.id, ulh.reached_km, ulh.reached_at,
              cl.name AS level, cl.code, cl.color, cl.icon
       FROM user_level_history ulh
       JOIN customer_levels cl ON cl.id = ulh.level_id
       WHERE ulh.user_id = ? AND ulh.shoe_id = ?
       ORDER BY ulh.reached_at DESC`,
      [req.userId, shoes[0].shoe_id]
    );
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Ошибка загрузки истории уровней' });
  }
});

export default router;
