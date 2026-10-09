function required(name) {
  const v = (process.env[name] || '').trim();
  if (!v) throw new Error(`Missing required env: ${name}`);
  return v;
}

function list(name) {
  return (process.env[name] || '')
    .split(/[,;\s]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

const allowed = list('TELEGRAM_ALLOWED_CHAT_IDS');
const fallbackChat = list('TELEGRAM_CHAT_ID');

export const config = {
  telegramBotToken: required('TELEGRAM_BOT_TOKEN'),
  allowedChatIds: new Set(allowed.length ? allowed : fallbackChat),
  jenkinsUrl: (process.env.JENKINS_URL || 'http://127.0.0.1:8080').replace(/\/+$/, ''),
  jenkinsUser: required('JENKINS_USER'),
  jenkinsToken: required('JENKINS_API_TOKEN'),
  /** Multibranch: RunBonus/master  |  Freestyle: RunBonus_master */
  jenkinsJobPath: (process.env.JENKINS_JOB_PATH || 'RunBonus/master').replace(/^\/+|\/+$/g, ''),
  pollSeconds: Number(process.env.TELEGRAM_POLL_SECONDS || 25),
};

if (config.allowedChatIds.size === 0) {
  throw new Error('Set TELEGRAM_ALLOWED_CHAT_IDS or TELEGRAM_CHAT_ID');
}
