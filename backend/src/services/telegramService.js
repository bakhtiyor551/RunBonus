import fs from 'fs';
import path from 'path';
import { config } from '../config.js';
import { UPLOADS_ROOT } from '../utils/userProfile.js';

export async function sendTelegramMessage(text) {
  const { botToken, chatId } = config.telegram;
  if (!botToken || !chatId) {
    console.warn('[Telegram] TELEGRAM_BOT_TOKEN или TELEGRAM_CHAT_ID не заданы');
    return null;
  }

  try {
    const res = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: 'HTML',
      }),
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

export function formatWithdrawalTelegramMessage({ user, request, method, balance, available }) {
  const date = new Date(request.created_at).toLocaleString('ru-RU');
  const availableLine =
    available != null ? `\nДоступно после заявки: ${available} сомони` : '';
  return (
    `🔔 <b>Новая заявка на вывод средств</b>\n\n` +
    `Клиент: ${escapeHtml(user.name)}\n` +
    `Телефон: ${escapeHtml(user.phone)}\n` +
    `Кошелёк: ${escapeHtml(method.name)}\n` +
    `Номер: ${escapeHtml(request.wallet_number)}\n` +
    `Сумма: ${request.amount} сомони\n` +
    `Баланс клиента: ${balance} сомони${availableLine}\n` +
    `Дата: ${date}\n\n` +
    `Статус: Ожидает обработки\n` +
    `ID: #${request.id}`
  );
}

function escapeHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

export function formatOrderTelegramMessage({ order, product }, { withReceiptNote = false } = {}) {
  const model = product?.name || order.product_name;
  return (
    `🛒 <b>Новый заказ кроссовок RunBonus</b>\n\n` +
    `Клиент: ${escapeHtml(order.customer_name)}\n` +
    `Телефон: ${escapeHtml(order.phone)}\n` +
    `Модель: ${escapeHtml(model)}\n` +
    `Размер: ${escapeHtml(order.size || '—')}\n` +
    `Количество: ${order.quantity}\n` +
    `Цена: ${order.total_amount} сомони\n` +
    `Город: ${escapeHtml(order.city || '—')}\n` +
    `Адрес: ${escapeHtml(order.address || '—')}\n` +
    `Комментарий: ${escapeHtml(order.comment || '—')}\n` +
    `Оплата: ${escapeHtml(order.payment_method_label || order.payment_method || '—')}\n` +
    (order.payment_details
      ? `Кошелёк клиента: ${escapeHtml(order.payment_details)}\n`
      : '') +
    (withReceiptNote && order.payment_receipt_url ? `📎 Чек оплаты — на фото ниже\n` : '') +
    `\n` +
    `Статус: Новый заказ\n` +
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
export async function sendTelegramPhoto(photoSource, caption = '') {
  const { botToken, chatId } = config.telegram;
  if (!botToken || !chatId || !photoSource) return null;

  const cap = caption ? String(caption).slice(0, 1024) : undefined;

  try {
    let res;

    if (typeof photoSource === 'string' && /^https?:\/\//i.test(photoSource)) {
      res = await fetch(`https://api.telegram.org/bot${botToken}/sendPhoto`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId,
          photo: photoSource,
          caption: cap,
          parse_mode: 'HTML',
        }),
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

/** Заказ в Telegram: текст + фото чека при мобильном переводе. */
export async function notifyOrderToTelegram({ order, product }) {
  const photo = resolveReceiptPhotoSource(order.payment_receipt_url);
  const text = formatOrderTelegramMessage({ order, product }, { withReceiptNote: !!photo });

  if (photo) {
    const sent = await sendTelegramPhoto(photo, text);
    if (sent) return sent;
    console.warn('[Telegram] Не удалось отправить фото чека, отправляем только текст');
  }

  return sendTelegramMessage(
    formatOrderTelegramMessage({ order, product }) +
      (order.payment_receipt_url && !photo
        ? `\nЧек (файл недоступен): ${escapeHtml(order.payment_receipt_url)}`
        : '')
  );
}
