import { Router } from 'express';
import { authAdmin } from '../middleware/auth.js';
import {
  listAllPaymentMethodsAdmin,
  createPaymentMethod,
  updatePaymentMethod,
  setPaymentMethodStatus,
} from '../services/paymentMethodService.js';

const router = Router();

router.get('/payment-methods', authAdmin, async (_req, res) => {
  try {
    const methods = await listAllPaymentMethodsAdmin();
    res.json(methods);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Ошибка загрузки способов оплаты' });
  }
});

router.post('/payment-methods', authAdmin, async (req, res) => {
  try {
    const method = await createPaymentMethod(req.body);
    res.status(201).json(method);
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    console.error(err);
    res.status(500).json({ error: 'Ошибка создания' });
  }
});

router.put('/payment-methods/:id', authAdmin, async (req, res) => {
  try {
    const method = await updatePaymentMethod(req.params.id, req.body);
    res.json(method);
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    console.error(err);
    res.status(500).json({ error: 'Ошибка сохранения' });
  }
});

router.patch('/payment-methods/:id/status', authAdmin, async (req, res) => {
  try {
    const method = await setPaymentMethodStatus(req.params.id, req.body.status);
    res.json(method);
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    console.error(err);
    res.status(500).json({ error: 'Ошибка обновления статуса' });
  }
});

export default router;
