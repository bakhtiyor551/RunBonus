import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { IonPage, IonContent, IonRefresher, IonRefresherContent } from '@ionic/react';
import AppHeader from '../components/AppHeader';
import BottomNav from '../components/BottomNav';
import Icon from '../components/Icon';
import {
  fetchCoachToday,
  fetchCoachHistory,
  generateCoachReport,
} from '../services/nutrition';
import { showToast } from '../utils/toast';

const TYPE_ICONS = {
  water: 'water_drop',
  protein: 'egg',
  activity: 'directions_run',
  meal: 'restaurant',
  weight: 'monitor_weight',
  calories: 'local_fire_department',
  diary: 'edit_note',
  excess: 'warning',
  weight_loss: 'trending_down',
  general: 'lightbulb',
};

function scoreColor(score) {
  if (score >= 80) return 'var(--rb-neon)';
  if (score >= 60) return '#00d4ff';
  if (score >= 40) return '#ff9f43';
  return '#ff6b6b';
}

function ScoreRing({ score }) {
  const size = 160;
  const stroke = 14;
  const r = (size - stroke) / 2;
  const cx = size / 2;
  const pct = Math.min(100, Math.max(0, score));
  const circumference = 2 * Math.PI * r;
  const offset = circumference - (pct / 100) * circumference;
  const color = scoreColor(score);

  return (
    <div className="rb-coach-ring">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden>
        <g transform={`rotate(-90 ${cx} ${cx})`}>
          <circle cx={cx} cy={cx} r={r} fill="transparent" stroke="rgba(255,255,255,0.07)" strokeWidth={stroke} />
          <circle
            cx={cx}
            cy={cx}
            r={r}
            fill="transparent"
            stroke={color}
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            className="rb-coach-ring__arc"
          />
        </g>
      </svg>
      <div className="rb-coach-ring__center">
        <strong className="font-display font-tabular" style={{ color }}>{score}</strong>
        <span className="rb-text-muted">из 100</span>
      </div>
    </div>
  );
}

function formatDate(dateStr) {
  try {
    const d = new Date(`${dateStr}T12:00:00`);
    return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
  } catch {
    return dateStr;
  }
}

export default function NutritionCoachPage() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [report, setReport] = useState(null);
  const [history, setHistory] = useState([]);

  const loadAll = useCallback(async () => {
    const [todayData, historyData] = await Promise.all([
      fetchCoachToday(),
      fetchCoachHistory(14),
    ]);
    setReport(todayData.report);
    setHistory(historyData.items || []);
  }, []);

  useEffect(() => {
    setLoading(true);
    loadAll()
      .catch(() => showToast('Не удалось загрузить отчёт'))
      .finally(() => setLoading(false));
  }, [loadAll]);

  const handleRefresh = async (e) => {
    try {
      await loadAll();
    } catch {
      showToast('Ошибка обновления');
    }
    e.detail.complete();
  };

  const handleRegenerate = async () => {
    setGenerating(true);
    try {
      const data = await generateCoachReport();
      setReport(data.report);
      showToast('Отчёт обновлён');
      const historyData = await fetchCoachHistory(14);
      setHistory(historyData.items || []);
    } catch {
      showToast('Не удалось обновить отчёт');
    } finally {
      setGenerating(false);
    }
  };

  const recommendations = report?.recommendations || [];
  const pastItems = history.filter((h) => h.date !== report?.date);

  return (
    <IonPage>
      <AppHeader
        onBack={() => navigate('/nutrition')}
        showAvatar={false}
      />
      <IonContent>
        <IonRefresher slot="fixed" onIonRefresh={handleRefresh}>
          <IonRefresherContent />
        </IonRefresher>

        <main className="rb-main rb-coach-page">
          <h1 className="rb-coach-page__title font-display">AI-диетолог</h1>
          {loading ? (
            <div className="rb-coach-skeleton glass-card" aria-hidden />
          ) : report ? (
            <>
              <section className="rb-coach-hero glass-card">
                <div className="rb-coach-hero__badge">
                  <Icon name="psychology" />
                  RunBonus+ AI
                </div>
                <ScoreRing score={report.score} />
                <p className="rb-coach-hero__date">{formatDate(report.date)} · оценка дня</p>
                <p className="rb-coach-summary">{report.summary}</p>
                <button
                  type="button"
                  className="rb-btn-ghost rb-coach-regen"
                  onClick={handleRegenerate}
                  disabled={generating}
                >
                  <Icon name="refresh" />
                  {generating ? 'Обновление…' : 'Обновить отчёт'}
                </button>
              </section>

              {recommendations.length > 0 && (
                <section className="glass-card rb-coach-recs">
                  <h2 className="rb-headline font-display">Рекомендации</h2>
                  <ul className="rb-coach-recs__list">
                    {recommendations.map((rec, i) => (
                      <li key={i} className="rb-coach-recs__item">
                        <span className="rb-coach-recs__icon">
                          <Icon name={TYPE_ICONS[rec.type] || TYPE_ICONS.general} />
                        </span>
                        <span>{rec.message}</span>
                      </li>
                    ))}
                  </ul>
                </section>
              )}

              {report.tomorrow_tip && (
                <section className="glass-card rb-coach-tip">
                  <h2 className="rb-headline font-display">
                    <Icon name="wb_twilight" /> На завтра
                  </h2>
                  <p>{report.tomorrow_tip}</p>
                </section>
              )}

              {pastItems.length > 0 && (
                <section className="glass-card rb-coach-history">
                  <h2 className="rb-headline font-display">История</h2>
                  <ul>
                    {pastItems.map((item) => (
                      <li key={item.id} className="rb-coach-history__item">
                        <div className="rb-coach-history__score" style={{ color: scoreColor(item.score) }}>
                          {item.score}
                        </div>
                        <div className="rb-coach-history__body">
                          <span className="rb-label">{formatDate(item.date)}</span>
                          <p>{item.summary}</p>
                        </div>
                      </li>
                    ))}
                  </ul>
                </section>
              )}
            </>
          ) : (
            <section className="glass-card rb-coach-empty">
              <Icon name="psychology" />
              <p>Отчёт пока недоступен</p>
              <button type="button" className="rb-btn-pill" onClick={handleRegenerate} disabled={generating}>
                Сгенерировать отчёт
              </button>
            </section>
          )}
        </main>
      </IonContent>
      <BottomNav active="summary" />
    </IonPage>
  );
}
