import { Router } from 'express';
import { pool } from '../db.js';
import { authUser } from '../middleware/auth.js';
import { getUserBalance } from '../services/bonusService.js';

const router = Router();

router.get('/balance', authUser, async (req, res) => {
  try {
    const balance = await getUserBalance(req.userId);
    res.json({ balance });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Ошибка' });
  }
});

router.get('/history', authUser, async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT t.id, t.type, t.amount, t.balance_after, t.comment, t.created_at,
              w.distance_km, w.status AS workout_status, w.reject_reason
       FROM user_bonus_transactions t
       LEFT JOIN workouts w ON w.id = t.workout_id
       WHERE t.user_id = ?
       ORDER BY t.created_at DESC
       LIMIT 100`,
      [req.userId]
    );

    let history = rows.map((r) => mapHistoryRow(r));

    if (!history.length) {
      const [legacy] = await pool.query(
        `SELECT b.id, b.type, b.amount, b.balance_after, b.comment, b.created_at,
                w.distance_km, w.status AS workout_status, w.reject_reason
         FROM bonuses b
         LEFT JOIN workouts w ON w.id = b.workout_id
         WHERE b.user_id = ?
         ORDER BY b.created_at DESC
         LIMIT 100`,
        [req.userId]
      );
      history = legacy.map((r) => mapHistoryRow(r));
    }

    res.json(history);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Ошибка загрузки истории' });
  }
});

function mapHistoryRow(r) {
  let status = 'операция';
  if (r.type === 'earn') {
    status = r.workout_status === 'approved' ? 'начислено' : 'без начисления';
  } else if (r.type === 'spend') {
    status = 'списано';
  } else if (r.type === 'withdraw_hold') {
    status = 'заморозка на вывод';
  } else if (r.type === 'withdraw_success') {
    status = 'вывод выполнен';
  } else if (r.type === 'withdraw_reject') {
    status = 'вывод отклонён';
  }

  return {
    id: r.id,
    date: r.created_at,
    type: r.type,
    amount: Number(r.amount),
    balance_after: Number(r.balance_after),
    km: r.distance_km ? Number(r.distance_km) : null,
    status,
  };
}

export default router;
