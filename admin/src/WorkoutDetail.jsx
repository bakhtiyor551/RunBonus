import { useEffect, useState } from 'react';
import { adminApi } from './api';

export default function WorkoutDetail({ workoutId, onClose }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!workoutId) return;
    adminApi(`/api/admin/workouts/${workoutId}`)
      .then(setData)
      .catch((e) => setError(e.message));
  }, [workoutId]);

  if (!workoutId) return null;
  if (error) return <div className="sub-card"><p style={{ color: 'crimson' }}>{error}</p></div>;
  if (!data) return <div className="sub-card"><p>Загрузка…</p></div>;

  const w = data.workout;
  const lim = data.limits;

  return (
    <div className="sub-card workout-detail">
      <button type="button" onClick={onClose}>← Назад к списку</button>
      <h3>Тренировка #{w.id} — {w.client_name}</h3>
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
        Начислено: <strong>{data.bonus_earned}</strong> сомони · Статус: {w.status}
      </p>
      {w.reject_reason && <p style={{ color: 'crimson' }}>Причина: {w.reject_reason}</p>}
      <p>
        Дневной лимит: {lim.daily_earned} / {lim.daily_limit} сомони ·
        По паре: {lim.shoe_total_earned} / {lim.shoe_limit} сомони
      </p>
      <p>GPS-точек: {data.points.length} · Фон: {w.background_tracking ? 'да' : 'нет'}</p>

      <h4>Маршрут (GPS-точки)</h4>
      <div className="points-scroll">
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
