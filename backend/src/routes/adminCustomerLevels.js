import { Router } from 'express';
import { pool } from '../db.js';
import { authAdmin } from '../middleware/auth.js';
import { getAllCustomerLevels } from '../services/customerLevelService.js';

const router = Router();

router.get('/customer-levels', authAdmin, async (_req, res) => {
  try {
    const levels = await getAllCustomerLevels();
    res.json(
      levels.map((l) => ({
        ...l,
        from_km: Number(l.from_km),
        to_km: Number(l.to_km),
        price_per_km: Number(l.price_per_km),
      }))
    );
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Ошибка загрузки уровней' });
  }
});

router.post('/customer-levels', authAdmin, async (req, res) => {
  try {
    const { name, code, from_km, to_km, price_per_km, color, icon, status, description } = req.body;
    if (!name?.trim() || !code?.trim()) {
      return res.status(400).json({ error: 'Укажите название и код' });
    }
    const [result] = await pool.query(
      `INSERT INTO customer_levels
         (name, code, from_km, to_km, price_per_km, color, icon, status, description)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        name.trim(),
        code.trim().toLowerCase(),
        Number(from_km) || 0,
        Number(to_km) || 0,
        Number(price_per_km) || 0,
        color || null,
        icon || null,
        status === 'inactive' ? 'inactive' : 'active',
        description || null,
      ]
    );
    const [rows] = await pool.query('SELECT * FROM customer_levels WHERE id = ?', [result.insertId]);
    res.status(201).json(rows[0]);
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ error: 'Код уровня уже существует' });
    }
    console.error(err);
    res.status(500).json({ error: 'Ошибка создания уровня' });
  }
});

router.put('/customer-levels/:id', authAdmin, async (req, res) => {
  try {
    const id = req.params.id;
    const { name, code, from_km, to_km, price_per_km, color, icon, status, description } = req.body;
    const [existing] = await pool.query('SELECT id FROM customer_levels WHERE id = ?', [id]);
    if (!existing.length) return res.status(404).json({ error: 'Уровень не найден' });

    await pool.query(
      `UPDATE customer_levels SET
         name = COALESCE(?, name),
         code = COALESCE(?, code),
         from_km = COALESCE(?, from_km),
         to_km = COALESCE(?, to_km),
         price_per_km = COALESCE(?, price_per_km),
         color = ?,
         icon = ?,
         status = COALESCE(?, status),
         description = ?
       WHERE id = ?`,
      [
        name?.trim() || null,
        code?.trim()?.toLowerCase() || null,
        from_km != null ? Number(from_km) : null,
        to_km != null ? Number(to_km) : null,
        price_per_km != null ? Number(price_per_km) : null,
        color ?? null,
        icon ?? null,
        status || null,
        description ?? null,
        id,
      ]
    );
    const [rows] = await pool.query('SELECT * FROM customer_levels WHERE id = ?', [id]);
    res.json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Ошибка сохранения уровня' });
  }
});

router.patch('/customer-levels/:id/status', authAdmin, async (req, res) => {
  try {
    const status = req.body.status === 'inactive' ? 'inactive' : 'active';
    const [result] = await pool.query('UPDATE customer_levels SET status = ? WHERE id = ?', [
      status,
      req.params.id,
    ]);
    if (!result.affectedRows) return res.status(404).json({ error: 'Уровень не найден' });
    const [rows] = await pool.query('SELECT * FROM customer_levels WHERE id = ?', [req.params.id]);
    res.json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Ошибка обновления статуса' });
  }
});

export default router;
