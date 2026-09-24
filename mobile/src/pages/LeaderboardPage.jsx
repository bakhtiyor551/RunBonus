import { useCallback, useEffect, useState } from 'react';
import { IonPage, IonContent, IonRefresher, IonRefresherContent } from '@ionic/react';
import { api } from '../api';
import AppHeader from '../components/AppHeader';
import BottomNav from '../components/BottomNav';
import Icon from '../components/Icon';
import { resolveAvatarUrl } from '../utils/avatar';

function formatKm(v) {
  return (Number(v) || 0).toLocaleString('ru', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });
}

function Avatar({ url, name }) {
  const src = resolveAvatarUrl(url);
  if (src) {
    return <img src={src} alt="" className="rb-leader-avatar__img" />;
  }
  const letter = (name || '?').trim().charAt(0).toUpperCase() || '?';
  return <span className="rb-leader-avatar__letter">{letter}</span>;
}

function RankBadge({ rank }) {
  if (rank === 1) return <span className="rb-leader-rank rb-leader-rank--gold">1</span>;
  if (rank === 2) return <span className="rb-leader-rank rb-leader-rank--silver">2</span>;
  if (rank === 3) return <span className="rb-leader-rank rb-leader-rank--bronze">3</span>;
  return <span className="rb-leader-rank">{rank}</span>;
}

function LeaderRow({ item, highlight }) {
  return (
    <div className={`glass-card rb-leader-row${highlight ? ' rb-leader-row--me' : ''}`}>
      <RankBadge rank={item.rank} />
      <div className="rb-leader-avatar" aria-hidden>
        <Avatar url={item.avatar_url} name={item.name} />
      </div>
      <div className="rb-leader-row__text">
        <strong className="rb-leader-row__name">{item.name || `ID ${item.id}`}</strong>
        <span className="rb-label">ID {item.id}</span>
      </div>
      <div className="rb-leader-row__km font-tabular">
        <span className="rb-leader-row__km-value">{formatKm(item.totalKm)}</span>
        <span className="rb-leader-row__km-unit">км</span>
      </div>
    </div>
  );
}

export default function LeaderboardPage({ user }) {
  const [items, setItems] = useState([]);
  const [me, setMe] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    const data = await api('/api/leaderboard?limit=20');
    setItems(Array.isArray(data?.items) ? data.items : []);
    setMe(data?.me || null);
    setError('');
  }, []);

  useEffect(() => {
    load()
      .catch((err) => setError(err.message || 'Ошибка загрузки'))
      .finally(() => setLoading(false));
  }, [load]);

  const myId = user?.id ?? user?.clientId;

  return (
    <IonPage>
      <AppHeader showAvatar={false} />
      <IonContent>
        <IonRefresher
          slot="fixed"
          onIonRefresh={async (e) => {
            await load().catch(() => {});
            e.detail.complete();
          }}
        >
          <IonRefresherContent />
        </IonRefresher>

        <main className="rb-main rb-leaderboard-page">
          <header className="rb-workouts-page__head">
            <h1 className="rb-headline font-display">Топ км</h1>
            <p className="rb-text-muted">20 клиентов с наибольшим пробегом</p>
          </header>

          {me && !me.inTop && (
            <section className="rb-leader-me" aria-label="Ваш результат">
              <p className="rb-label" style={{ margin: '0 0 8px' }}>
                Ваше место
              </p>
              <LeaderRow item={me} highlight />
            </section>
          )}

          <div className="rb-leader-list">
            {items.map((item) => (
              <LeaderRow
                key={item.id}
                item={item}
                highlight={Number(item.id) === Number(myId)}
              />
            ))}

            {!loading && !items.length && !error && (
              <section className="glass-card rb-progress-empty">
                <Icon name="emoji_events" />
                <p>Пока нет рейтинга. После подтверждённых тренировок здесь появятся лидеры.</p>
              </section>
            )}

            {error && (
              <section className="glass-card rb-progress-empty">
                <Icon name="error" />
                <p>{error}</p>
              </section>
            )}
          </div>
        </main>
      </IonContent>
      <BottomNav />
    </IonPage>
  );
}
