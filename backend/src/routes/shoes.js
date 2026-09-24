import { Router } from 'express';
import { authUser, requireActiveUser } from '../middleware/auth.js';

const router = Router();

/** Активация по QR из приложения отключена — кроссовки активируются при доставке заказа. */
router.post('/activate', authUser, requireActiveUser, (_req, res) => {
  res.status(410).json({
    error: 'Активация по QR отключена. Кроссовки активируются автоматически после доставки заказа.',
    code: 'ACTIVATION_VIA_DELIVERY',
  });
});

export default router;
