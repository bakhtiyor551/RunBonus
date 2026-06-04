import { Router } from 'express';
import { authAdmin } from '../middleware/auth.js';
import {
  getDashboardReport,
  getSalesReport,
  getWorkoutsReport,
  getBonusesReport,
  getWithdrawalsReport,
  getClientsReport,
  getShoesReport,
  getFinanceReport,
  buildDailyTelegramReport,
} from '../services/reportsService.js';
import { sendTelegramMessage } from '../services/telegramService.js';

const router = Router();

function periodQuery(req) {
  return {
    preset: req.query.preset,
    from: req.query.from,
    to: req.query.to,
    groupBy: req.query.groupBy || 'day',
  };
}

router.get('/dashboard', authAdmin, async (req, res) => {
  try {
    res.json(await getDashboardReport(periodQuery(req)));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Ошибка отчёта' });
  }
});

router.get('/sales', authAdmin, async (req, res) => {
  try {
    res.json(await getSalesReport(periodQuery(req)));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Ошибка отчёта' });
  }
});

router.get('/workouts', authAdmin, async (req, res) => {
  try {
    res.json(await getWorkoutsReport(periodQuery(req)));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Ошибка отчёта' });
  }
});

router.get('/bonuses', authAdmin, async (req, res) => {
  try {
    res.json(await getBonusesReport(periodQuery(req)));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Ошибка отчёта' });
  }
});

router.get('/withdrawals', authAdmin, async (req, res) => {
  try {
    res.json(await getWithdrawalsReport(periodQuery(req)));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Ошибка отчёта' });
  }
});

router.get('/clients', authAdmin, async (req, res) => {
  try {
    res.json(await getClientsReport(periodQuery(req)));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Ошибка отчёта' });
  }
});

router.get('/shoes', authAdmin, async (req, res) => {
  try {
    res.json(await getShoesReport(periodQuery(req)));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Ошибка отчёта' });
  }
});

router.get('/finance', authAdmin, async (req, res) => {
  try {
    res.json(await getFinanceReport(periodQuery(req)));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Ошибка отчёта' });
  }
});

router.post('/telegram/daily', authAdmin, async (_req, res) => {
  try {
    const text = await buildDailyTelegramReport();
    const messageId = await sendTelegramMessage(text);
    if (!messageId) return res.status(503).json({ error: 'Telegram не настроен' });
    res.json({ ok: true, message: 'Отчёт отправлен в Telegram' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Ошибка отправки' });
  }
});

export default router;
