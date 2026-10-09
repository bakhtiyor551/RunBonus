import { config } from './config.js';

const API = () => `https://api.telegram.org/bot${config.telegramBotToken}`;

async function call(method, body) {
  const res = await fetch(`${API()}/${method}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.ok === false) {
    const desc = data.description || res.statusText;
    throw new Error(`Telegram ${method}: ${desc}`);
  }
  return data.result;
}

export async function deleteWebhook() {
  return call('deleteWebhook', { drop_pending_updates: false });
}

export async function getUpdates(offset, timeout) {
  const res = await fetch(
    `${API()}/getUpdates?offset=${offset}&timeout=${timeout}&allowed_updates=${encodeURIComponent(JSON.stringify(['message', 'callback_query']))}`,
  );
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.ok === false) {
    throw new Error(`Telegram getUpdates: ${data.description || res.statusText}`);
  }
  return data.result || [];
}

export function buildKeyboard() {
  return {
    keyboard: [[{ text: '▶ Собрать сейчас' }]],
    resize_keyboard: true,
    is_persistent: true,
  };
}

export async function sendMessage(chatId, text, extra = {}) {
  return call('sendMessage', {
    chat_id: chatId,
    text,
    disable_web_page_preview: true,
    ...extra,
  });
}

export async function answerCallbackQuery(id, text) {
  return call('answerCallbackQuery', {
    callback_query_id: id,
    text: text || '',
    show_alert: false,
  });
}

export function isAllowedChat(chatId) {
  return config.allowedChatIds.has(String(chatId));
}
