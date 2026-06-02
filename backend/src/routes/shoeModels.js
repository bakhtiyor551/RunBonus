import { Router } from 'express';
import {
  listShoeModels,
  getShoeModelById,
  getShoeModelBySlug,
  getShoeModelArFiles,
} from '../services/shoeModelService.js';

const router = Router();

/** GET /api/shoe-models — список AR-моделей */
router.get('/', async (req, res) => {
  try {
    const models = await listShoeModels(req);
    res.json(models);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Ошибка загрузки моделей' });
  }
});

/** GET /api/shoe-models/slug/:slug — по slug (urban-sprint) */
router.get('/slug/:slug', async (req, res) => {
  try {
    const model = await getShoeModelBySlug(req.params.slug, req);
    if (!model) return res.status(404).json({ error: 'Модель не найдена' });
    res.json(model);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Ошибка' });
  }
});

/** GET /api/shoe-models/:id/ar?variant=night-pulse */
router.get('/:id/ar', async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ error: 'Некорректный id' });
    const ar = await getShoeModelArFiles(id, req.query.variant, req);
    if (!ar) return res.status(404).json({ error: 'Модель не найдена' });
    res.json(ar);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Ошибка' });
  }
});

/** GET /api/shoe-models/:id */
router.get('/:id', async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ error: 'Некорректный id' });
    const model = await getShoeModelById(id, req);
    if (!model) return res.status(404).json({ error: 'Модель не найдена' });
    res.json(model);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Ошибка' });
  }
});

export default router;
