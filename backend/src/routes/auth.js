import { Router } from 'express';
import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { pool } from '../db.js';
import { config } from '../config.js';
import { authUser, authUserToken } from '../middleware/auth.js';
import { getUserBalance } from '../services/bonusService.js';
import { getWalletSummary } from '../services/withdrawalService.js';
import { activateShoeForUser } from '../services/shoeActivationService.js';
import {
  buildDisplayName,
  mapUserProfileRow,
  saveAvatarFromDataUrl,
} from '../utils/userProfile.js';
import {
  bindDeviceOnLogin,
  getDeviceIdFromRequest,
  isDeviceMismatch,
  unbindDeviceOnLogout,
} from '../services/deviceBinding.js';
import { sendVerificationCode, verifyCode } from '../services/smsOtpService.js';
import { isSmsEnabled } from '../services/smsService.js';

const router = Router();

router.get('/sms/status', (_req, res) => {
  res.json({ enabled: isSmsEnabled() });
});

router.post('/sms/send', async (req, res) => {
  try {
    const { phone, purpose } = req.body;
    if (!purpose || !['register', 'login'].includes(purpose)) {
      return res.status(400).json({ error: 'Укажите purpose: register или login' });
    }
    const result = await sendVerificationCode(phone, purpose);
    res.json(result);
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    console.error(err);
    res.status(500).json({ error: 'Не удалось отправить SMS' });
  }
});

router.post('/sms/register', async (req, res) => {
  const conn = await pool.getConnection();
  try {
    const { phone, code, firstName, lastName } = req.body;
    if (!firstName?.trim() || !lastName?.trim()) {
      return res.status(400).json({ error: 'Укажите имя и фамилию' });
    }

    const phoneNorm = await verifyCode(phone, 'register', code);
    const deviceId = getDeviceIdFromRequest(req);
    if (!deviceId) {
      return res.status(400).json({ error: 'Не удалось определить устройство' });
    }

    const name = buildDisplayName(firstName.trim(), lastName.trim());
    const passwordHash = await bcrypt.hash(crypto.randomBytes(24).toString('hex'), 10);

    await conn.beginTransaction();

    const [result] = await conn.query(
      `INSERT INTO users (name, first_name, last_name, phone, password_hash, city, device_id, device_bound_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, NOW())`,
      [name, firstName.trim(), lastName.trim(), phoneNorm, passwordHash, 'Не указан', deviceId]
    );

    const userId = result.insertId;
    await conn.query(
      'INSERT INTO user_bonus_wallets (user_id, balance, blocked_balance, total_earned, total_spent, total_withdrawn) VALUES (?, 0, 0, 0, 0, 0)',
      [userId]
    );

    await conn.commit();

    const token = jwt.sign({ userId }, config.jwtSecret, { expiresIn: '30d' });
    const profile = await buildUserProfile(userId, deviceId);

    res.status(201).json({
      token,
      user: profile,
      redirectToShop: true,
    });
  } catch (err) {
    await conn.rollback();
    if (err.status) return res.status(err.status).json({ error: err.message });
    console.error(err);
    res.status(500).json({ error: 'Ошибка регистрации' });
  } finally {
    conn.release();
  }
});

router.post('/sms/login', async (req, res) => {
  try {
    const { phone, code } = req.body;
    const phoneNorm = await verifyCode(phone, 'login', code);

    const [rows] = await pool.query('SELECT * FROM users WHERE phone = ?', [phoneNorm]);
    if (!rows.length) {
      return res.status(404).json({ error: 'Пользователь не найден' });
    }

    const user = rows[0];
    if (user.status === 'blocked') {
      return res.status(403).json({ error: 'Аккаунт заблокирован' });
    }

    const deviceId = getDeviceIdFromRequest(req);
    if (!deviceId) {
      return res.status(400).json({ error: 'Не удалось определить устройство' });
    }

    const bindResult = await bindDeviceOnLogin(pool, user.id, deviceId);
    const token = jwt.sign({ userId: user.id }, config.jwtSecret, { expiresIn: '30d' });
    const profile = await buildUserProfile(user.id, deviceId);

    res.json({
      token,
      user: profile,
      device_changed: bindResult.device_changed,
      message: bindResult.device_changed
        ? 'Аккаунт привязан к этому телефону. Другие устройства отключены.'
        : undefined,
    });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    console.error(err);
    res.status(500).json({ error: 'Ошибка входа' });
  }
});

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
    const hasShoeCode = Boolean(unique_id?.trim());
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

    let shoe = null;
    if (hasShoeCode) {
      const { validateShoeQr } = await import('../services/shoeValidateService.js');
      const check = await validateShoeQr(conn, unique_id);
      if (!check.valid) {
        await conn.rollback();
        return res.status(400).json({ error: check.error || 'QR-код недействителен', code: check.code });
      }
      shoe = await activateShoeForUser(conn, userId, unique_id, deviceId);
    }

    await conn.commit();

    const token = jwt.sign({ userId }, config.jwtSecret, { expiresIn: '30d' });
    const profile = await buildUserProfile(userId, deviceId);

    res.status(201).json({
      token,
      user: profile,
      shoe,
      redirectToShop: !hasShoeCode,
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
    if (!deviceId) {
      return res.status(400).json({ error: 'Не удалось определить устройство' });
    }
    const bindResult = await bindDeviceOnLogin(pool, user.id, deviceId);

    const token = jwt.sign({ userId: user.id }, config.jwtSecret, { expiresIn: '30d' });
    const profile = await buildUserProfile(user.id, deviceId);

    res.json({
      token,
      user: profile,
      device_changed: bindResult.device_changed,
      message: bindResult.device_changed
        ? 'Аккаунт привязан к этому телефону. Другие устройства отключены.'
        : undefined,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Ошибка входа' });
  }
});

router.get('/me', authUser, async (req, res) => {
  try {
    const profile = await buildUserProfile(req.userId, req.deviceId);
    if (!profile) return res.status(404).json({ error: 'Пользователь не найден' });
    res.json(profile);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

router.post('/logout', authUserToken, async (req, res) => {
  try {
    const result = await unbindDeviceOnLogout(pool, req.userId, req.deviceId);
    res.json({
      ok: true,
      device_cleared: result.cleared,
      message: result.cleared
        ? 'Выход выполнен. Привязка к этому телефону снята.'
        : result.mismatch
          ? 'Выход выполнен. Это устройство не было основным для аккаунта.'
          : 'Выход выполнен.',
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Ошибка выхода' });
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
    needsActivation: !activeShoe.length || activeShoe[0].status !== 'activated',
    qrActivationAllowed: !isDeviceMismatch(users[0].device_id, requestDeviceId),
  };
}

export default router;
