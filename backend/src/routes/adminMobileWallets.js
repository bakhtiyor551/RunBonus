import { Router } from 'express';
import { authAdmin } from '../middleware/auth.js';
import {
  listAllMobilePaymentAccountsAdmin,
  createMobilePaymentAccount,
  updateMobilePaymentAccount,
  setMobilePaymentAccountStatus,
} from '../services/mobilePaymentAccountService.js';

const router = Router();

router.get('/mobile-wallets', authAdmin, async (_req, res) => {
  try {
    const accounts = await listAllMobilePaymentAccountsAdmin();
    res.json(accounts);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Ошибка загрузки кошельков' });
  }
});

router.post('/mobile-wallets', authAdmin, async (req, res) => {
  try {
    const account = await createMobilePaymentAccount(req.body);
    res.status(201).json(account);
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    console.error(err);
    res.status(500).json({ error: 'Ошибка создания' });
  }
});

router.put('/mobile-wallets/:id', authAdmin, async (req, res) => {
  try {
    const account = await updateMobilePaymentAccount(req.params.id, req.body);
    res.json(account);
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    console.error(err);
    res.status(500).json({ error: 'Ошибка сохранения' });
  }
});

router.patch('/mobile-wallets/:id/status', authAdmin, async (req, res) => {
  try {
    const account = await setMobilePaymentAccountStatus(req.params.id, req.body.status);
    res.json(account);
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    console.error(err);
    res.status(500).json({ error: 'Ошибка обновления статуса' });
  }
});

export default router;
