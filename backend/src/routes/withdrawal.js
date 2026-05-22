import { Router } from 'express';
import { pool } from '../db.js';
import { authUser, requireActiveUser } from '../middleware/auth.js';
import { requireActiveShoe } from '../middleware/requireActiveShoe.js';
import {
  listMethods,
  getWithdrawalSettings,
  createWithdrawalRequest,
  listUserRequests,
  getWalletSummary,
  isWithdrawalSchemaReady,
  mapWithdrawalError,
} from '../services/withdrawalService.js';

const router = Router();

function clientIp(req) {
  return req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket?.remoteAddress || null;
}

async function requireWithdrawalSchema(_req, res, next) {
  try {
    if (!(await isWithdrawalSchemaReady())) {
      return res.status(503).json({
        error: 'Модуль вывода не настроен на сервере. Запустите npm run db:setup в backend.',
      });
    }
    next();
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Ошибка проверки модуля вывода' });
  }
}

router.use(requireWithdrawalSchema);

router.get('/methods', authUser, async (_req, res) => {
  try {
    const methods = await listMethods(true);
    res.json(methods);
  } catch (err) {
    console.error(err);
    const mapped = mapWithdrawalError(err);
    res.status(mapped.status || 500).json({ error: mapped.message });
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

router.post('/requests', authUser, requireActiveUser, requireActiveShoe, async (req, res) => {
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
    const mapped = mapWithdrawalError(err);
    res.status(mapped.status || 500).json({ error: mapped.message });
  }
});

export default router;
