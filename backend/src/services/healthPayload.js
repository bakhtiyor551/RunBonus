export function summarizeHealth({ database, redis }) {
  const redisOk = redis === 'ok' || redis === 'skipped';
  const ok = database === 'ok' && redisOk;
  return {
    status: ok ? 'ok' : 'error',
    service: 'runbonus-api',
    database,
    redis,
    ok,
  };
}
