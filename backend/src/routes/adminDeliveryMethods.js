import { Router } from 'express';
import { authAdmin } from '../middleware/auth.js';
import {
  listAllDeliveryMethodsAdmin,
  createDeliveryMethod,
  updateDeliveryMethod,
  setDeliveryMethodStatus,
} from '../services/deliveryMethodService.js';

const router = Router();

router.get('/delivery-methods', authAdmin, async (_req, res) => {
  try {
    const methods = await listAllDeliveryMethodsAdmin();
    res.json(methods);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Ошибка загрузки способов доставки' });
  }
});

router.post('/delivery-methods', authAdmin, async (req, res) => {
  try {
    const method = await createDeliveryMethod(req.body);
    res.status(201).json(method);
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    console.error(err);
    res.status(500).json({ error: 'Ошибка создания' });
  }
});

router.put('/delivery-methods/:id', authAdmin, async (req, res) => {
  try {
    const method = await updateDeliveryMethod(req.params.id, req.body);
    res.json(method);
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    console.error(err);
    res.status(500).json({ error: 'Ошибка сохранения' });
  }
});

router.patch('/delivery-methods/:id/status', authAdmin, async (req, res) => {
  try {
    const method = await setDeliveryMethodStatus(req.params.id, req.body.status);
    res.json(method);
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    console.error(err);
    res.status(500).json({ error: 'Ошибка обновления статуса' });
  }
});

export default router;
