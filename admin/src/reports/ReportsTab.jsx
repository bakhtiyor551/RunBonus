import { useCallback, useEffect, useState } from 'react';
import { adminApi } from '../api';
import { formatMoney, formatNumber } from '../utils/format';
import ReportPeriodFilter from './ReportPeriodFilter';
import { downloadCsv, periodQuery, SimpleLineChart } from './reportUtils';

const SECTIONS = [
  { id: 'dashboard', label: 'Общий отчёт', path: 'dashboard' },
  { id: 'sales', label: 'Продажи', path: 'sales' },
  { id: 'workouts', label: 'Тренировки', path: 'workouts' },
  { id: 'bonuses', label: 'Бонусы', path: 'bonuses' },
  { id: 'withdrawals', label: 'Вывод средств', path: 'withdrawals' },
  { id: 'clients', label: 'Клиенты', path: 'clients' },
  { id: 'shoes', label: 'Кроссовки', path: 'shoes' },
  { id: 'finance', label: 'Финансы', path: 'finance' },
];

function StatGrid({ items }) {
  return (
    <div className="bento-grid bento-grid--stats report-stat-grid">
      {items.map((item) => (
        <div key={item.label} className="glass-card stat-card">
          <p className="stat-card__label">{item.label}</p>
          <h3 className="stat-card__value stat-card__value--accent">{item.value}</h3>
        </div>
      ))}
    </div>
  );
}

