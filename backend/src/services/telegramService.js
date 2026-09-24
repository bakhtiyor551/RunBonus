import fs from 'fs';
import path from 'path';
import { config } from '../config.js';
import { UPLOADS_ROOT } from '../utils/userProfile.js';

const STATUS_LABELS = {
  new: 'Новый заказ',
  confirmed: 'Подтверждён',
  paid: 'Оплачен',
  delivered: 'Доставлен',
  cancelled: 'Отменён',
  qr_issued: 'Кроссовки привязаны',
};

function escapeHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function orderStatusKeyboard(orderId, status) {
  const done = status === 'delivered' || status === 'cancelled';
  if (done) return undefined;
  return {
    inline_keyboard: [
      [
        {
          text: status === 'paid' || status === 'qr_issued' ? '✓ Оплачено' : 'Оплачено',
          callback_data: `ord:${orderId}:paid`,
        },
        {
          text: 'Доставлено',
          callback_data: `ord:${orderId}:delivered`,
        },
      ],
    ],
  };
}

export async function sendTelegramMessage(text, { replyMarkup } = {}) {
  const { botToken, chatId } = config.telegram;
  if (!botToken || !chatId) {
    console.warn('[Telegram] TELEGRAM_BOT_TOKEN или TELEGRAM_CHAT_ID не заданы');
    return null;
  }

  try {
    const body = {
      chat_id: chatId,
      text,
      parse_mode: 'HTML',
    };
    if (replyMarkup) body.reply_markup = replyMarkup;

    const res = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!data.ok) {
      console.error('[Telegram]', data.description);
      return null;
    }
    return String(data.result?.message_id ?? '');
  } catch (err) {
    console.error('[Telegram]', err.message);
    return null;
  }
}

export function formatOrderTelegramMessage(
  { order, product },
  { withReceiptNote = false, status } = {}
) {
  const model = product?.name || order.product_name;
  const statusKey = status || order.status || 'new';
  const statusText = STATUS_LABELS[statusKey] || statusKey;
  return (
    `🛒 <b>Новый заказ кроссовок RunBonus</b>\n\n` +
    `Клиент: ${escapeHtml(order.customer_name)}\n` +
    `Телефон: ${escapeHtml(order.phone)}\n` +
    `Модель: ${escapeHtml(model)}\n` +
    `Размер: ${escapeHtml(order.size || '—')}\n` +
    `Количество: ${order.quantity}\n` +
    `Цена: ${order.total_amount} сомони\n` +
    `Город: ${escapeHtml(order.city || '—')}\n` +
    `Доставка: ${escapeHtml(order.delivery_method_label || order.delivery_method || '—')}\n` +
    `Адрес: ${escapeHtml([order.city, order.address].filter(Boolean).join(', ') || '—')}\n` +
    (order.courier_name
      ? `Курьер: ${escapeHtml(order.courier_name)} · ${escapeHtml(order.courier_phone || '')}\n`
      : '') +
    `Комментарий: ${escapeHtml(order.comment || '—')}\n` +
    `Оплата: ${escapeHtml(order.payment_method_label || order.payment_method || '—')}${
      order.payment_method === 'bonus' ? ' ✓' : ''
    }\n` +
    (order.payment_details
      ? order.payment_method === 'mobile'
        ? `Реквизиты перевода:\n${escapeHtml(order.payment_details)}\n`
        : `Данные оплаты: ${escapeHtml(order.payment_details)}\n`
      : '') +
    (withReceiptNote && order.payment_receipt_url ? `📎 Чек оплаты — на фото ниже\n` : '') +
    `\n` +
    `Статус: <b>${escapeHtml(statusText)}</b>\n` +
    `ID: #${order.id}`
  );
}

