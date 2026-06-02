import { Router } from 'express';
import { pool } from '../db.js';
import { authUser, requireActiveUser } from '../middleware/auth.js';
import { activateShoeForUser } from '../services/shoeActivationService.js';
import { getDeviceIdFromRequest } from '../services/deviceBinding.js';
import shoeModelsRouter from './shoeModels.js';

const router = Router();

/** Активация QR-кроссовок */
router.post('/activate', authUser, requireActiveUser, async (req, res) => {
  const conn = await pool.getConnection();
  try {
    const { unique_id } = req.body;
    await conn.beginTransaction();
    const deviceId = getDeviceIdFromRequest(req);
    const shoe = await activateShoeForUser(conn, req.userId, unique_id, deviceId);
    await conn.commit();
    res.json({
      message: 'Кроссовки успешно активированы',
      shoe,
    });
  } catch (err) {
    await conn.rollback();
    if (err.status) {
      return res.status(err.status).json({ error: err.message, code: err.code || undefined });
    }
    console.error(err);
    res.status(500).json({ error: 'Ошибка активации' });
  } finally {
    conn.release();
  }
});

/** AR-каталог: GET /api/shoes, GET /api/shoes/:id, GET /api/shoes/:id/ar */
router.use(shoeModelsRouter);

export default router;
