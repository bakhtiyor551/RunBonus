import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { IonPage, IonContent } from '@ionic/react';
import { api } from '../api';
import AppHeader from '../components/AppHeader';
import BottomNav from '../components/BottomNav';
import Icon from '../components/Icon';

function achievementDescription(text) {
  if (!text) return '';
  return text.replace(/\s*·\s*[\d.,]+\s*сом\/км/gi, '').trim();
}

function LevelBadge({ level, color, icon }) {
  return (
    <div
      className="glass-card"
      style={{
        padding: 24,
        textAlign: 'center',
        borderColor: color ? `${color}55` : undefined,
      }}
    >
      <div
        style={{
          width: 72,
          height: 72,
          borderRadius: '50%',
          margin: '0 auto 12px',
          background: color ? `${color}33` : 'rgba(255,255,255,0.08)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Icon name={icon || 'military_tech'} filled style={{ fontSize: 36, color: color || 'var(--rb-neon)' }} />
      </div>
      <h2 className="font-display" style={{ margin: 0, fontSize: 28 }}>
        {level || '—'}
      </h2>
    </div>
  );
}

export default function LevelPage() {
  const location = useLocation();
  const [data, setData] = useState(null);
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);

  const loadLevel = () => {
    setLoading(true);
    Promise.all([api('/api/me/level'), api('/api/me/level-history')])
      .then(([level, hist]) => {
        setData(level);
        setHistory(hist);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadLevel();
  }, [location.pathname]);

  if (loading) {
    return (
      <IonPage>
        <AppHeader />
        <IonContent>
          <main className="rb-main">
            <p className="rb-text-muted">Загрузка…</p>
          </main>
        </IonContent>
        <BottomNav />
      </IonPage>
    );
  }

  if (!data?.current_level && !data?.is_completed) {
    return (
      <IonPage>
        <AppHeader />
        <IonContent>
          <main className="rb-main">
            <h1 className="rb-headline font-display" style={{ marginBottom: 16 }}>
              Мой уровень
            </h1>
            <p className="rb-text-muted">Активируйте кроссовки, чтобы начать прогресс уровней.</p>
          </main>
        </IonContent>
        <BottomNav />
      </IonPage>
    );
  }

  return (
    <IonPage>
      <AppHeader />
      <IonContent>
        <main className="rb-main">
          <h1 className="rb-headline font-display" style={{ marginBottom: 24 }}>
            Мой уровень
          </h1>
          <LevelBadge level={data.current_level} color={data.color} icon={data.icon} />

          <div className="glass-card" style={{ padding: 'var(--rb-card-padding)', marginTop: 16 }}>
            <span className="rb-label">Общий километраж</span>
            <p className="rb-display font-display" style={{ margin: '4px 0 0', fontSize: 28 }}>
              {Number(data.total_km).toFixed(1)} км
            </p>
            {data.next_level && !data.is_completed && (
              <p className="rb-text-muted" style={{ marginTop: 16, marginBottom: 0 }}>
                Следующий уровень: <strong style={{ color: 'var(--rb-neon)' }}>{data.next_level}</strong>
                {data.progress_to_next_km != null && (
                  <> · осталось {Number(data.progress_to_next_km).toFixed(1)} км</>
                )}
              </p>
            )}
            {data.is_completed && (
              <p className="rb-text-muted" style={{ marginTop: 16, marginBottom: 0 }}>
                Программа бонусов по этой паре завершена. Активируйте новые кроссовки для нового прогресса.
              </p>
            )}
          </div>

          <section style={{ marginTop: 32 }}>
            <h2 className="rb-headline font-display" style={{ marginBottom: 16 }}>
              История уровней
            </h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {history.map((h) => (
                <div key={h.id} className="glass-card" style={{ padding: 16, display: 'flex', gap: 12, alignItems: 'center' }}>
                  <Icon name={h.icon || 'military_tech'} style={{ color: h.color || 'var(--rb-neon)' }} />
                  <div style={{ flex: 1 }}>
                    <strong>{h.level}</strong>
                    <p className="rb-label" style={{ margin: '4px 0 0', textTransform: 'none' }}>
                      {Number(h.reached_km).toFixed(1)} км ·{' '}
                      {new Date(h.reached_at).toLocaleDateString('ru-RU')}
                    </p>
                  </div>
                </div>
              ))}
              {!history.length && <p className="rb-text-muted">Пока нет переходов</p>}
            </div>
          </section>

          <section style={{ marginTop: 32, marginBottom: 24 }}>
            <h2 className="rb-headline font-display" style={{ marginBottom: 16 }}>
              Достижения
            </h2>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              {(data.achievements || []).filter((a) => a.id !== 'complete').map((a) => (
                <div
                  key={a.id}
                  className="glass-card"
                  style={{
                    padding: 16,
                    opacity: a.unlocked ? 1 : 0.45,
                    borderColor: a.unlocked ? 'rgba(195,244,0,0.25)' : undefined,
                  }}
                >
                  <Icon
                    name={a.unlocked ? 'emoji_events' : 'lock'}
                    filled={a.unlocked}
                    style={{ color: a.unlocked ? 'var(--rb-neon)' : 'var(--rb-on-surface-variant)' }}
                  />
                  <p style={{ margin: '8px 0 0', fontWeight: 600 }}>{a.title}</p>
                  <p className="rb-label" style={{ margin: '4px 0 0', textTransform: 'none', fontSize: 11 }}>
                    {achievementDescription(a.description)}
                  </p>
                </div>
              ))}
            </div>
          </section>
        </main>
      </IonContent>
      <BottomNav />
    </IonPage>
  );
}
