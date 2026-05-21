import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { customAlphabet } from 'nanoid';
import { pool } from '../db.js';
import { config } from '../config.js';
import { authAdmin } from '../middleware/auth.js';
import { getUserBalance, spendBonus, manualAdjustBonus, topupClientBonus } from '../services/bonusService.js';
import adminAccountsRoutes from './adminAccounts.js';
import adminBonusSettingsRoutes from './adminBonusSettings.js';

const router = Router();
const genId = customAlphabet('ABCDEFGHJKLMNPQRSTUVWXYZ23456789', 8);

router.post('/login', async (req, res) => {
  try {
    const { login, password } = req.body;
    const [rows] = await pool.query('SELECT * FROM admin_users WHERE login = ?', [login]);
    if (!rows.length) {
      return res.status(401).json({ error: 'Неверный логин или пароль' });
    }
    const admin = rows[0];
    const valid = await bcrypt.compare(password, admin.password_hash);
    if (!valid) {
      return res.status(401).json({ error: 'Неверный логин или пароль' });
    }
    const token = jwt.sign(
      { adminId: admin.id, role: admin.role },
      config.jwtAdminSecret,
      { expiresIn: '7d' }
    );
    res.json({ token, admin: { id: admin.id, login: admin.login, role: admin.role } });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Ошибка входа' });
  }
});

router.get('/users', authAdmin, async (_req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT u.id, u.name, u.phone, u.city, u.status, u.created_at,
              s.unique_id AS activated_shoe_id,
              COALESCE(ubw.balance, (
                SELECT balance_after FROM bonuses WHERE user_id = u.id ORDER BY id DESC LIMIT 1
              ), 0) AS balance
       FROM users u
       LEFT JOIN user_bonus_wallets ubw ON ubw.user_id = u.id
       LEFT JOIN user_active_shoes uas ON uas.user_id = u.id
       LEFT JOIN shoes s ON s.id = uas.shoe_id
       ORDER BY u.created_at DESC`
    );
    res.json(
      rows.map((r) => ({
        ...r,
        balance: r.balance != null ? Number(r.balance) : 0,
      }))
    );
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Ошибка' });
  }
});

router.get('/shoes', authAdmin, async (_req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT s.id, s.model_name, s.unique_id, s.qr_code, s.status, s.created_at,
              u.name AS activated_by_name, u.phone AS activated_by_phone
       FROM shoes s
       LEFT JOIN users u ON u.id = s.activated_by_user_id
       ORDER BY s.id DESC
       LIMIT 500`
    );
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Ошибка' });
  }
});

router.post('/shoes/generate', authAdmin, async (req, res) => {
  const conn = await pool.getConnection();
  try {
    const { model_name, quantity } = req.body;
    if (!model_name || !quantity || quantity < 1 || quantity > 500) {
      return res.status(400).json({ error: 'Укажите модель и количество (1–500)' });
    }

    await conn.beginTransaction();
    const [batch] = await conn.query(
      'INSERT INTO shoe_batches (model_name, quantity) VALUES (?, ?)',
      [model_name, quantity]
    );

    const created = [];
    for (let i = 0; i < quantity; i++) {
      const uniqueId = `SHOE-${genId()}`;
      const qrCode = uniqueId;
      const [r] = await conn.query(
        `INSERT INTO shoes (batch_id, model_name, qr_code, unique_id, status)
         VALUES (?, ?, ?, ?, 'new')`,
        [batch.insertId, model_name, qrCode, uniqueId]
      );
      created.push({ id: r.insertId, unique_id: uniqueId, qr_code: qrCode, model_name });
    }

    await conn.commit();
    res.status(201).json({ batch_id: batch.insertId, count: created.length, shoes: created });
  } catch (err) {
    await conn.rollback();
    console.error(err);
    res.status(500).json({ error: 'Ошибка генерации' });
  } finally {
    conn.release();
  }
});

