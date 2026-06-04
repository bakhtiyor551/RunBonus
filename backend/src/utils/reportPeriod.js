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

function fmt(d) {
  return d.toISOString().slice(0, 19).replace('T', ' ');
}

export function parseReportPeriod(query = {}) {
  const now = new Date();
  const preset = query.preset || '30d';
  let from;
  let to = endOfDay(now);
  let label = '30 дней';

  if (query.from && query.to) {
    from = startOfDay(new Date(query.from));
    to = endOfDay(new Date(query.to));
    label = `${query.from} — ${query.to}`;
    return { from: fmt(from), to: fmt(to), preset: 'custom', label };
  }

  switch (preset) {
    case 'today':
      from = startOfDay(now);
      label = 'Сегодня';
      break;
    case 'yesterday': {
      const y = new Date(now);
      y.setDate(y.getDate() - 1);
      from = startOfDay(y);
      to = endOfDay(y);
      label = 'Вчера';
      break;
    }
    case '7d':
      from = startOfDay(new Date(now.getTime() - 6 * 86400000));
      label = '7 дней';
      break;
    case 'this_month':
      from = startOfDay(new Date(now.getFullYear(), now.getMonth(), 1));
      label = 'Этот месяц';
      break;
    case 'last_month': {
      from = startOfDay(new Date(now.getFullYear(), now.getMonth() - 1, 1));
      to = endOfDay(new Date(now.getFullYear(), now.getMonth(), 0));
      label = 'Прошлый месяц';
      break;
    }
    case 'year':
      from = startOfDay(new Date(now.getFullYear(), 0, 1));
      label = 'Этот год';
      break;
    case 'all':
      from = startOfDay(new Date(2020, 0, 1));
      label = 'Всё время';
      break;
    case '30d':
    default:
      from = startOfDay(new Date(now.getTime() - 29 * 86400000));
      label = '30 дней';
      break;
  }

  return { from: fmt(from), to: fmt(to), preset, label };
}

export function groupBySql(groupBy) {
  if (groupBy === 'week') return `%Y-%u`;
  if (groupBy === 'month') return `%Y-%m`;
  return `%Y-%m-%d`;
}
