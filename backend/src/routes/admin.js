import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { customAlphabet } from 'nanoid';
import { pool } from '../db.js';
import { config } from '../config.js';
import { authAdmin } from '../middleware/auth.js';
import { getUserBalance, spendBonus, manualAdjustBonus, topupClientBonus } from '../services/bonusService.js';
import { formatDeviceAdminInfo, resetUserDevice } from '../services/deviceBinding.js';
import adminAccountsRoutes from './adminAccounts.js';
import adminBonusSettingsRoutes from './adminBonusSettings.js';
import adminCustomerLevelsRoutes from './adminCustomerLevels.js';
import adminPaymentMethodsRoutes from './adminPaymentMethods.js';
import adminDeliveryMethodsRoutes from './adminDeliveryMethods.js';
import { getAdminClientLevelInfo } from '../services/customerLevelService.js';

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
              u.device_id, u.device_bound_at,
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
      rows.map((r) => {
        const device = formatDeviceAdminInfo(r.device_id, r.device_bound_at);
        return {
          ...r,
          balance: r.balance != null ? Number(r.balance) : 0,
          device,
        };
      })
    );
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Ошибка' });
  }
});

router.get('/shoes', authAdmin, async (_req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT s.id, s.model_name, s.unique_id, s.qr_code, s.status, s.created_at, s.activated_at,
              u.id AS activated_by_user_id,
              u.name AS activated_by_name,
              u.phone AS activated_by_phone,
              u.city AS activated_by_city,
              u.status AS activated_by_status,
              u.created_at AS activated_by_registered_at,
              COALESCE(ubw.balance, (
                SELECT balance_after FROM bonuses WHERE user_id = u.id ORDER BY id DESC LIMIT 1
              ), 0) AS activated_by_balance,
              (SELECT COUNT(*) FROM workouts w WHERE w.user_id = u.id) AS activated_by_workouts
       FROM shoes s
       LEFT JOIN users u ON u.id = s.activated_by_user_id
       LEFT JOIN user_bonus_wallets ubw ON ubw.user_id = u.id
       ORDER BY s.id DESC
       LIMIT 500`
    );
    res.json(
      rows.map((r) => ({
        ...r,
        activated_by_balance:
          r.activated_by_balance != null ? Number(r.activated_by_balance) : null,
        activated_by_workouts: Number(r.activated_by_workouts || 0),
      }))
    );
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
      `SELECT w.id, w.user_id, u.name AS client_name, u.phone, w.distance_km, w.duration_seconds,
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

router.get('/users/:id', authAdmin, async (req, res) => {
  try {
    const userId = Number(req.params.id);
    if (!userId) return res.status(400).json({ error: 'Некорректный ID' });

    const [users] = await pool.query(
      `SELECT u.id, u.name, u.phone, u.city, u.status, u.created_at, u.updated_at,
              u.device_id, u.device_bound_at,
              s.id AS shoe_id, s.unique_id AS shoe_unique_id, s.model_name AS shoe_model,
              s.status AS shoe_status, s.activated_at AS shoe_activated_at
       FROM users u
       LEFT JOIN user_active_shoes uas ON uas.user_id = u.id
       LEFT JOIN shoes s ON s.id = uas.shoe_id
       WHERE u.id = ?`,
      [userId]
    );
    if (!users.length) return res.status(404).json({ error: 'Клиент не найден' });
    const u = users[0];

    const [walletRows] = await pool.query(
      `SELECT balance, blocked_balance, total_earned, total_spent, total_withdrawn
       FROM user_bonus_wallets WHERE user_id = ?`,
      [userId]
    );
    const w = walletRows[0];
    const balance = w ? Number(w.balance) : 0;
    const blocked = w ? Number(w.blocked_balance || 0) : 0;

    const [stats] = await pool.query(
      `SELECT
         COUNT(*) AS total,
         SUM(status = 'approved') AS approved,
         SUM(status = 'rejected') AS rejected,
         SUM(status = 'in_progress') AS in_progress,
         SUM(status = 'suspicious') AS suspicious,
         COALESCE(SUM(distance_km), 0) AS total_km,
         COALESCE(SUM(CASE WHEN status = 'approved' THEN calculated_bonus ELSE 0 END), 0) AS total_bonus_calc
       FROM workouts WHERE user_id = ?`,
      [userId]
    );
    const st = stats[0];

    const [withdrawals] = await pool.query(
      `SELECT
         COUNT(*) AS total,
         SUM(status IN ('pending', 'processing')) AS active
       FROM withdrawal_requests WHERE user_id = ?`,
      [userId]
    );

    res.json({
      id: u.id,
      name: u.name,
      phone: u.phone,
      city: u.city,
      status: u.status,
      created_at: u.created_at,
      updated_at: u.updated_at,
      wallet: {
        balance,
        blocked_balance: blocked,
        available_balance: Math.round((balance - blocked) * 100) / 100,
        total_earned: w ? Number(w.total_earned) : 0,
        total_spent: w ? Number(w.total_spent) : 0,
        total_withdrawn: w ? Number(w.total_withdrawn || 0) : 0,
      },
      shoe: u.shoe_id
        ? {
            id: u.shoe_id,
            unique_id: u.shoe_unique_id,
            model_name: u.shoe_model,
            status: u.shoe_status,
            activated_at: u.shoe_activated_at,
          }
        : null,
      workouts: {
        total: Number(st.total),
        approved: Number(st.approved),
        rejected: Number(st.rejected),
        in_progress: Number(st.in_progress),
        suspicious: Number(st.suspicious),
        total_km: Number(st.total_km),
        total_bonus_calc: Number(st.total_bonus_calc),
      },
      withdrawals: {
        total: Number(withdrawals[0].total),
        active: Number(withdrawals[0].active),
      },
      device: formatDeviceAdminInfo(u.device_id, u.device_bound_at),
      level_info: await getAdminClientLevelInfo(userId),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Ошибка загрузки профиля' });
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

router.post('/users/reset-device', authAdmin, async (req, res) => {
  const conn = await pool.getConnection();
  try {
    const userId = req.body.user_id ?? req.body.userId;
    if (!userId) {
      return res.status(400).json({ error: 'Укажите user_id' });
    }
    await conn.beginTransaction();
    const user = await resetUserDevice(conn, userId);
    await conn.commit();
    res.json({
      ok: true,
      message: 'Привязка устройства сброшена. Клиент сможет активировать QR на новом телефоне после входа.',
      user: {
        id: user.id,
        name: user.name,
        phone: user.phone,
        previous_device_id: user.device_id,
        previous_device: formatDeviceAdminInfo(user.device_id, null),
      },
      device: formatDeviceAdminInfo(null, null),
    });
  } catch (err) {
    await conn.rollback();
    if (err.status) {
      return res.status(err.status).json({ error: err.message });
    }
    console.error(err);
    res.status(500).json({ error: 'Не удалось сбросить устройство' });
  } finally {
    conn.release();
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
router.use(adminCustomerLevelsRoutes);
router.use(adminPaymentMethodsRoutes);
router.use(adminDeliveryMethodsRoutes);

export default router;
