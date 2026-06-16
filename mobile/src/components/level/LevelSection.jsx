import Icon from '../Icon';

function achievementDescription(text) {
  if (!text) return '';
  return text.replace(/\s*·\s*[\d.,]+\s*сом\/км/gi, '').trim();
}

function LevelBadge({ level, color, icon }) {
  return (
    <div
      className="glass-card rb-level-badge"
      style={{ borderColor: color ? `${color}55` : undefined }}
    >
      <div
        className="rb-level-badge__icon"
        style={{ background: color ? `${color}33` : 'rgba(255,255,255,0.08)' }}
      >
        <Icon name={icon || 'military_tech'} filled style={{ fontSize: 36, color: color || 'var(--rb-neon)' }} />
      </div>
      <h3 className="font-display rb-level-badge__title">{level || '—'}</h3>
    </div>
  );
}

export default function LevelSection({ data, history, loading }) {
  if (loading) {
    return (
      <section className="glass-card rb-summary-section">
        <h2 className="rb-headline font-display">Мой уровень</h2>
        <p className="rb-text-muted">Загрузка…</p>
      </section>
    );
  }

  if (!data?.current_level && !data?.is_completed) {
    return (
      <section className="glass-card rb-summary-section">
        <h2 className="rb-headline font-display">Мой уровень</h2>
        <p className="rb-text-muted" style={{ margin: 0 }}>
          Активируйте кроссовки, чтобы начать прогресс уровней.
        </p>
      </section>
    );
  }

  return (
    <section className="rb-summary-section rb-level-section">
      <h2 className="rb-headline font-display">Мой уровень</h2>
      <LevelBadge level={data.current_level} color={data.color} icon={data.icon} />

      <div className="glass-card rb-level-km" style={{ padding: 'var(--rb-card-padding)' }}>
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

      <div className="rb-level-subsection">
        <h3 className="rb-summary-goals__title">История уровней</h3>
        <div className="rb-level-history">
          {history.map((h) => (
            <div key={h.id} className="glass-card rb-level-history__row">
              <Icon name={h.icon || 'military_tech'} style={{ color: h.color || 'var(--rb-neon)' }} />
              <div style={{ flex: 1 }}>
                <strong>{h.level}</strong>
                <p className="rb-label" style={{ margin: '4px 0 0', textTransform: 'none' }}>
                  {Number(h.reached_km).toFixed(1)} км · {new Date(h.reached_at).toLocaleDateString('ru-RU')}
                </p>
              </div>
            </div>
          ))}
          {!history.length && <p className="rb-text-muted">Пока нет переходов</p>}
        </div>
      </div>

      <div className="rb-level-subsection">
        <h3 className="rb-summary-goals__title">Достижения</h3>
        <div className="rb-level-achievements">
          {(data.achievements || []).filter((a) => a.id !== 'complete').map((a) => (
            <div
              key={a.id}
              className="glass-card rb-level-achievement"
              style={{
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
      </div>
    </section>
  );
}
