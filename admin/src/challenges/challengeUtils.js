export const emptyLevel = {
  id: null,
  level_num: '',
  name: '',
  target_km: '',
  deadline_days: '',
  description: '',
  example_reward: '',
  sort_order: '10',
  status: 'active',
  reward_ids: [],
};

export const CLAIM_STATUSES = [
  { id: 'CLAIMED', label: 'Заявка' },
  { id: 'PROCESSING', label: 'В работе' },
  { id: 'READY', label: 'Готово' },
  { id: 'DELIVERED', label: 'Выдано' },
  { id: 'CANCELLED', label: 'Отмена' },
];

export const CLAIM_FILTER_PRESETS = [
  { id: 'open', label: 'Открытые' },
  { id: '', label: 'Все' },
  ...CLAIM_STATUSES.map((s) => ({ id: s.id, label: s.label })),
];

export const TYPE_LABELS = {
  PRODUCT: 'Товар',
  DISCOUNT: 'Скидка',
  SPECIAL: 'Special',
  VIP: 'VIP',
};

export function claimTone(status) {
  if (status === 'DELIVERED') return 'ok';
  if (status === 'CANCELLED') return 'bad';
  if (status === 'READY') return 'ready';
  if (status === 'PROCESSING') return 'busy';
  return 'new';
}

export function formatKm(value) {
  return (Number(value) || 0).toLocaleString('ru-RU', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });
}

export function formatDateTime(value) {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('ru-RU', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function sortLevels(levels) {
  return [...levels].sort(
    (a, b) => (Number(a.sort_order) || 0) - (Number(b.sort_order) || 0) || a.level_num - b.level_num
  );
}

export function isOpenClaim(status) {
  return !['DELIVERED', 'CANCELLED'].includes(status);
}
