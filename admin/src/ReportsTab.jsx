import { useCallback, useEffect, useState } from 'react';
import { adminApi } from './api';
import Icon from './components/Icon';
import { formatMoney, formatNumber } from './utils/format';

const SUB_TABS = [
  { id: 'dashboard', label: 'Общий отчёт', icon: 'dashboard' },
  { id: 'sales', label: 'Продажи', icon: 'shopping_bag' },
  { id: 'workouts', label: 'Тренировки', icon: 'directions_run' },
  { id: 'bonuses', label: 'Бонусы', icon: 'payments' },
  { id: 'withdrawals', label: 'Вывод средств', icon: 'south_west' },
  { id: 'clients', label: 'Клиенты', icon: 'group' },
  { id: 'shoes', label: 'Кроссовки', icon: 'checkroom' },
  { id: 'finance', label: 'Финансы', icon: 'account_balance' },
];

const PRESETS = [
  { id: 'today', label: 'Сегодня' },
  { id: 'yesterday', label: 'Вчера' },
  { id: '7d', label: '7 дней' },
  { id: '30d', label: '30 дней' },
  { id: 'this_month', label: 'Этот месяц' },
  { id: 'last_month', label: 'Прошлый месяц' },
  { id: 'year', label: 'Год' },
  { id: 'all', label: 'Всё время' },
];

function StatCard({ label, value, accent }) {
  return (
    <div className={`glass-card stat-card${accent ? ' stat-card--highlight' : ''}`}>
      <p className="stat-card__label">{label}</p>
      <h3 className={`stat-card__value${accent ? ' stat-card__value--accent' : ''}`}>{value}</h3>
    </div>
  );
}

