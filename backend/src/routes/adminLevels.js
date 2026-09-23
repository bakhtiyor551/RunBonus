import { Router } from 'express';
import { authAdmin } from '../middleware/auth.js';
import {
  listAllLevels,
  createLevel,
  updateLevel,
  setLevelActive,
} from '../services/levelService.js';

const router = Router();

router.get('/levels', authAdmin, async (_req, res) => {
  try {
    res.json(await listAllLevels());
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Ошибка загрузки уровней' });
  }
});

router.post('/levels', authAdmin, async (req, res) => {
  try {
    if (!req.body?.name || req.body.level_number == null && req.body.level == null) {
      return res.status(400).json({ error: 'Укажите name и level_number' });
    }
    const row = await createLevel(req.body);
    res.status(201).json(row);
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ error: 'Номер уровня уже существует' });
    }
    console.error(err);
    res.status(500).json({ error: 'Ошибка создания уровня' });
  }
});

router.put('/levels/:id', authAdmin, async (req, res) => {
  try {
    const row = await updateLevel(Number(req.params.id), req.body);
    if (!row) return res.status(404).json({ error: 'Не найден' });
    res.json(row);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Ошибка сохранения уровня' });
  }
});

router.patch('/levels/:id/status', authAdmin, async (req, res) => {
  try {
    const active = req.body?.active !== false && req.body?.active !== 0;
    const row = await setLevelActive(Number(req.params.id), active);
    if (!row) return res.status(404).json({ error: 'Не найден' });
    res.json(row);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Ошибка статуса' });
  }
});

export default router;
