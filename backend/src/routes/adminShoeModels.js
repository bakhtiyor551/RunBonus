import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import { authAdmin } from '../middleware/auth.js';
import {
  adminListShoeModels,
  adminSaveShoeModel,
  ensureModelsDir,
  MODELS_ROOT,
} from '../services/shoeModelService.js';
import { pool } from '../db.js';

ensureModelsDir();

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    ensureModelsDir();
    cb(null, MODELS_ROOT);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const base = (req.body.filename || file.originalname.replace(ext, ''))
      .replace(/[^a-zA-Z0-9-_]/g, '-')
      .toLowerCase();
    cb(null, `${base}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ok = ['.glb', '.usdz', '.gltf'].includes(path.extname(file.originalname).toLowerCase());
    cb(ok ? null : new Error('Только .glb, .usdz, .gltf'), ok);
  },
});

const router = Router();

router.get('/', authAdmin, async (_req, res) => {
  try {
    res.json(await adminListShoeModels());
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Ошибка' });
  }
});

router.post('/', authAdmin, async (req, res) => {
  try {
    const model = await adminSaveShoeModel(req.body);
    res.status(201).json(model);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message || 'Ошибка сохранения' });
  }
});

router.put('/:id', authAdmin, async (req, res) => {
  try {
    const model = await adminSaveShoeModel(req.body, Number(req.params.id));
    res.json(model);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message || 'Ошибка сохранения' });
  }
});

router.delete('/:id', authAdmin, async (req, res) => {
  try {
    await pool.query(`UPDATE shoe_models SET status = 'inactive' WHERE id = ?`, [req.params.id]);
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Ошибка' });
  }
});

router.post('/upload', authAdmin, upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Файл не загружен' });
  const url = `/models/${req.file.filename}`;
  res.json({ url, filename: req.file.filename, size: req.file.size });
});

export default router;
