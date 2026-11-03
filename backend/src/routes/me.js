import { Router } from 'express';
import { authUser } from '../middleware/auth.js';
import { getUserProgress } from '../services/rewardService.js';
import { pool } from '../db.js';

const router = Router();

/** Dashboard: профиль + прогресс наград (GET /api/me). */
router.get('/', authUser, async (req, res) => {
  try {
    const [[user]] = await pool.query(
      `SELECT id, name, first_name, last_name, phone, city, avatar_url, total_distance_km, status
       FROM users WHERE id = ?`,
      [req.userId]
    );
    if (!user) return res.status(404).json({ error: 'Не найден' });

    let progress = null;
    try {
      progress = await getUserProgress(req.userId);
    } catch (e) {
      console.warn('[me] rewards progress', e.message);
    }

    const confirmed =
      progress?.totalDistance != null
        ? progress.totalDistance
        : Number(user.total_distance_km) || 0;

    res.json({
      id: user.id,
      name: user.name,
      first_name: user.first_name,
      last_name: user.last_name,
      phone: user.phone,
      email: null,
      city: user.city,
      avatar_url: user.avatar_url,
      total_confirmed_distance: confirmed,
      rewards: progress,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Ошибка загрузки профиля' });
  }
});

export default router;
