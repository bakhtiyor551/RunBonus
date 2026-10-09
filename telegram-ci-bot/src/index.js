import { config } from './config.js';
import { getJobStatus, triggerBuild, waitForBuildStart } from './jenkins.js';
import {
  answerCallbackQuery,
  buildKeyboard,
  deleteWebhook,
  getUpdates,
  isAllowedChat,
  sendMessage,
} from './telegram.js';

const BUILD_BUTTON = '▶ Собрать сейчас';
let offset = 0;
let triggering = false;

function log(...args) {
  console.log(new Date().toISOString(), ...args);
}

async function handleStart(chatId) {
  await sendMessage(
    chatId,
    'RunBonus CI/CD\n\nНажмите кнопку, чтобы запустить Jenkins Pipeline (build → migrate → deploy → health).',
    { reply_markup: buildKeyboard() },
  );
}

async function handleBuildRequest(chatId) {
  if (!isAllowedChat(chatId)) {
    await sendMessage(chatId, '❌ Доступ запрещён. Ваш chat id не в списке разрешённых.');
    return;
  }

  if (triggering) {
    await sendMessage(chatId, '⏳ Запрос уже обрабатывается. Подождите.');
    return;
  }

  triggering = true;
  try {
    const before = await getJobStatus();
    if (before.building || before.inQueue) {
      const n = before.lastBuild?.number ? `#${before.lastBuild.number}` : '';
      await sendMessage(
        chatId,
        `⏳ Сборка уже выполняется${n ? ` (${n})` : ''}. Повторный запуск заблокирован.`,
      );
      return;
    }

    await sendMessage(chatId, '🚀 Запускаю Jenkins Pipeline…');
    const { queueUrl } = await triggerBuild();
    const started = await waitForBuildStart(before.lastBuild?.number);
    const num = started.lastBuild?.number;
    const url = started.lastBuild?.url || queueUrl || '';

    await sendMessage(
      chatId,
      [
        '✅ Сборка поставлена в очередь / запущена.',
        num ? `Build: #${num}` : null,
        `Job: ${config.jenkinsJobPath}`,
        url || null,
        '',
        'Этапы придут отдельными сообщениями (⏳ / ✅ / ❌).',
      ]
        .filter(Boolean)
        .join('\n'),
      { reply_markup: buildKeyboard() },
    );
  } catch (err) {
    log('build error', err.message);
    await sendMessage(chatId, `❌ Не удалось запустить сборку:\n${err.message}`, {
      reply_markup: buildKeyboard(),
    });
  } finally {
    triggering = false;
  }
}

async function onUpdate(update) {
  if (update.callback_query) {
    const cq = update.callback_query;
    const chatId = cq.message?.chat?.id;
    const data = cq.data || '';
    if (chatId != null) {
      try {
        await answerCallbackQuery(cq.id, 'OK');
      } catch {
        /* ignore */
      }
      if (data === 'build_now' || data === BUILD_BUTTON) {
        await handleBuildRequest(chatId);
      }
    }
    return;
  }

  const msg = update.message;
  if (!msg?.chat?.id) return;
  const chatId = msg.chat.id;
  const text = (msg.text || '').trim();

  if (text === '/start' || text.startsWith('/start ')) {
    if (!isAllowedChat(chatId)) {
      await sendMessage(
        chatId,
        `❌ Доступ запрещён.\nВаш chat id: ${chatId}`,
      );
      return;
    }
    await handleStart(chatId);
    return;
  }

  if (text === BUILD_BUTTON || text === '/build' || text === '/deploy') {
    await handleBuildRequest(chatId);
  }
}

async function loop() {
  await deleteWebhook();
  log(`telegram-ci-bot started; job=${config.jenkinsJobPath}; jenkins=${config.jenkinsUrl}`);

  for (;;) {
    try {
      const updates = await getUpdates(offset, config.pollSeconds);
      for (const u of updates) {
        offset = u.update_id + 1;
        try {
          await onUpdate(u);
        } catch (err) {
          log('update error', err.message);
        }
      }
    } catch (err) {
      log('poll error', err.message);
      await new Promise((r) => setTimeout(r, 3000));
    }
  }
}

loop().catch((err) => {
  console.error(err);
  process.exit(1);
});
