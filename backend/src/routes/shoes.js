import { Router } from 'express';
import { pool } from '../db.js';
import { authUser, requireActiveUser } from '../middleware/auth.js';

const router = Router();

router.post('/activate', authUser, requireActiveUser, async (req, res) => {
  const conn = await pool.getConnection();
  try {
    const { unique_id } = req.body;
    if (!unique_id?.trim()) {
      return res.status(400).json({ error: 'Введите код' });
    }

    const code = unique_id.trim().toUpperCase();

    await conn.beginTransaction();

    const [shoes] = await conn.query('SELECT * FROM shoes WHERE unique_id = ? FOR UPDATE', [
      code,
    ]);

    if (!shoes.length) {
      await conn.rollback();
      return res.status(404).json({ error: 'Код не найден', code: 'NOT_FOUND' });
    }

    const shoe = shoes[0];

    if (shoe.status === 'blocked') {
      await conn.rollback();
      return res.status(403).json({ error: 'Код заблокирован', code: 'BLOCKED' });
    }

    if (shoe.status === 'expired') {
      await conn.rollback();
      return res.status(403).json({ error: 'Срок кода истёк', code: 'EXPIRED' });
    }

    if (shoe.status === 'activated') {
      await conn.rollback();
      return res.status(409).json({ error: 'Этот код уже активирован', code: 'ALREADY_USED' });
    }

    await conn.query(
      `UPDATE shoes SET status = 'activated', activated_by_user_id = ?, activated_at = NOW()
       WHERE id = ?`,
      [req.userId, shoe.id]
    );

    await conn.query(
      `INSERT INTO user_active_shoes (user_id, shoe_id) VALUES (?, ?)
       ON DUPLICATE KEY UPDATE shoe_id = VALUES(shoe_id)`,
      [req.userId, shoe.id]
    );

    await conn.commit();

    res.json({
      message: 'Кроссовки успешно активированы',
      shoe: {
        id: shoe.id,
        unique_id: shoe.unique_id,
        model_name: shoe.model_name,
      },
    });
  } catch (err) {
    await conn.rollback();
    console.error(err);
    res.status(500).json({ error: 'Ошибка активации' });
  } finally {
    conn.release();
  }
});

export default router;
