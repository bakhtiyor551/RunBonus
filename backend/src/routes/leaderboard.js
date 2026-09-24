import { Router } from 'express';
import { authUser } from '../middleware/auth.js';
import { pool } from '../db.js';
import { normalizeAvatarUrl } from '../utils/userProfile.js';

const router = Router();

/** Имя клиента или null, если не задано. */
function displayName(row) {
  const full = [row.first_name, row.last_name]
    .map((s) => String(s || '').trim())
    .filter(Boolean)
    .join(' ');
  const name = full || String(row.name || '').trim();
  return name || null;
}

/** Топ клиентов по подтверждённым км (approved workouts). */
router.get('/', authUser, async (req, res) => {
  try {
    const limit = Math.min(50, Math.max(1, Number(req.query.limit) || 20));

    const [rows] = await pool.query(
      `SELECT u.id,
              u.name,
              u.first_name,
              u.last_name,
              u.avatar_url,
              COALESCE(SUM(w.distance_km), 0) AS total_km
       FROM users u
       INNER JOIN workouts w ON w.user_id = u.id AND w.status = 'approved'
       WHERE u.status = 'active'
       GROUP BY u.id, u.name, u.first_name, u.last_name, u.avatar_url
       ORDER BY total_km DESC, u.id ASC
       LIMIT ?`,
      [limit]
    );

    const items = rows.map((r, i) => {
      const name = displayName(r);
      return {
        rank: i + 1,
        id: r.id,
        clientId: r.id,
        name,
        label: name || String(r.id),
        avatar_url: normalizeAvatarUrl(r.avatar_url),
        totalKm: Math.round(Number(r.total_km) * 100) / 100,
      };
    });

    let me = null;
    const myId = Number(req.userId);
    const inList = items.find((x) => Number(x.id) === myId);
    if (inList) {
      me = { ...inList, inTop: true };
    } else {
      const [[mine]] = await pool.query(
        `SELECT COALESCE(SUM(distance_km), 0) AS total_km
         FROM workouts
         WHERE user_id = ? AND status = 'approved'`,
        [myId]
      );
      const myKm = Math.round(Number(mine?.total_km || 0) * 100) / 100;
      const [[ahead]] = await pool.query(
        `SELECT COUNT(*) AS cnt FROM (
           SELECT u.id
           FROM users u
           INNER JOIN workouts w ON w.user_id = u.id AND w.status = 'approved'
           WHERE u.status = 'active'
           GROUP BY u.id
           HAVING COALESCE(SUM(w.distance_km), 0) > ?
         ) t`,
        [myKm]
      );
      const [[userRow]] = await pool.query(
        `SELECT id, name, first_name, last_name, avatar_url FROM users WHERE id = ?`,
        [myId]
      );
      if (userRow) {
        const name = displayName(userRow);
        me = {
          rank: Number(ahead?.cnt || 0) + 1,
          id: userRow.id,
          clientId: userRow.id,
          name,
          label: name || String(userRow.id),
          avatar_url: normalizeAvatarUrl(userRow.avatar_url),
          totalKm: myKm,
          inTop: false,
        };
      }
    }

    res.json({ items, me, limit });
  } catch (err) {
    console.error('[leaderboard]', err);
    res.status(500).json({ error: 'Не удалось загрузить рейтинг' });
  }
});

export default router;
