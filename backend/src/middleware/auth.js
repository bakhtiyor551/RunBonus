import jwt from 'jsonwebtoken';
import { config } from '../config.js';
import { pool } from '../db.js';
import { assertMatchingDevice, getDeviceIdFromRequest } from '../services/deviceBinding.js';

function verifyUserToken(req) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    const err = new Error('Требуется авторизация');
    err.status = 401;
    throw err;
  }
  const payload = jwt.verify(header.slice(7), config.jwtSecret);
  req.userId = payload.userId;
  req.deviceId = getDeviceIdFromRequest(req);
}

/** Только JWT (выход с «чужого» телефона без проверки device). */
export function authUserToken(req, res, next) {
  try {
    verifyUserToken(req);
    next();
  } catch (err) {
    return res.status(err.status || 401).json({ error: err.message || 'Недействительный токен' });
  }
}

export async function authUser(req, res, next) {
  try {
    verifyUserToken(req);
    await assertMatchingDevice(pool, req.userId, req.deviceId);
    next();
  } catch (err) {
    if (err.status) {
      return res.status(err.status).json({ error: err.message, code: err.code });
    }
    return res.status(401).json({ error: 'Недействительный токен' });
  }
}

export function authAdmin(req, res, next) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Требуется авторизация администратора' });
  }
  try {
    const payload = jwt.verify(header.slice(7), config.jwtAdminSecret);
    req.adminId = payload.adminId;
    req.adminRole = payload.role;
    next();
  } catch {
    return res.status(401).json({ error: 'Недействительный токен' });
  }
}

export async function requireActiveUser(req, res, next) {
  const [rows] = await pool.query('SELECT status FROM users WHERE id = ?', [req.userId]);
  if (!rows.length || rows[0].status === 'blocked') {
    return res.status(403).json({ error: 'Аккаунт заблокирован' });
  }
  next();
}