function BarChart({ title, data, valueKey = 'total', labelKey = 'bucket' }) {
  if (!data?.length) return null;
  const max = Math.max(1, ...data.map((d) => Number(d[valueKey]) || 0));
  return (
    <div className="glass-card chart-card">
      <h4 className="chart-card__title">{title}</h4>
      <div className="bar-chart">
        {data.map((d) => (
          <div key={d[labelKey]} className="bar-chart__item" title={`${d[labelKey]}: ${d[valueKey]}`}>
            <div
              className="bar-chart__bar"
              style={{ height: `${Math.max(4, (Number(d[valueKey]) / max) * 100)}%` }}
            />
            <span className="bar-chart__label">{String(d[labelKey]).slice(-5)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function downloadCsv(filename, rows, headers) {
  const escape = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const lines = [headers.map(escape).join(';')];
  for (const row of rows) {
    lines.push(headers.map((h) => escape(typeof h === 'function' ? h(row) : row[h])).join(';'));
  }
  const blob = new Blob(['\uFEFF' + lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}

function PeriodFilter({ preset, customFrom, customTo, groupBy, onPreset, onCustom, onGroupBy }) {
  return (
    <div className="reports-filters glass-card">
      <div className="reports-filters__presets">
        {PRESETS.map((p) => (
          <button
            key={p.id}
            type="button"
            className={`chip${preset === p.id ? ' chip--accent' : ''}`}
            onClick={() => onPreset(p.id)}
          >
            {p.label}
          </button>
        ))}
      </div>
      <div className="reports-filters__custom">
        <input type="date" value={customFrom} onChange={(e) => onCustom(e.target.value, customTo)} />
        <span>—</span>
        <input type="date" value={customTo} onChange={(e) => onCustom(customFrom, e.target.value)} />
        <select value={groupBy} onChange={(e) => onGroupBy(e.target.value)}>
          <option value="day">По дням</option>
          <option value="week">По неделям</option>
          <option value="month">По месяцам</option>
        </select>
      </div>
    </div>
  );
}

function TopTable({ title, rows, columns }) {
  if (!rows?.length) return <p className="hint">Нет данных</p>;
  return (
    <div className="glass-card">
      <h4>{title}</h4>
      <div className="table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              {columns.map((c) => (
                <th key={c.key}>{c.label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr key={row.id || i}>
                {columns.map((c) => (
                  <td key={c.key}>{c.render ? c.render(row) : row[c.key]}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function ReportsTab() {
  const [subTab, setSubTab] = useState('dashboard');
  const [preset, setPreset] = useState('30d');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const [groupBy, setGroupBy] = useState('day');
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState(null);
  const [sendingTg, setSendingTg] = useState(false);

  const queryString = useCallback(() => {
    const p = new URLSearchParams({ groupBy });
    if (customFrom && customTo) {
      p.set('from', customFrom);
      p.set('to', customTo);
    } else {
      p.set('preset', preset);
    }
    return p.toString();
  }, [preset, customFrom, customTo, groupBy]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await adminApi(`/api/admin/reports/${subTab}?${queryString()}`);
      setData(res);
    } catch (e) {
      alert(e.message);
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [subTab, queryString]);

  useEffect(() => {
    load();
  }, [load]);

  const sendTelegram = async () => {
    setSendingTg(true);
    try {
      await adminApi('/api/admin/reports/telegram/daily', { method: 'POST' });
      alert('Отчёт отправлен в Telegram');
    } catch (e) {
      alert(e.message);
    } finally {
      setSendingTg(false);
    }
  };

  const exportCurrent = () => {
    if (!data) return;
    const period = (data.period?.label || 'report').replace(/\s+/g, '-');
    if (subTab === 'sales' && data.items?.length) {
      downloadCsv(`sales-${period}.csv`, data.items, [
        'date',
        'model',
        'size',
        'quantity',
        'price',
        'total',
        'status_label',
      ]);
    } else if (subTab === 'workouts' && data.top_km?.length) {
      downloadCsv(`workouts-top-${period}.csv`, data.top_km, ['name', 'phone', 'km', 'workouts']);
    } else {
      alert('Экспорт CSV доступен для разделов «Продажи» и «Тренировки»');
    }
  };

  const c = data?.cards;
  const cards = data?.summary || data?.breakdown;

  return (
    <div className="page-content reports-tab">
      <div className="reports-tab__header">
        <h2>
          <Icon name="analytics" /> Отчёты
        </h2>
        <div className="reports-tab__actions">
          <button type="button" className="btn btn--sm" onClick={exportCurrent}>
            CSV / Excel
          </button>
          <button type="button" className="btn btn--sm" onClick={sendTelegram} disabled={sendingTg}>
            {sendingTg ? '…' : 'Telegram отчёт'}
          </button>
        </div>
      </div>

      <nav className="reports-subnav">
        {SUB_TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            className={`reports-subnav__item${subTab === t.id ? ' reports-subnav__item--active' : ''}`}
            onClick={() => setSubTab(t.id)}
          >
            <Icon name={t.icon} />
            {t.label}
          </button>
        ))}
      </nav>

      <PeriodFilter
        preset={preset}
        customFrom={customFrom}
        customTo={customTo}
        groupBy={groupBy}
        onPreset={(id) => {
          setPreset(id);
          setCustomFrom('');
          setCustomTo('');
        }}
        onCustom={(from, to) => {
          setCustomFrom(from);
          setCustomTo(to);
        }}
        onGroupBy={setGroupBy}
      />

      {data?.period && (
        <p className="hint reports-tab__period">Период: {data.period.label}</p>
      )}

      {loading ? (
        <p className="hint">Загрузка отчёта…</p>
      ) : (
        <>
          {subTab === 'dashboard' && c && (
            <>
              <section className="bento-grid bento-grid--stats">
                <StatCard label="Всего клиентов" value={formatNumber(c.total_clients)} />
                <StatCard label="Активных клиентов" value={formatNumber(c.active_clients)} accent />
                <StatCard label="Продано кроссовок" value={formatNumber(c.shoes_sold)} />
                <StatCard label="Километров" value={`${formatNumber(c.total_km)} км`} />
                <StatCard label="Начислено бонусов" value={formatMoney(c.bonuses_earned)} />
                <StatCard label="Выведено средств" value={formatMoney(c.withdrawals_paid)} />
                <StatCard label="Доход" value={formatMoney(c.income)} />
                <StatCard label="Расход" value={formatMoney(c.expense)} />
                <StatCard label="Прибыль" value={formatMoney(c.profit)} accent />
              </section>
              <section className="bento-grid bento-grid--main">
                <BarChart title="Продажи" data={data.charts?.sales} />
                <BarChart title="Тренировки (км)" data={data.charts?.workouts} valueKey="km" />
                <BarChart title="Бонусы — начисления" data={data.charts?.bonuses} valueKey="earned" />
              </section>
            </>
          )}

          {subTab === 'sales' && data && (
            <>
              <section className="bento-grid bento-grid--stats">
                <StatCard label="За сегодня" value={formatNumber(data.totals?.today)} />
                <StatCard label="За неделю" value={formatNumber(data.totals?.week)} />
                <StatCard label="За месяц" value={formatNumber(data.totals?.month)} />
                <StatCard label="За год" value={formatNumber(data.totals?.year)} />
                <StatCard label="Выручка за период" value={formatMoney(data.totals?.revenue)} accent />
              </section>
              <BarChart title="Продажи по периодам" data={data.chart} />
              <TopTable
                title="Детализация продаж"
                rows={data.items}
                columns={[
                  { key: 'date', label: 'Дата', render: (r) => new Date(r.date).toLocaleString('ru-RU') },
                  { key: 'model', label: 'Модель' },
                  { key: 'size', label: 'Размер' },
                  { key: 'quantity', label: 'Кол-во' },
                  { key: 'price', label: 'Цена', render: (r) => formatMoney(r.price) },
                  { key: 'total', label: 'Сумма', render: (r) => formatMoney(r.total) },
                  { key: 'status_label', label: 'Статус' },
                ]}
              />
            </>
          )}

          {subTab === 'workouts' && data && (
            <>
              <section className="bento-grid bento-grid--stats">
                <StatCard label="Всего тренировок" value={formatNumber(data.summary?.total)} />
                <StatCard label="Подтверждённые" value={formatNumber(data.summary?.approved)} />
                <StatCard label="Отклонённые" value={formatNumber(data.summary?.rejected)} />
                <StatCard label="Подозрительные" value={formatNumber(data.summary?.suspicious)} />
                <StatCard label="Километраж" value={`${formatNumber(data.summary?.km)} км`} accent />
                <StatCard label="Средняя дистанция" value={`${formatNumber(Number(data.summary?.avg_km).toFixed(2))} км`} />
              </section>
              <BarChart title="Километры" data={data.chart} valueKey="km" />
              <div className="reports-two-col">
                <TopTable
                  title="Топ по километрам"
                  rows={data.top_km}
                  columns={[
                    { key: 'name', label: 'Клиент' },
                    { key: 'phone', label: 'Телефон' },
                    { key: 'km', label: 'Км', render: (r) => formatNumber(r.km) },
                    { key: 'workouts', label: 'Тренировок' },
                  ]}
                />
                <TopTable
                  title="Топ по бонусам"
                  rows={data.top_bonus}
                  columns={[
                    { key: 'name', label: 'Клиент' },
                    { key: 'bonus', label: 'Бонусы', render: (r) => formatMoney(r.bonus) },
                  ]}
                />
              </div>
            </>
          )}

          {subTab === 'bonuses' && data && (
            <>
              <section className="bento-grid bento-grid--stats">
                <StatCard label="Начислено" value={formatMoney(data.summary?.earned)} accent />
                <StatCard label="Списано" value={formatMoney(data.summary?.spent)} />
                <StatCard label="Бонусный фонд" value={formatMoney(data.summary?.fund_balance)} />
                <StatCard label="Средний бонус / клиент" value={formatMoney(data.summary?.avg_per_client)} />
              </section>
              <BarChart title="Начисления бонусов" data={data.chart} valueKey="earned" />
              <TopTable
                title="По уровням клиентов"
                rows={data.by_level}
                columns={[
                  { key: 'name', label: 'Уровень' },
                  { key: 'clients', label: 'Клиентов' },
                  { key: 'bonus_earned', label: 'Бонусов', render: (r) => formatMoney(r.bonus_earned) },
                ]}
              />
            </>
          )}

          {subTab === 'withdrawals' && data && (
            <>
              <section className="bento-grid bento-grid--stats">
                <StatCard label="Всего заявок" value={formatNumber(data.summary?.total)} />
                <StatCard label="Успешные" value={formatNumber(data.summary?.success)} />
                <StatCard label="Отклонённые" value={formatNumber(data.summary?.rejected)} />
                <StatCard label="В обработке" value={formatNumber(data.summary?.processing)} />
                <StatCard label="Сумма выплат" value={formatMoney(data.summary?.paid_total)} accent />
              </section>
              <BarChart title="Выплаты" data={data.chart} />
              <TopTable
                title="По кошелькам"
                rows={data.by_wallet}
                columns={[
                  { key: 'wallet', label: 'Кошелёк' },
                  { key: 'requests', label: 'Заявок' },
                  { key: 'paid', label: 'Выплачено', render: (r) => formatMoney(r.paid) },
                ]}
              />
            </>
          )}

          {subTab === 'clients' && data && (
            <>
              <section className="bento-grid bento-grid--stats">
                <StatCard label="Всего клиентов" value={formatNumber(data.summary?.total)} />
                <StatCard label="Новых за период" value={formatNumber(data.summary?.new)} />
                <StatCard label="Активных" value={formatNumber(data.summary?.active)} accent />
                <StatCard label="Неактивных" value={formatNumber(data.summary?.inactive)} />
                <StatCard label="Заблокированных" value={formatNumber(data.summary?.blocked)} />
              </section>
              <BarChart title="Новые клиенты" data={data.chart} valueKey="count" />
              <div className="reports-two-col">
                <TopTable title="Топ по км" rows={data.top_km} columns={[
                  { key: 'name', label: 'Клиент' },
                  { key: 'km', label: 'Км', render: (r) => formatNumber(r.km) },
                ]} />
                <TopTable title="Топ по бонусам" rows={data.top_bonus} columns={[
                  { key: 'name', label: 'Клиент' },
                  { key: 'bonus', label: 'Бонусы', render: (r) => formatMoney(r.bonus) },
                ]} />
                <TopTable title="Топ по тренировкам" rows={data.top_workouts} columns={[
                  { key: 'name', label: 'Клиент' },
                  { key: 'workouts', label: 'Тренировок' },
                ]} />
              </div>
            </>
          )}

          {subTab === 'shoes' && data && (
            <>
              <section className="bento-grid bento-grid--stats">
                <StatCard label="Всего пар" value={formatNumber(data.summary?.total)} />
                <StatCard label="Активировано QR" value={formatNumber(data.summary?.activated)} accent />
                <StatCard label="Не активировано" value={formatNumber(data.summary?.not_activated)} />
                <StatCard label="Заблокировано" value={formatNumber(data.summary?.blocked)} />
                <StatCard label="Продано за период" value={formatNumber(data.summary?.sold_period)} />
              </section>
              <TopTable
                title="По моделям"
                rows={data.by_model}
                columns={[
                  { key: 'model_name', label: 'Модель' },
                  { key: 'total', label: 'Всего' },
                  { key: 'activated', label: 'Активировано' },
                  { key: 'not_activated', label: 'Не активировано' },
                  { key: 'blocked', label: 'Заблокировано' },
                ]}
              />
            </>
          )}

          {subTab === 'finance' && data && (
            <>
              <section className="bento-grid bento-grid--stats">
                <StatCard label="Доход (магазин)" value={formatMoney(data.breakdown?.shop_income)} accent />
                <StatCard label="Расход на бонусы" value={formatMoney(data.breakdown?.bonus_expense)} />
                <StatCard label="Расход на выводы" value={formatMoney(data.breakdown?.withdrawal_expense)} />
                <StatCard label="Прочие расходы" value={formatMoney(data.breakdown?.other_expense)} />
                <StatCard label="Чистая прибыль" value={formatMoney(data.breakdown?.profit)} accent />
              </section>
              <p className="hint">{data.formula}</p>
              <section className="bento-grid bento-grid--main">
                <BarChart title="Доход" data={data.charts?.income} />
                <BarChart title="Расходы (бонусы)" data={data.charts?.expenses} valueKey="earned" />
              </section>
            </>
          )}
        </>
      )}
    </div>
  );
}
