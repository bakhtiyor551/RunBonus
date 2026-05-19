import { Router } from 'express';
import { pool } from '../db.js';
import { authAdmin } from '../middleware/auth.js';
import { requireSuperAdmin } from '../middleware/requireSuperAdmin.js';
import {
  getActiveBonusSettings,
  getBonusSettingsLog,
  updateBonusSettings,
} from '../services/bonusSettingsService.js';

const router = Router();

router.get('/bonus-settings', authAdmin, async (_req, res) => {
  try {
    const settings = await getActiveBonusSettings();
    const log = await getBonusSettingsLog(30);
    const canEdit = _req.adminRole === 'super_admin';
    res.json({ settings, log, can_edit: canEdit });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Ошибка загрузки настроек' });
  }
});

router.put('/bonus-settings', authAdmin, requireSuperAdmin, async (req, res) => {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const result = await updateBonusSettings(conn, req.body, req.adminId);
    await conn.commit();
    const log = await getBonusSettingsLog(30);
    res.json({
      settings: result.settings,
      changes: result.changes,
      log,
      message:
        result.changes.length > 0
          ? 'Настройки обновлены. Новые значения применяются только к новым тренировкам.'
          : 'Изменений нет',
    });
  } catch (err) {
    await conn.rollback();
    if (err.code === 'INVALID_VALUE') {
      return res.status(400).json({ error: 'Проверьте введённые значения' });
    }
    console.error(err);
    res.status(500).json({ error: 'Ошибка сохранения настроек' });
  } finally {
    conn.release();
  }
});

export default router;
