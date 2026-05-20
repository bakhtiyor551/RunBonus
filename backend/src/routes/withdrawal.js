import { Router } from 'express';
import { pool } from '../db.js';
import { authUser, requireActiveUser } from '../middleware/auth.js';
import {
  listMethods,
  getWithdrawalSettings,
  createWithdrawalRequest,
  listUserRequests,
  getWalletSummary,
} from '../services/withdrawalService.js';

const router = Router();

function clientIp(req) {
  return req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket?.remoteAddress || null;
}

router.get('/methods', authUser, async (_req, res) => {
  try {
    const methods = await listMethods(true);
    res.json(methods);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Ошибка загрузки кошельков' });
  }
});

router.get('/settings', authUser, async (_req, res) => {
  try {
    const settings = await getWithdrawalSettings();
    res.json(settings);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Ошибка' });
  }
});

router.get('/wallet-summary', authUser, async (req, res) => {
  try {
    const wallet = await getWalletSummary(pool, req.userId);
    res.json(wallet);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Ошибка' });
  }
});

router.get('/my-requests', authUser, async (req, res) => {
  try {
    const list = await listUserRequests(req.userId);
    res.json(list);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Ошибка загрузки истории' });
  }
});

router.post('/requests', authUser, requireActiveUser, async (req, res) => {
  try {
    const result = await createWithdrawalRequest(req.userId, req.body, clientIp(req));
    res.status(201).json({
      ok: true,
      message: 'Заявка отправлена. Ожидайте обработки администратором.',
      request: result.request,
      wallet: result.wallet,
    });
  } catch (err) {
    console.error(err);
    res.status(err.status || 500).json({ error: err.message || 'Ошибка создания заявки' });
  }
});

export default router;