/** Локальный файл чека или публичный HTTPS URL для Telegram. */
export function resolveReceiptPhotoSource(receiptUrl) {
  if (!receiptUrl) return null;
  if (/^https?:\/\//i.test(receiptUrl)) return receiptUrl;

  const rel = receiptUrl
    .replace(/^\/api\/uploads\//, '')
    .replace(/^\/uploads\//, '');
  const filePath = path.join(UPLOADS_ROOT, rel);
  if (fs.existsSync(filePath)) return filePath;

  if (config.publicApiUrl && receiptUrl.startsWith('/')) {
    return `${config.publicApiUrl}${receiptUrl}`;
  }
  return null;
}

/** Отправка фото чека (файл с диска или URL). */
export async function sendTelegramPhoto(photoSource, caption = '', { replyMarkup } = {}) {
  const { botToken, chatId } = config.telegram;
  if (!botToken || !chatId || !photoSource) return null;

  const cap = caption ? String(caption).slice(0, 1024) : undefined;

  try {
    let res;

    if (typeof photoSource === 'string' && /^https?:\/\//i.test(photoSource)) {
      const body = {
        chat_id: chatId,
        photo: photoSource,
        caption: cap,
        parse_mode: 'HTML',
      };
      if (replyMarkup) body.reply_markup = replyMarkup;
      res = await fetch(`https://api.telegram.org/bot${botToken}/sendPhoto`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
    } else if (typeof photoSource === 'string' && fs.existsSync(photoSource)) {
      const ext = path.extname(photoSource).toLowerCase();
      const mime =
        ext === '.png' ? 'image/png' : ext === '.webp' ? 'image/webp' : 'image/jpeg';
      const form = new FormData();
      form.append('chat_id', chatId);
      form.append('photo', new Blob([fs.readFileSync(photoSource)], { type: mime }), path.basename(photoSource));
      if (cap) {
        form.append('caption', cap);
        form.append('parse_mode', 'HTML');
      }
      if (replyMarkup) {
        form.append('reply_markup', JSON.stringify(replyMarkup));
      }
      res = await fetch(`https://api.telegram.org/bot${botToken}/sendPhoto`, {
        method: 'POST',
        body: form,
      });
    } else {
      return null;
    }

    const data = await res.json();
    if (!data.ok) {
      console.error('[Telegram sendPhoto]', data.description);
      return null;
    }
    return String(data.result?.message_id ?? '');
  } catch (err) {
    console.error('[Telegram sendPhoto]', err.message);
    return null;
  }
}

/** Заказ в Telegram: текст + фото чека + кнопки статуса. */
export async function notifyOrderToTelegram({ order, product }) {
  const photo = resolveReceiptPhotoSource(order.payment_receipt_url);
  const text = formatOrderTelegramMessage({ order, product }, { withReceiptNote: !!photo });
  const replyMarkup = orderStatusKeyboard(order.id, order.status || 'new');

  if (photo) {
    const sent = await sendTelegramPhoto(photo, text, { replyMarkup });
    if (sent) return sent;
    console.warn('[Telegram] Не удалось отправить фото чека, отправляем только текст');
  }

  return sendTelegramMessage(
    formatOrderTelegramMessage({ order, product }) +
      (order.payment_receipt_url && !photo
        ? `\nЧек (файл недоступен): ${escapeHtml(order.payment_receipt_url)}`
        : ''),
    { replyMarkup }
  );
}

async function telegramApi(method, payload) {
  const { botToken } = config.telegram;
  if (!botToken) return null;
  try {
    const res = await fetch(`https://api.telegram.org/bot${botToken}/${method}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!data.ok) {
      console.error(`[Telegram ${method}]`, data.description);
      return null;
    }
    return data.result;
  } catch (err) {
    console.error(`[Telegram ${method}]`, err.message);
    return null;
  }
}

export async function answerTelegramCallback(callbackQueryId, text, { showAlert = false } = {}) {
  return telegramApi('answerCallbackQuery', {
    callback_query_id: callbackQueryId,
    text: text ? String(text).slice(0, 200) : undefined,
    show_alert: Boolean(showAlert),
  });
}

export async function editTelegramOrderMessage(message, order) {
  if (!message?.chat?.id || !message.message_id) return null;
  const text = formatOrderTelegramMessage(
    { order, product: { name: order.product_name } },
    { withReceiptNote: Boolean(message.photo?.length && order.payment_receipt_url), status: order.status }
  );
  const replyMarkup = orderStatusKeyboard(order.id, order.status);
  const payload = {
    chat_id: message.chat.id,
    message_id: message.message_id,
    parse_mode: 'HTML',
    reply_markup: replyMarkup || { inline_keyboard: [] },
  };

  if (message.photo?.length) {
    return telegramApi('editMessageCaption', {
      ...payload,
      caption: text.slice(0, 1024),
    });
  }
  return telegramApi('editMessageText', {
    ...payload,
    text,
  });
}

/** Обработка нажатий кнопок «Оплачено» / «Доставлено». */
export async function handleTelegramCallbackQuery(callbackQuery) {
  const data = String(callbackQuery?.data || '');
  const match = data.match(/^ord:(\d+):(paid|delivered)$/);
  if (!match) return false;

  const orderId = Number(match[1]);
  const status = match[2];
  const chatId = String(callbackQuery.message?.chat?.id || '');
  const expectedChat = String(config.telegram.chatId || '');

  if (expectedChat && chatId && chatId !== expectedChat) {
    await answerTelegramCallback(callbackQuery.id, 'Нет доступа', { showAlert: true });
    return true;
  }

  try {
    const { updateOrderStatus, statusLabel } = await import('./orderService.js');
    const order = await updateOrderStatus(orderId, status);
    const label = statusLabel(status);
    await answerTelegramCallback(callbackQuery.id, `Статус: ${label}`);
    if (callbackQuery.message) {
      await editTelegramOrderMessage(callbackQuery.message, order);
    }
  } catch (err) {
    console.error('[Telegram callback]', err.message);
    await answerTelegramCallback(callbackQuery.id, err.message || 'Ошибка', { showAlert: true });
  }
  return true;
}

/** Зарегистрировать webhook на публичный URL API. */
export async function ensureTelegramWebhook() {
  const { botToken } = config.telegram;
  const base = config.publicApiUrl;
  if (!botToken || !base) {
    console.warn('[Telegram] webhook пропущен: нет botToken или PUBLIC_API_URL');
    return null;
  }
  const url = `${base}/api/telegram/webhook`;
  const secret = (process.env.TELEGRAM_WEBHOOK_SECRET || '').trim();
  const payload = { url, allowed_updates: ['callback_query'] };
  if (secret) payload.secret_token = secret;

  const result = await telegramApi('setWebhook', payload);
  if (result) console.log(`[Telegram] webhook: ${url}`);
  return result;
}
