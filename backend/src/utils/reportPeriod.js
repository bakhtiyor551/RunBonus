/** Парсинг периода для отчётов (?period=today|7d|30d|month|year|custom&from=&to=). */
export function parseReportPeriod(query = {}) {
  const preset = String(query.period || query.preset || '30d').toLowerCase();
  const now = new Date();
  const end = query.to ? endOfDay(new Date(query.to)) : endOfDay(now);
  let start;

  switch (preset) {
    case 'today':
      start = startOfDay(now);
      break;
    case 'yesterday': {
      const d = new Date(now);
      d.setDate(d.getDate() - 1);
      start = startOfDay(d);
      return { preset, start, end: endOfDay(d) };
    }
    case '7d':
      start = new Date(end);
      start.setDate(start.getDate() - 6);
      start = startOfDay(start);
      break;
    case '30d':
      start = new Date(end);
      start.setDate(start.getDate() - 29);
      start = startOfDay(start);
      break;
    case 'month':
    case 'this_month':
      start = new Date(end.getFullYear(), end.getMonth(), 1);
      break;
    case 'last_month': {
      start = new Date(end.getFullYear(), end.getMonth() - 1, 1);
      const lastEnd = new Date(end.getFullYear(), end.getMonth(), 0, 23, 59, 59, 999);
      return { preset, start, end: lastEnd };
    }
    case 'year':
      start = new Date(end.getFullYear(), 0, 1);
      break;
    case 'custom':
      start = query.from ? startOfDay(new Date(query.from)) : startOfDay(now);
      break;
    default:
      start = new Date(end);
      start.setDate(start.getDate() - 29);
      start = startOfDay(start);
  }

  return { preset, start, end };
}

function startOfDay(d) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function endOfDay(d) {
  const x = new Date(d);
  x.setHours(23, 59, 59, 999);
  return x;
}

export function sqlBetween(column, start, end) {
  return {
    clause: `${column} >= ? AND ${column} <= ?`,
    params: [start, end],
  };
}
