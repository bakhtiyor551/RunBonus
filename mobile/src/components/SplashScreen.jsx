import BoltIcon from './BoltIcon';

/**
 * @param {{ mode?: 'default' | 'offline' }} props
 */
export default function SplashScreen({ mode = 'default' }) {
  const offline = mode === 'offline';

  return (
    <div className={`rb-splash${offline ? ' rb-splash--offline' : ''}`}>
      <div className="rb-atmosphere">
        <div className="rb-atmosphere__blob" style={{ top: '-10%', right: '-10%', width: '50%', height: '50%' }} />
        <div
          className="rb-atmosphere__blob"
          style={{ bottom: '10%', left: '-15%', width: '60%', height: '60%', opacity: 0.5 }}
        />
      </div>
      <div className="rb-bolt-icon-wrap">
        <BoltIcon size="xl" glow />
      </div>
      <div className="rb-splash__logo">RunBonus</div>

      {offline ? (
        <>
          <p className="rb-splash__status">Нет интернета</p>
          <p className="rb-text-muted rb-splash__hint">Проверьте Wi‑Fi или мобильные данные</p>
          <div className="rb-splash__loader" aria-hidden>
            <div className="rb-splash__ring" />
            <span className="rb-label">Загрузка…</span>
          </div>
        </>
      ) : (
        <>
          <p className="rb-text-muted">Километры → награды</p>
          <div className="rb-splash__ring" />
        </>
      )}
    </div>
  );
}
