import { pool } from '../db.js';

/** Тренировки — только с активированными кроссовками. */
export async function requireActiveShoe(req, res, next) {
  try {
    const [rows] = await pool.query(
      `SELECT s.status FROM user_active_shoes uas
       JOIN shoes s ON s.id = uas.shoe_id
       WHERE uas.user_id = ?`,
      [req.userId]
    );
    if (!rows.length || rows[0].status !== 'activated') {
      return res.status(403).json({
        error: 'Кроссовки ещё не активированы. Купите их в магазине — активация после доставки заказа.',
        code: 'NO_ACTIVE_SHOE',
      });
    }
    next();
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Ошибка проверки кроссовок' });
  }
}
