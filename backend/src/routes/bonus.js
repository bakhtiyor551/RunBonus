import { Router } from 'express';
import { authUser } from '../middleware/auth.js';

const router = Router();

const GONE = {
  error: 'Денежный кошелёк отключён. Используйте систему наград: /api/rewards/*',
  code: 'WALLET_DEPRECATED',
};

/** Legacy money endpoints — disabled for the rewards loyalty model. */
router.get('/balance', authUser, (_req, res) => {
  res.status(410).json(GONE);
});

router.get('/wallet-summary', authUser, (_req, res) => {
  res.status(410).json(GONE);
});

router.get('/history', authUser, (_req, res) => {
  res.status(410).json(GONE);
});

router.post('/withdraw', authUser, (_req, res) => {
  res.status(410).json(GONE);
});

export default router;
