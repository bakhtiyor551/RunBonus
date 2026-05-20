import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { pool } from '../db.js';
import { config } from '../config.js';
import { authUser } from '../middleware/auth.js';
import { getUserBalance } from '../services/bonusService.js';
import { activateShoeForUser } from '../services/shoeActivationService.js';

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

    const [existing] = await conn.query('SELECT id FROM users WHERE phone = ?', [phoneNorm]);
    if (existing.length) {
      return res.status(409).json({ error: 'Номер уже зарегистрирован' });
    }

    await conn.beginTransaction();

    const passwordHash = await bcrypt.hash(password, 10);
    const [result] = await conn.query(
      'INSERT INTO users (name, phone, password_hash, city) VALUES (?, ?, ?, ?)',
      [name, phoneNorm, passwordHash, userCity]
    );

    const userId = result.insertId;

    await conn.query(
      'INSERT INTO user_bonus_wallets (user_id, balance, total_earned, total_spent) VALUES (?, 0, 0, 0)',
      [userId]
    );

    const shoe = await activateShoeForUser(conn, userId, unique_id);

    await conn.commit();

    const token = jwt.sign({ userId }, config.jwtSecret, { expiresIn: '30d' });
    const profile = await buildUserProfile(userId);

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

    const token = jwt.sign({ userId: user.id }, config.jwtSecret, { expiresIn: '30d' });
    const profile = await buildUserProfile(user.id);

    res.json({ token, user: profile });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Ошибка входа' });
  }
});

router.get('/me', authUser, async (req, res) => {
  try {
    const profile = await buildUserProfile(req.userId);
    if (!profile) return res.status(404).json({ error: 'Пользователь не найден' });
    res.json(profile);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

async function buildUserProfile(userId) {
  const [users] = await pool.query(
    'SELECT id, name, phone, city, status FROM users WHERE id = ?',
    [userId]
  );
  if (!users.length) return null;
  const user = users[0];

  const [activeShoe] = await pool.query(
    `SELECT s.id, s.unique_id, s.model_name, s.status, s.max_bonus_limit
     FROM user_active_shoes uas
     JOIN shoes s ON s.id = uas.shoe_id
     WHERE uas.user_id = ?`,
    [userId]
  );

  const balance = await getUserBalance(userId);

  return {
    id: user.id,
    name: user.name,
    phone: user.phone,
    city: user.city,
    status: user.status,
    balance,
    activeShoe: activeShoe[0]
      ? { id: activeShoe[0].id, unique_id: activeShoe[0].unique_id, model_name: activeShoe[0].model_name }
      : null,
    needsActivation: !activeShoe.length,
  };
}

export default router;
