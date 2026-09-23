import { Router } from 'express';
import { authUser } from '../middleware/auth.js';

const router = Router();

/** Legacy money summary — replaced by rewards progress. */
router.get('/summary', authUser, (_req, res) => {
  res.status(410).json({
    error: 'Сводка с заработком отключена. Используйте /api/rewards/progress',
    code: 'SUMMARY_DEPRECATED',
  });
});

export default router;
