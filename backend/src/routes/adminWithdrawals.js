import { Router } from 'express';
import { authAdmin } from '../middleware/auth.js';
import {
  listAdminRequests,
  getRequestById,
  setProcessing,
  setSuccess,
  setRejected,
  getWithdrawalSettings,
  updateWithdrawalSettings,
  listMethods,
} from '../services/withdrawalService.js';

const router = Router();

function clientIp(req) {
  return req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket?.remoteAddress || null;
}

router.get('/settings', authAdmin, async (_req, res) => {
  try {
    const [settings, methods] = await Promise.all([getWithdrawalSettings(), listMethods(false)]);
    res.json({ settings, methods });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Ошибка' });
  }
});

router.put('/settings', authAdmin, async (req, res) => {
  try {
    const { enabled, min_amount, max_daily_amount } = req.body;
    const settings = await updateWithdrawalSettings({
      enabled: enabled !== false,
      min_amount: Number(min_amount) || 20,
      max_daily_amount: Number(max_daily_amount) || 100,
    });
    res.json({ settings });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Ошибка сохранения' });
  }
});

router.get('/', authAdmin, async (req, res) => {
  try {
    const status = req.query.status || null;
    const list = await listAdminRequests(status);
    res.json(list);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Ошибка загрузки заявок' });
  }
});

router.get('/:id', authAdmin, async (req, res) => {
  try {
    const item = await getRequestById(req.params.id);
    if (!item) return res.status(404).json({ error: 'Заявка не найдена' });
    res.json(item);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Ошибка' });
  }
});

router.post('/:id/processing', authAdmin, async (req, res) => {
  try {
    const item = await setProcessing(req.params.id, req.adminId, clientIp(req));
    res.json({ ok: true, request: item });
  } catch (err) {
    console.error(err);
    res.status(err.status || 500).json({ error: err.message || 'Ошибка' });
  }
});

router.post('/:id/success', authAdmin, async (req, res) => {
  try {
    const item = await setSuccess(req.params.id, req.adminId, req.body.admin_comment, clientIp(req));
    res.json({ ok: true, request: item });
  } catch (err) {
    console.error(err);
    res.status(err.status || 500).json({ error: err.message || 'Ошибка' });
  }
});

router.post('/:id/reject', authAdmin, async (req, res) => {
  try {
    const item = await setRejected(req.params.id, req.adminId, req.body.admin_comment, clientIp(req));
    res.json({ ok: true, request: item });
  } catch (err) {
    console.error(err);
    res.status(err.status || 500).json({ error: err.message || 'Ошибка' });
  }
});

export default router;
