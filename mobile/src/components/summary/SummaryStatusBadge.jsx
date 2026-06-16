const LABELS = {
  approved: 'Одобрено',
  pending: 'На проверке',
  rejected: 'Отклонено',
};

const CLASS = {
  approved: 'rb-summary-status--ok',
  pending: 'rb-summary-status--pending',
  rejected: 'rb-summary-status--bad',
};

export function summaryStatusLabel(status) {
  return LABELS[status] || status || '—';
}

export default function SummaryStatusBadge({ status }) {
  if (!status) return null;
  return <span className={`rb-summary-status ${CLASS[status] || ''}`}>{summaryStatusLabel(status)}</span>;
}
