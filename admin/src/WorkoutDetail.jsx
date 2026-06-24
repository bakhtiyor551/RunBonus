import { useCallback, useEffect, useRef, useState } from 'react';
import { adminApi } from './api';
import WorkoutRouteMap from './components/WorkoutRouteMap';

const LIVE_POLL_MS = 4000;

const STATUS_LABELS = {
  in_progress: 'В процессе',
  approved: 'Одобрено',
  rejected: 'Отклонено',
  suspicious: 'Подозрительно',
  rejected_no_fund: 'Нет фонда',
};

export default function WorkoutDetail({ workoutId, onClose }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const pointsScrollRef = useRef(null);
  const prevPointsCount = useRef(0);

  const loadDetail = useCallback(async () => {
    if (!workoutId) return;
    try {
      const next = await adminApi(`/api/admin/workouts/${workoutId}`);
      setData(next);
      setError('');
    } catch (e) {
      setError(e.message);
    }
  }, [workoutId]);

  useEffect(() => {
    if (!workoutId) return;
    setData(null);
    setError('');
    prevPointsCount.current = 0;
    loadDetail();
  }, [workoutId, loadDetail]);

  useEffect(() => {
    if (!workoutId || data?.workout?.status !== 'in_progress') return;
    const timer = window.setInterval(loadDetail, LIVE_POLL_MS);
    return () => window.clearInterval(timer);
  }, [workoutId, data?.workout?.status, loadDetail]);

  useEffect(() => {
    const count = data?.points?.length ?? 0;
    if (data?.workout?.status !== 'in_progress' || count <= prevPointsCount.current) {
      prevPointsCount.current = count;
      return;
    }
    prevPointsCount.current = count;
    const el = pointsScrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [data?.points?.length, data?.workout?.status]);

  if (!workoutId) return null;
  if (error && !data) return <div className="sub-card"><p style={{ color: 'crimson' }}>{error}</p></div>;
  if (!data) return <div className="sub-card"><p>Загрузка…</p></div>;

  const w = data.workout;
  const lim = data.limits;
  const isLive = w.status === 'in_progress';

  return (
    <div className="sub-card workout-detail">
      <button type="button" onClick={onClose}>← Назад к списку</button>
      <h3>
        Тренировка #{w.id} — {w.client_name}
        {isLive && (
          <span className="chip workout-card__status--live workout-detail__live">
            <span className="stat-card__live-dot" />
            В процессе
          </span>
        )}
      </h3>
      <p>Телефон: {w.phone} · Кроссовки: {w.shoe_unique_id} ({w.shoe_model})</p>
      <p>
        {new Date(w.started_at).toLocaleString('ru')}
        {w.finished_at && ` — ${new Date(w.finished_at).toLocaleString('ru')}`}
      </p>
      <p>
        <strong>{w.distance_km} км</strong> · {w.duration_seconds} с ·
        ср. {w.avg_speed ?? '—'} км/ч · макс. {w.max_speed ?? '—'} км/ч
      </p>
      <p>
        Цена за км на момент тренировки: <strong>{w.price_per_km ?? '—'}</strong> сомони ·
        Расчёт: <strong>{w.calculated_bonus ?? '—'}</strong> сомони ·
        Начислено: <strong>{data.bonus_earned}</strong> сомони · Статус: {STATUS_LABELS[w.status] || w.status}
      </p>
      {w.reject_reason && <p style={{ color: 'crimson' }}>Причина: {w.reject_reason}</p>}
      <p>
        Дневной лимит: {lim.daily_earned} / {lim.daily_limit} сомони ·
        По паре: {lim.shoe_total_earned} / {lim.shoe_limit} сомони
      </p>
      <p>
        GPS-точек: {data.points.length} · Фон: {w.background_tracking ? 'да' : 'нет'}
        {isLive && <span className="workout-detail__live-hint"> · обновление каждые 4 с</span>}
      </p>

      <h4>Маршрут (GPS-точки)</h4>
      {(data.points.length > 0 || isLive) && (
        <div className="workout-detail__map">
          <WorkoutRouteMap points={data.points} live={isLive} />
        </div>
      )}
      <div className="points-scroll" ref={pointsScrollRef}>
        <table>
          <thead>
            <tr><th>Время</th><th>lat</th><th>lng</th><th>км/ч</th><th>точность</th></tr>
          </thead>
          <tbody>
            {data.points.map((p) => (
              <tr key={p.id}>
                <td>{new Date(p.recorded_at).toLocaleTimeString('ru')}</td>
                <td>{p.lat}</td>
                <td>{p.lng}</td>
                <td>{p.speed ?? '—'}</td>
                <td>{p.accuracy ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