router.get('/workouts', authAdmin, async (_req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT w.id, u.name AS client_name, u.phone, w.distance_km, w.duration_seconds,
              w.avg_speed, w.max_speed, w.started_at, w.finished_at, w.status, w.reject_reason,
              w.background_tracking,
              COALESCE(
                (SELECT amount FROM user_bonus_transactions WHERE workout_id = w.id AND type = 'earn' LIMIT 1),
                (SELECT amount FROM bonuses WHERE workout_id = w.id AND type = 'earn' LIMIT 1),
                0
              ) AS bonus
       FROM workouts w
       JOIN users u ON u.id = w.user_id
       ORDER BY w.started_at DESC
       LIMIT 200`
    );
    res.json(
      rows.map((r) => ({
        ...r,
        distance_km: Number(r.distance_km),
        bonus: r.bonus != null ? Number(r.bonus) : 0,
      }))
    );
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Ошибка' });
  }
});

router.get('/workouts/:id', authAdmin, async (req, res) => {
  try {
    const { getDailyEarned, getShoeTotalEarned } = await import('../services/bonusService.js');
    const { getActiveBonusSettings } = await import('../services/bonusSettingsService.js');

    const [workouts] = await pool.query(
      `SELECT w.*, u.name AS client_name, u.phone,
              s.unique_id AS shoe_unique_id, s.model_name AS shoe_model
       FROM workouts w
       JOIN users u ON u.id = w.user_id
       JOIN shoes s ON s.id = w.shoe_id
       WHERE w.id = ?`,
      [req.params.id]
    );
    if (!workouts.length) return res.status(404).json({ error: 'Тренировка не найдена' });

    const w = workouts[0];
    const [points] = await pool.query(
      `SELECT id, latitude AS lat, longitude AS lng, speed, accuracy, recorded_at
       FROM workout_points WHERE workout_id = ? ORDER BY recorded_at`,
      [req.params.id]
    );

    const day = w.started_at ? new Date(w.started_at).toISOString().slice(0, 10) : null;
    const dailyEarned = day ? await getDailyEarned(w.user_id, w.shoe_id, day) : 0;
    const shoeTotalEarned = await getShoeTotalEarned(w.user_id, w.shoe_id);

    const [bonusRow] = await pool.query(
      `SELECT amount FROM user_bonus_transactions WHERE workout_id = ? AND type = 'earn' LIMIT 1`,
      [req.params.id]
    );

    const settings = await getActiveBonusSettings();

    res.json({
      workout: {
        ...w,
        distance_km: Number(w.distance_km),
        price_per_km: w.price_per_km != null ? Number(w.price_per_km) : null,
        calculated_bonus: w.calculated_bonus != null ? Number(w.calculated_bonus) : null,
        avg_speed: w.avg_speed != null ? Number(w.avg_speed) : null,
        max_speed: w.max_speed != null ? Number(w.max_speed) : null,
      },
      points: points.map((p) => ({
        ...p,
        lat: Number(p.lat),
        lng: Number(p.lng),
        speed: p.speed != null ? Number(p.speed) : null,
        accuracy: p.accuracy != null ? Number(p.accuracy) : null,
      })),
      bonus_earned: bonusRow.length ? Number(bonusRow[0].amount) : 0,
      limits: {
        daily_earned: dailyEarned,
        daily_limit: settings.daily_limit,
        shoe_total_earned: shoeTotalEarned,
        shoe_limit: settings.total_limit_per_shoe,
        current_price_per_km: settings.price_per_km,
      },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Ошибка' });
  }
});

router.post('/users/block', authAdmin, async (req, res) => {
  try {
    const { user_id, blocked } = req.body;
    await pool.query('UPDATE users SET status = ? WHERE id = ?', [
      blocked ? 'blocked' : 'active',
      user_id,
    ]);
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Ошибка' });
  }
});

router.post('/bonus/topup', authAdmin, async (req, res) => {
  const conn = await pool.getConnection();
  try {
    const { phone, user_id, amount, comment } = req.body;
    const sum = Number(amount);
    if ((!phone && !user_id) || !sum || sum <= 0) {
      return res.status(400).json({ error: 'Укажите телефон или ID клиента и сумму больше 0' });
    }

    let user;
    if (user_id) {
      const [rows] = await conn.query('SELECT id, status, phone, name FROM users WHERE id = ?', [user_id]);
      if (!rows.length) return res.status(404).json({ error: 'Клиент не найден' });
      user = rows[0];
    } else {
      const [rows] = await conn.query('SELECT id, status, phone, name FROM users WHERE phone = ?', [phone]);
      if (!rows.length) return res.status(404).json({ error: 'Клиент не найден' });
      user = rows[0];
    }

    if (user.status === 'blocked') {
      return res.status(403).json({ error: 'Клиент заблокирован' });
    }

    await conn.beginTransaction();
    const result = await topupClientBonus(conn, {
      userId: user.id,
      amount: sum,
      comment,
      adminId: req.adminId,
    });
    await conn.commit();

    res.json({
      ok: true,
      user_id: user.id,
      phone: user.phone,
      name: user.name,
      balance_after: result.balanceAfter,
      fund_after: result.fundAfter,
    });
  } catch (err) {
    await conn.rollback();
    if (err.code === 'INSUFFICIENT_FUND') {
      return res.status(400).json({ error: 'Недостаточно средств на бонусном фонде' });
    }
    if (err.code === 'NO_BONUS_FUND') {
      return res.status(400).json({ error: 'Бонусный фонд не найден или неактивен' });
    }
    console.error(err);
    res.status(500).json({ error: 'Ошибка пополнения' });
  } finally {
    conn.release();
  }
});

router.post('/bonus/spend', authAdmin, async (req, res) => {
  const conn = await pool.getConnection();
  try {
    const { phone, amount, comment } = req.body;
    if (!phone || !amount || amount <= 0) {
      return res.status(400).json({ error: 'Укажите телефон и сумму' });
    }

    const [users] = await conn.query('SELECT id, status FROM users WHERE phone = ?', [phone]);
    if (!users.length) {
      return res.status(404).json({ error: 'Клиент не найден' });
    }
    const user = users[0];
    if (user.status === 'blocked') {
      return res.status(403).json({ error: 'Клиент заблокирован' });
    }

    await conn.beginTransaction();
    const balanceAfter = await spendBonus(conn, {
      userId: user.id,
      amount: Number(amount),
      comment,
      adminId: req.adminId,
    });
    await conn.commit();

    res.json({ ok: true, balance_after: balanceAfter });
  } catch (err) {
    await conn.rollback();
    if (err.code === 'INSUFFICIENT_BALANCE') {
      return res.status(400).json({ error: 'Недостаточно бонусов на кошельке клиента' });
    }
    console.error(err);
    res.status(500).json({ error: 'Ошибка списания' });
  } finally {
    conn.release();
  }
});

router.post('/bonus/manual', authAdmin, async (req, res) => {
  const conn = await pool.getConnection();
  try {
    const { user_id, amount, type, comment } = req.body;
    if (!user_id || !amount) {
      return res.status(400).json({ error: 'Укажите user_id и amount' });
    }
    await conn.beginTransaction();
    const balanceAfter = await manualAdjustBonus(conn, {
      userId: user_id,
      amount: Number(amount),
      isRemove: type === 'remove',
      comment,
    });
    await conn.commit();
    res.json({ ok: true, balance_after: balanceAfter });
  } catch (err) {
    await conn.rollback();
    if (err.code === 'NEGATIVE_BALANCE') {
      return res.status(400).json({ error: 'Баланс не может быть отрицательным' });
    }
    console.error(err);
    res.status(500).json({ error: 'Ошибка' });
  } finally {
    conn.release();
  }
});

router.use(adminAccountsRoutes);
router.use(adminBonusSettingsRoutes);

export default router;
