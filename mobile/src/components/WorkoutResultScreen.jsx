import { useMemo, useState } from 'react';
import WorkoutResultMap from './WorkoutResultMap';
import Icon from './Icon';
import { haversineKm } from '../services/geolocation';

function paceSecsPerKm(distanceKm, durationSec) {
  const d = Number(distanceKm) || 0;
  const t = Number(durationSec) || 0;
  if (d <= 0.01 || t <= 0) return null;
  return t / d;
}

function formatPaceTicks(secPerKm) {
  if (secPerKm == null || !Number.isFinite(secPerKm) || secPerKm <= 0) return '—';
  const total = Math.round(secPerKm);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}'${String(s).padStart(2, '0')}"`;
}

function formatClock(sec) {
  const t = Math.max(0, Math.floor(Number(sec) || 0));
  const h = Math.floor(t / 3600);
  const m = Math.floor((t % 3600) / 60);
  const s = t % 60;
  const pad = (n) => String(n).padStart(2, '0');
  return `${pad(h)}:${pad(m)}:${pad(s)}`;
}

function estimateCalories(distanceKm, durationSec, steps) {
  const d = Number(distanceKm) || 0;
  const fromDist = d * 65;
  const fromSteps = (Number(steps) || 0) * 0.04;
  const fromTime = ((Number(durationSec) || 0) / 3600) * 280;
  return Math.max(0, Math.round(Math.max(fromDist, fromSteps, fromTime)));
}

function activityLabel(avgKmh) {
  if (avgKmh == null) return 'ПРОГУЛКА';
  if (avgKmh >= 10) return 'БЕГ';
  if (avgKmh >= 6) return 'ПРОГУЛКА';
  return 'ХОДЬБА';
}

function buildSplits(points, distanceKm, durationSec) {
  const track = (points || []).filter(
    (p) => Number.isFinite(p.latitude) && Number.isFinite(p.longitude)
  );
  const kmTotal = Number(distanceKm) || 0;
  if (kmTotal < 0.2 || track.length < 2) return [];

  const splits = [];
  let cum = 0;
  let segStartIdx = 0;
  let nextKm = 1;
  const startT = new Date(track[0].recorded_at || Date.now()).getTime();

  for (let i = 1; i < track.length; i++) {
    const a = track[i - 1];
    const b = track[i];
    const seg = haversineKm([
      { latitude: a.latitude, longitude: a.longitude },
      { latitude: b.latitude, longitude: b.longitude },
    ]);
    cum += seg;
    while (cum >= nextKm && nextKm <= Math.floor(kmTotal)) {
      const tA = new Date(track[segStartIdx].recorded_at || startT).getTime();
      const tB = new Date(b.recorded_at || Date.now()).getTime();
      const sec = Math.max(1, Math.round((tB - tA) / 1000));
      splits.push({ km: nextKm, paceSec: sec, label: formatPaceTicks(sec) });
      segStartIdx = i;
      nextKm += 1;
    }
  }

  if (!splits.length && kmTotal > 0 && durationSec > 0) {
    const whole = Math.max(1, Math.floor(kmTotal));
    const avg = durationSec / kmTotal;
    for (let k = 1; k <= whole; k++) {
      splits.push({ km: k, paceSec: avg, label: formatPaceTicks(avg) });
    }
  }
  return splits.slice(0, 8);
}

function userInitial(user) {
  const name = user?.first_name || user?.name || user?.phone || 'R';
  return String(name).trim().charAt(0).toUpperCase() || 'R';
}

function userDisplayName(user) {
  return user?.name || [user?.first_name, user?.last_name].filter(Boolean).join(' ') || 'Бегун RunBonus';
}

function formatRuDateTime(iso) {
  const d = iso ? new Date(iso) : new Date();
  const date = d.toLocaleDateString('ru', { day: 'numeric', month: 'short', year: 'numeric' });
  const time = d.toLocaleTimeString('ru', { hour: '2-digit', minute: '2-digit' });
  return `${date} · ${time}`;
}

/**
 * Экран результата тренировки (макет: карта + sheet).
 */
