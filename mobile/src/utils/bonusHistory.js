export function getOperationMeta(type) {
  const map = {
    earn: { title: 'Начисление', icon: 'trending_up', sign: '+', positive: true },
    spend: { title: 'Списание', icon: 'payments', sign: '−', positive: false },
    withdraw_hold: { title: 'Заморозка на вывод', icon: 'south_west', sign: '−', positive: false },
    withdraw_success: { title: 'Вывод средств', icon: 'south_west', sign: '−', positive: false },
    withdraw_reject: { title: 'Отмена вывода', icon: 'undo', sign: '+', positive: true },
  };
  return map[type] || { title: 'Операция', icon: 'receipt_long', sign: '', positive: false };
}

export function formatOperationDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('ru', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function formatOperationDateShort(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleString('ru');
}
