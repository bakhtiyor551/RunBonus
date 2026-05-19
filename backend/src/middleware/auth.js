import jwt from 'jsonwebtoken';
import { config } from '../config.js';
import { pool } from '../db.js';

export function authUser(req, res, next) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Требуется авторизация' });
  }
  try {
    const payload = jwt.verify(header.slice(7), config.jwtSecret);
    req.userId = payload.userId;
    next();
  } catch {
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
