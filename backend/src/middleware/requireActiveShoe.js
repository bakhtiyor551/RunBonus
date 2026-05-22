import { pool } from '../db.js';

/** Тренировки, вывод и начисление бонусов — только с активированными кроссовками. */
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
        error: 'Сначала активируйте кроссовки RunBonus или дождитесь доставки заказа',
        code: 'NO_ACTIVE_SHOE',
      });
    }
    next();
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Ошибка проверки кроссовок' });
  }
}
