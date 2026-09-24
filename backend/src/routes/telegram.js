import { Router } from 'express';
import { handleTelegramCallbackQuery } from '../services/telegramService.js';

const router = Router();

/** Telegram Bot API webhook (кнопки статуса заказа). */
router.post('/webhook', async (req, res) => {
  const secret = (process.env.TELEGRAM_WEBHOOK_SECRET || '').trim();
  if (secret) {
    const header = req.get('X-Telegram-Bot-Api-Secret-Token') || '';
    if (header !== secret) {
      return res.status(403).json({ ok: false });
    }
  }

  // Всегда отвечаем 200 быстро, чтобы Telegram не ретраил
  res.json({ ok: true });

  try {
    const update = req.body;
    if (update?.callback_query) {
      await handleTelegramCallbackQuery(update.callback_query);
    }
  } catch (err) {
    console.error('[telegram/webhook]', err.message);
  }
});

export default router;
