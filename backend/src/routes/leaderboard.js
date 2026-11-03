import { Router } from 'express';
import { authUser } from '../middleware/auth.js';
import { pool } from '../db.js';
import { normalizeAvatarUrl } from '../utils/userProfile.js';

const router = Router();

/** Фейковые лидеры для топа (всегда в рейтинге). */
const FAKE_LEADERS = [
  { id: -200, name: 'Рустам', totalKm: 200 },
  { id: -150, name: 'Зарина', totalKm: 150 },
  { id: -100, name: 'Дилшод', totalKm: 100 },
];

/** Имя клиента или null, если не задано. */
function displayName(row) {
  const full = [row.first_name, row.last_name]
    .map((s) => String(s || '').trim())
    .filter(Boolean)
    .join(' ');
  const name = full || String(row.name || '').trim();
  return name || null;
}

function toItem(entry, rank) {
  const name = entry.name ? String(entry.name).trim() : null;
  return {
    rank,
    id: entry.id,
    clientId: entry.id,
    name,
    label: name || String(entry.id),
    avatar_url: entry.avatar_url || null,
    totalKm: Math.round(Number(entry.totalKm) * 100) / 100,
    fake: Boolean(entry.fake),
  };
}

/** Топ клиентов по подтверждённым км (approved workouts) + фейки. */
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
      [Math.max(limit, 50)]
    );

    const real = rows.map((r) => {
      const name = displayName(r);
      return {
        id: r.id,
        name,
        avatar_url: normalizeAvatarUrl(r.avatar_url),
        totalKm: Math.round(Number(r.total_km) * 100) / 100,
        fake: false,
      };
    });

    const fakes = FAKE_LEADERS.map((f) => ({
      id: f.id,
      name: f.name,
      avatar_url: null,
      totalKm: f.totalKm,
      fake: true,
    }));

    const merged = [...real, ...fakes].sort((a, b) => {
      if (b.totalKm !== a.totalKm) return b.totalKm - a.totalKm;
      return Number(a.id) - Number(b.id);
    });

    const items = merged.slice(0, limit).map((entry, i) => toItem(entry, i + 1));

    const myId = Number(req.userId);
    const inList = items.find((x) => Number(x.id) === myId);
    const me = inList ? { ...inList, inTop: true } : null;

    res.json({ items, me, limit });
  } catch (err) {
    console.error('[leaderboard]', err);
    res.status(500).json({ error: 'Не удалось загрузить рейтинг' });
  }
});

export default router;
