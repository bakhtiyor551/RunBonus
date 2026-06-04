import { Router } from 'express';
import { authAdmin } from '../middleware/auth.js';
import {
  getReportsDashboard,
  getReportsSales,
  getReportsWorkouts,
  getReportsBonuses,
  getReportsWithdrawals,
  getReportsClients,
  getReportsShoes,
  getReportsFinance,
  buildDailyTelegramReport,
} from '../services/reportsService.js';
import { sendTelegramMessage } from '../services/telegramService.js';

const router = Router();

router.get('/dashboard', authAdmin, async (req, res) => {
  try {
    res.json(await getReportsDashboard(req.query));
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Ошибка отчёта' });
  }
});

router.get('/sales', authAdmin, async (req, res) => {
  try {
    res.json(await getReportsSales(req.query));
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Ошибка отчёта' });
  }
});

router.get('/workouts', authAdmin, async (req, res) => {
  try {
    res.json(await getReportsWorkouts(req.query));
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Ошибка отчёта' });
  }
});

router.get('/bonuses', authAdmin, async (req, res) => {
  try {
    res.json(await getReportsBonuses(req.query));
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Ошибка отчёта' });
  }
});

router.get('/withdrawals', authAdmin, async (req, res) => {
  try {
    res.json(await getReportsWithdrawals(req.query));
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Ошибка отчёта' });
  }
});

router.get('/clients', authAdmin, async (req, res) => {
  try {
    res.json(await getReportsClients(req.query));
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Ошибка отчёта' });
  }
});

router.get('/shoes', authAdmin, async (req, res) => {
  try {
    res.json(await getReportsShoes(req.query));
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Ошибка отчёта' });
  }
});

router.get('/finance', authAdmin, async (req, res) => {
  try {
    res.json(await getReportsFinance(req.query));
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Ошибка отчёта' });
  }
});

router.post('/telegram/daily', authAdmin, async (_req, res) => {
  try {
    const text = await buildDailyTelegramReport();
    const msgId = await sendTelegramMessage(text);
    res.json({ ok: true, telegram_message_id: msgId });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Не удалось отправить отчёт' });
  }
});

export default router;
