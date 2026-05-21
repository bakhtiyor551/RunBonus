import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { pool } from '../db.js';
import { config } from '../config.js';
import { authUser } from '../middleware/auth.js';
import { getUserBalance } from '../services/bonusService.js';
import { getWalletSummary } from '../services/withdrawalService.js';
import { activateShoeForUser } from '../services/shoeActivationService.js';
import {
  buildDisplayName,
  mapUserProfileRow,
  saveAvatarFromDataUrl,
} from '../utils/userProfile.js';
import {
  bindDeviceIfEmpty,
  getDeviceIdFromRequest,
  isDeviceMismatch,
} from '../services/deviceBinding.js';

const router = Router();

router.post('/register', async (req, res) => {
  const conn = await pool.getConnection();
  try {
    const {
      firstName,
      lastName,
      name: nameRaw,
      phone,
      password,
      city,
      unique_id,
    } = req.body;

    const name = (nameRaw || [firstName, lastName].filter(Boolean).join(' ')).trim();
    const userCity = (city || 'Не указан').trim();

    if (!firstName?.trim() || !lastName?.trim()) {
      return res.status(400).json({ error: 'Укажите имя и фамилию' });
    }
    if (!phone?.trim()) {
      return res.status(400).json({ error: 'Укажите номер телефона' });
    }
    if (!password || String(password).length < 4) {
      return res.status(400).json({ error: 'Пароль не менее 4 символов' });
    }
    if (!unique_id?.trim()) {
      return res.status(400).json({ error: 'Отсканируйте QR-код кроссовок' });
    }
    if (!name) {
      return res.status(400).json({ error: 'Укажите имя и фамилию' });
    }

    const phoneNorm = phone.trim();
    const deviceId = getDeviceIdFromRequest(req);
    if (!deviceId) {
      return res.status(400).json({ error: 'Не удалось определить устройство' });
    }

    const [existing] = await conn.query('SELECT id FROM users WHERE phone = ?', [phoneNorm]);
    if (existing.length) {
      return res.status(409).json({ error: 'Номер уже зарегистрирован' });
    }

    await conn.beginTransaction();

    const passwordHash = await bcrypt.hash(password, 10);
    const [result] = await conn.query(
      `INSERT INTO users (name, first_name, last_name, phone, password_hash, city, device_id, device_bound_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, NOW())`,
      [name, firstName.trim(), lastName.trim(), phoneNorm, passwordHash, userCity, deviceId]
    );

    const userId = result.insertId;

    await conn.query(
      'INSERT INTO user_bonus_wallets (user_id, balance, blocked_balance, total_earned, total_spent, total_withdrawn) VALUES (?, 0, 0, 0, 0, 0)',
      [userId]
    );

    const shoe = await activateShoeForUser(conn, userId, unique_id, deviceId);

    await conn.commit();

    const token = jwt.sign({ userId }, config.jwtSecret, { expiresIn: '30d' });
    const profile = await buildUserProfile(userId, deviceId);

    res.status(201).json({
      token,
      user: profile,
      shoe,
    });
  } catch (err) {
    await conn.rollback();
    if (err.status) {
      return res.status(err.status).json({ error: err.message, code: err.code });
    }
    console.error(err);
    res.status(500).json({ error: 'Ошибка регистрации' });
  } finally {
    conn.release();
  }
});

router.post('/login', async (req, res) => {
  try {
    const { phone, password } = req.body;
    const [rows] = await pool.query('SELECT * FROM users WHERE phone = ?', [phone]);
    if (!rows.length) {
      return res.status(401).json({ error: 'Неверный телефон или пароль' });
    }

    const user = rows[0];
    if (user.status === 'blocked') {
      return res.status(403).json({ error: 'Аккаунт заблокирован' });
    }

    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) {
      return res.status(401).json({ error: 'Неверный телефон или пароль' });
    }

    const deviceId = getDeviceIdFromRequest(req);
    await bindDeviceIfEmpty(pool, user.id, deviceId);

    const token = jwt.sign({ userId: user.id }, config.jwtSecret, { expiresIn: '30d' });
    const profile = await buildUserProfile(user.id, deviceId);

    res.json({ token, user: profile });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Ошибка входа' });
  }
});

router.get('/me', authUser, async (req, res) => {
  try {
    const deviceId = getDeviceIdFromRequest(req);
    await bindDeviceIfEmpty(pool, req.userId, deviceId);
    const profile = await buildUserProfile(req.userId, deviceId);
    if (!profile) return res.status(404).json({ error: 'Пользователь не найден' });
    res.json(profile);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

router.patch('/profile', authUser, async (req, res) => {
  try {
    const firstName = String(req.body.firstName ?? req.body.first_name ?? '').trim();
    const lastName = String(req.body.lastName ?? req.body.last_name ?? '').trim();
    const avatarBase64 = req.body.avatarBase64 ?? req.body.avatar_base64 ?? null;

    if (!firstName || !lastName) {
      return res.status(400).json({ error: 'Укажите имя и фамилию' });
    }

    const name = buildDisplayName(firstName, lastName);
    let avatarUrl;

    if (avatarBase64) {
      avatarUrl = saveAvatarFromDataUrl(req.userId, avatarBase64);
    }

    if (avatarUrl) {
      await pool.query(
        'UPDATE users SET name = ?, first_name = ?, last_name = ?, avatar_url = ? WHERE id = ?',
        [name, firstName, lastName, avatarUrl, req.userId]
      );
    } else {
      await pool.query(
        'UPDATE users SET name = ?, first_name = ?, last_name = ? WHERE id = ?',
        [name, firstName, lastName, req.userId]
      );
    }

    const profile = await buildUserProfile(req.userId, getDeviceIdFromRequest(req));
    res.json(profile);
  } catch (err) {
    if (err.status) {
      return res.status(err.status).json({ error: err.message });
    }
    console.error(err);
    res.status(500).json({ error: 'Не удалось сохранить профиль' });
  }
});

async function buildUserProfile(userId, requestDeviceId = null) {
  const [users] = await pool.query(
    'SELECT id, name, first_name, last_name, avatar_url, phone, city, status, device_id FROM users WHERE id = ?',
    [userId]
  );
  if (!users.length) return null;
  const base = mapUserProfileRow(users[0]);

  const [activeShoe] = await pool.query(
    `SELECT s.id, s.unique_id, s.model_name, s.status, s.max_bonus_limit
     FROM user_active_shoes uas
     JOIN shoes s ON s.id = uas.shoe_id
     WHERE uas.user_id = ?`,
    [userId]
  );

  const balance = await getUserBalance(userId);
  let walletSummary = { balance, blocked_balance: 0, available_balance: balance };
  try {
    walletSummary = await getWalletSummary(pool, userId);
  } catch {
    /* migration not applied yet */
  }

  return {
    ...base,
    balance: walletSummary.balance,
    blocked_balance: walletSummary.blocked_balance,
    available_balance: walletSummary.available_balance,
    activeShoe: activeShoe[0]
      ? { id: activeShoe[0].id, unique_id: activeShoe[0].unique_id, model_name: activeShoe[0].model_name }
      : null,
    needsActivation: !activeShoe.length,
    qrActivationAllowed: !isDeviceMismatch(users[0].device_id, requestDeviceId),
  };
}

export default router;
