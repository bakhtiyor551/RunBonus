import { config } from '../config.js';

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

export function formatOrderTelegramMessage({ order, product }) {
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
      ? `Данные оплаты: ${escapeHtml(order.payment_details)}\n`
      : '') +
    (order.payment_receipt_url
      ? `Чек: ${escapeHtml(order.payment_receipt_url)}\n`
      : '') +
    `\n` +
    `Статус: Новый заказ\n` +
    `ID: #${order.id}`
  );
}
