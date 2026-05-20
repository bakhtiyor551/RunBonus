export function formatNumber(n, opts = {}) {
  if (n == null || Number.isNaN(Number(n))) return '—';
  return new Intl.NumberFormat('ru-RU', opts).format(Number(n));
}

export function formatMoney(n, currency = 'TJS') {
  if (n == null || Number.isNaN(Number(n))) return '—';
  const value = Number(n);
  try {
    return new Intl.NumberFormat('ru-RU', {
      style: 'currency',
      currency,
      maximumFractionDigits: 2,
    }).format(value);
  } catch {
    return `${value.toLocaleString('ru-RU', { maximumFractionDigits: 2 })} ${currency}`;
  }
}

export function timeAgo(dateStr) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'только что';
  if (mins < 60) return `${mins} мин назад`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs} ч назад`;
  return new Date(dateStr).toLocaleDateString('ru');
}
