import { Router } from 'express';
import { authAdmin } from '../middleware/auth.js';
import {
  adminListLevels,
  adminSaveLevel,
  adminListClaims,
  adminUpdateClaimStatus,
} from '../services/challengeService.js';

const router = Router();

router.get('/levels', authAdmin, async (_req, res) => {
  try {
    res.json(await adminListLevels());
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Не удалось загрузить уровни' });
  }
});

router.post('/levels', authAdmin, async (req, res) => {
  try {
    const levels = await adminSaveLevel(req.body);
    res.json(levels);
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    console.error(err);
    res.status(500).json({ error: 'Не удалось сохранить уровень' });
  }
});

router.put('/levels/:id', authAdmin, async (req, res) => {
  try {
    const levels = await adminSaveLevel({ ...req.body, id: req.params.id });
    res.json(levels);
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    console.error(err);
    res.status(500).json({ error: 'Не удалось сохранить уровень' });
  }
});

router.get('/claims', authAdmin, async (req, res) => {
  try {
    res.json(await adminListClaims({ status: req.query.status }));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Не удалось загрузить заявки' });
  }
});

router.patch('/claims/:id', authAdmin, async (req, res) => {
  try {
    const list = await adminUpdateClaimStatus(
      req.params.id,
      req.body.status,
      req.body.admin_comment ?? req.body.adminComment
    );
    res.json(list);
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    console.error(err);
    res.status(500).json({ error: 'Не удалось обновить статус' });
  }
});

export default router;