export default function WorkoutResultScreen({
  result,
  user,
  trackPoints = [],
  onDone,
}) {
  const [detailsOpen, setDetailsOpen] = useState(true);
  const distanceKm = Number(result.distance_km) || 0;
  const durationSec = Number(result.duration_seconds) || 0;
  const steps = Number(result.steps_count ?? result.steps) || 0;
  const avgKmh =
    durationSec > 0 && distanceKm > 0 ? (distanceKm / durationSec) * 3600 : Number(result.avg_speed) || null;
  const avgPaceSec = paceSecsPerKm(distanceKm, durationSec);
  const calories = estimateCalories(distanceKm, durationSec, steps);
  const splits = useMemo(
    () => buildSplits(trackPoints, distanceKm, durationSec),
    [trackPoints, distanceKm, durationSec]
  );
  const goalPace = avgPaceSec != null ? Math.round(avgPaceSec * 1.02) : 600;
  const slowPace = avgPaceSec != null ? avgPaceSec * 2.2 : 1200;
  const fastPace = avgPaceSec != null ? avgPaceSec * 0.45 : 140;

  const approved = result.status === 'approved';
  const pending = !result.status || result.status === 'pending' || result.status === 'processing';

  const city = 'Душанбе';
  const routeLabel = 'МАРШРУТ ТАДЖИКИСТАН';

  return (
    <div className="rb-result-screen">
      <div className="rb-result-screen__map">
        <WorkoutResultMap points={trackPoints} />
        <div className="rb-result-screen__map-ui">
          <button type="button" className="rb-result-screen__back" onClick={onDone} aria-label="Назад">
            <Icon name="chevron_left" />
          </button>
          <span className="rb-result-screen__gps">
            <i />
            {approved ? 'ПРОВЕРЕННЫЙ GPS' : pending ? 'ПРОВЕРКА GPS' : 'GPS НЕ ЗАСЧИТАН'}
          </span>
          <div className="rb-result-screen__city">
            <strong className="font-display">{city}</strong>
            <span>{routeLabel}</span>
          </div>
          <div className="rb-result-screen__map-tools">
            <span className="rb-result-screen__tool">КМ</span>
            <span className="rb-result-screen__tool">
              <Icon name="explore" />
            </span>
          </div>
        </div>
      </div>

      <div className="rb-result-sheet">
        <div className="rb-result-sheet__handle" aria-hidden />

        <header className="rb-result-sheet__head">
          <div className="rb-result-sheet__user">
            <div className="rb-result-sheet__avatar" aria-hidden>
              <span>{userInitial(user)}</span>
              <i className="rb-result-sheet__avatar-check">
                <Icon name="check" />
              </i>
            </div>
            <div>
              <strong className="rb-result-sheet__name">{userDisplayName(user)}</strong>
              <p className="rb-result-sheet__when">
                {formatRuDateTime(result.finished_at || result.started_at)}
              </p>
            </div>
          </div>
          <div className="rb-result-sheet__dist-block">
            <span className="rb-result-sheet__activity">
              <i />
              {activityLabel(avgKmh)}
            </span>
            <strong className="rb-result-sheet__dist font-display font-tabular">
              {distanceKm.toFixed(2)} КМ
            </strong>
          </div>
        </header>

        <section className="rb-result-stats">
          <div>
            <strong className="font-tabular">{formatPaceTicks(avgPaceSec)}</strong>
            <span>СР. ТЕМП</span>
          </div>
          <div>
            <strong className="font-tabular">{formatClock(durationSec)}</strong>
            <span>ВРЕМЯ</span>
          </div>
          <div>
            <strong className="font-tabular">{calories}</strong>
            <span>КАЛОРИИ</span>
          </div>
        </section>

        <section className="rb-result-pace">
          <div className="rb-result-pace__bar" aria-hidden />
          <div className="rb-result-pace__labels">
            <span>Медленно {formatPaceTicks(slowPace)}</span>
            <span>Быстро {formatPaceTicks(fastPace)}</span>
          </div>
        </section>

        <button
          type="button"
          className="rb-result-more"
          onClick={() => setDetailsOpen((v) => !v)}
        >
          Подробнее
          <i className="rb-result-more__dot" />
          <Icon name={detailsOpen ? 'expand_less' : 'expand_more'} />
        </button>

        {detailsOpen && (
          <section className="rb-result-splits">
            <div className="rb-result-splits__head">
              <span>КМ</span>
              <span>ТЕМП</span>
            </div>
            {(splits.length ? splits : [{ km: 1, paceSec: avgPaceSec || goalPace, label: formatPaceTicks(avgPaceSec || goalPace) }]).map(
              (split) => {
                const ratio = Math.min(1.15, Math.max(0.35, (goalPace || 600) / (split.paceSec || goalPace || 600)));
                return (
                  <div key={split.km} className="rb-result-splits__row">
                    <span className="rb-result-splits__km font-tabular">{split.km}</span>
                    <div className="rb-result-splits__track">
                      <div className="rb-result-splits__fill" style={{ width: `${ratio * 100}%` }}>
                        <span>{split.label}</span>
                      </div>
                    </div>
                    <span className="rb-result-splits__goal">Цель сплита {formatPaceTicks(goalPace)}</span>
                  </div>
                );
              }
            )}
          </section>
        )}

        {Array.isArray(result.rewards_unlocked) && result.rewards_unlocked.length > 0 && (
          <p className="rb-result-unlock-note">
            Новые награды: {result.rewards_unlocked.map((r) => r.name || `${r.distance} км`).join(', ')}
          </p>
        )}

        <button type="button" className="rb-result-done" onClick={onDone}>
          Готово
          <Icon name="arrow_forward" />
        </button>
      </div>
    </div>
  );
}