export default function ReportsTab() {
  const [section, setSection] = useState('dashboard');
  const [period, setPeriod] = useState('30d');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const sec = SECTIONS.find((s) => s.id === section);
    try {
      const json = await adminApi(`/api/admin/reports/${sec.path}?${periodQuery(period)}`);
      setData(json);
    } catch {
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [section, period]);

  useEffect(() => {
    load();
  }, [load]);

  const sendTelegram = async () => {
    await adminApi('/api/admin/reports/telegram/daily', { method: 'POST' });
    alert('Отчёт отправлен в Telegram (если бот настроен)');
  };

  const exportSalesCsv = () => {
    if (!data?.rows) return;
    downloadCsv('sales.csv', data.rows, [
      { key: 'created_at', label: 'Дата' },
      { key: 'model_name', label: 'Модель' },
      { key: 'size', label: 'Размер' },
      { key: 'quantity', label: 'Кол-во' },
      { key: 'total_amount', label: 'Сумма' },
      { key: 'status', label: 'Статус' },
    ]);
  };

  const renderBody = () => {
    if (loading) return <p className="hint">Загрузка…</p>;
    if (!data) return <p className="hint">Не удалось загрузить отчёт</p>;

    if (section === 'dashboard') {
      const c = data.cards || {};
      return (
        <>
          <StatGrid
            items={[
              { label: 'Всего клиентов', value: formatNumber(c.total_clients) },
              { label: 'Активных', value: formatNumber(c.active_clients) },
              { label: 'Продано пар', value: formatNumber(c.shoes_sold_pairs) },
              { label: 'Километров', value: `${formatNumber(c.total_km)} км` },
              { label: 'Начислено бонусов', value: formatMoney(c.bonuses_earned) },
              { label: 'Выведено', value: formatMoney(c.withdrawn) },
              { label: 'Доход', value: formatMoney(c.income) },
              { label: 'Расход', value: formatMoney(c.expense) },
              { label: 'Прибыль', value: formatMoney(c.profit) },
            ]}
          />
          <div className="glass-card card" style={{ marginTop: 16 }}>
            <h4>Продажи по периодам (пар)</h4>
            <p className="hint">
              День: {data.sales_totals?.day ?? 0} · Неделя: {data.sales_totals?.week ?? 0} · Месяц:{' '}
              {data.sales_totals?.month ?? 0} · Год: {data.sales_totals?.year ?? 0}
            </p>
          </div>
        </>
      );
    }

    if (section === 'sales') {
      return (
        <>
          <p className="hint">
            Итого: {data.totals?.pairs ?? 0} пар · {formatMoney(data.totals?.revenue)}
          </p>
          <SimpleLineChart data={data.charts} valueKey="revenue" label="Выручка по дням" />
          <div className="table-wrap" style={{ marginTop: 16 }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Дата</th>
                  <th>Модель</th>
                  <th>Размер</th>
                  <th>Кол-во</th>
                  <th>Сумма</th>
                  <th>Статус</th>
                </tr>
              </thead>
              <tbody>
                {(data.rows || []).map((r) => (
                  <tr key={r.id}>
                    <td>{new Date(r.created_at).toLocaleString('ru-RU')}</td>
                    <td>{r.model_name}</td>
                    <td>{r.size || '—'}</td>
                    <td>{r.quantity}</td>
                    <td>{formatMoney(r.total_amount)}</td>
                    <td>{r.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      );
    }

    if (section === 'workouts') {
      const s = data.summary || {};
      return (
        <>
          <StatGrid
            items={[
              { label: 'Тренировок', value: formatNumber(s.total) },
              { label: 'Подтверждённые', value: formatNumber(s.approved) },
              { label: 'Отклонённые', value: formatNumber(s.rejected) },
              { label: 'Подозрительные', value: formatNumber(s.suspicious) },
              { label: 'Километраж', value: `${formatNumber(s.total_km)} км` },
              { label: 'Средняя дистанция', value: `${s.avg_km} км` },
            ]}
          />
          <SimpleLineChart data={data.charts} valueKey="km" label="Км по дням" />
          <div className="report-two-cols">
            <div className="glass-card card">
              <h4>Топ по км</h4>
              <ul className="ranking-list">
                {(data.top_by_km || []).map((u) => (
                  <li key={u.id}>
                    {u.name || u.phone} — {u.km} км
                  </li>
                ))}
              </ul>
            </div>
            <div className="glass-card card">
              <h4>Топ по бонусам</h4>
              <ul className="ranking-list">
                {(data.top_by_bonus || []).map((u) => (
                  <li key={u.id}>
                    {u.name || u.phone} — {formatMoney(u.bonus)}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </>
      );
    }

    if (section === 'bonuses') {
      const s = data.summary || {};
      return (
        <>
          <StatGrid
            items={[
              { label: 'Начислено', value: formatMoney(s.earned) },
              { label: 'Списано', value: formatMoney(s.spent) },
              { label: 'Бонусный фонд', value: formatMoney(s.fund_balance) },
              { label: 'Средний на клиента', value: formatMoney(s.avg_per_client) },
            ]}
          />
          <div className="glass-card card">
            <h4>По уровням</h4>
            <ul className="ranking-list">
              {(data.by_level || []).map((l) => (
                <li key={l.code}>
                  {l.name}: {formatMoney(l.earned)}
                </li>
              ))}
            </ul>
          </div>
        </>
      );
    }

    if (section === 'withdrawals') {
      const s = data.summary || {};
      return (
        <>
          <StatGrid
            items={[
              { label: 'Всего заявок', value: formatNumber(s.total) },
              { label: 'Успешные', value: formatNumber(s.success) },
              { label: 'Отклонённые', value: formatNumber(s.rejected) },
              { label: 'В обработке', value: formatNumber(s.pending) },
              { label: 'Сумма выплат', value: formatMoney(s.paid_total) },
            ]}
          />
          <div className="glass-card card">
            <h4>По кошелькам</h4>
            <ul className="ranking-list">
              {(data.by_wallet || []).map((w) => (
                <li key={w.code}>
                  {w.name}: {formatMoney(w.paid)} ({w.cnt} заявок)
                </li>
              ))}
            </ul>
          </div>
        </>
      );
    }

    if (section === 'clients') {
      const s = data.summary || {};
      return (
        <>
          <StatGrid
            items={[
              { label: 'Новых', value: formatNumber(s.new_clients) },
              { label: 'Активных', value: formatNumber(s.active_clients) },
              { label: 'Неактивных', value: formatNumber(s.inactive_clients) },
              { label: 'Заблокированных', value: formatNumber(s.blocked_clients) },
            ]}
          />
          <div className="report-two-cols">
            <div className="glass-card card">
              <h4>Топ по км</h4>
              <ul className="ranking-list">
                {(data.top_by_km || []).map((u) => (
                  <li key={u.id}>
                    {u.name || u.phone} — {u.km} км
                  </li>
                ))}
              </ul>
            </div>
            <div className="glass-card card">
              <h4>Топ по тренировкам</h4>
              <ul className="ranking-list">
                {(data.top_by_workouts || []).map((u) => (
                  <li key={u.id}>
                    {u.name || u.phone} — {u.workouts}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </>
      );
    }

    if (section === 'shoes') {
      const s = data.summary || {};
      return (
        <>
          <StatGrid
            items={[
              { label: 'Продано пар', value: formatNumber(s.pairs_sold) },
              { label: 'QR активировано', value: formatNumber(s.qr_activated) },
              { label: 'QR не активировано', value: formatNumber(s.qr_not_activated) },
              { label: 'QR заблокировано', value: formatNumber(s.qr_blocked) },
            ]}
          />
          <div className="glass-card card">
            <h4>По моделям (склад)</h4>
            <ul className="ranking-list">
              {(data.by_model || []).map((m) => (
                <li key={m.model_name}>
                  {m.model_name}: {m.total} (актив. {m.activated})
                </li>
              ))}
            </ul>
          </div>
        </>
      );
    }

    if (section === 'finance') {
      const b = data.breakdown || {};
      return (
        <>
          <StatGrid
            items={[
              { label: 'Продажи магазина', value: formatMoney(b.shop_sales) },
              { label: 'Доход от рекламы', value: formatMoney(b.ad_revenue) },
              { label: 'Доход всего', value: formatMoney(b.income) },
              { label: 'Расход на бонусы', value: formatMoney(b.bonus_expense) },
              { label: 'Расход на выводы', value: formatMoney(b.withdrawal_expense) },
              { label: 'Чистая прибыль', value: formatMoney(b.profit) },
            ]}
          />
          <p className="hint">{data.formula}</p>
          <SimpleLineChart data={data.charts?.sales} valueKey="amount" label="Продажи по дням" />
        </>
      );
    }

    return null;
  };

  return (
    <div className="page-content reports-page">
      <div className="reports-page__header">
        <h2>Отчёты</h2>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {section === 'sales' && (
            <button type="button" className="btn btn--sm" onClick={exportSalesCsv}>
              CSV
            </button>
          )}
          <button type="button" className="btn btn--sm btn--ghost" onClick={sendTelegram}>
            Telegram отчёт
          </button>
        </div>
      </div>

      <nav className="reports-subnav">
        {SECTIONS.map((s) => (
          <button
            key={s.id}
            type="button"
            className={`chip chip--pill${section === s.id ? ' chip--accent' : ''}`}
            onClick={() => setSection(s.id)}
          >
            {s.label}
          </button>
        ))}
      </nav>

      <ReportPeriodFilter period={period} onPeriodChange={setPeriod} onRefresh={load} />
      {renderBody()}
    </div>
  );
}
