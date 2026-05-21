import BoltIcon from './BoltIcon';

export default function SplashScreen() {
  return (
    <div className="rb-splash">
      <div className="rb-atmosphere">
        <div className="rb-atmosphere__blob" style={{ top: '-10%', right: '-10%', width: '50%', height: '50%' }} />
        <div className="rb-atmosphere__blob" style={{ bottom: '10%', left: '-15%', width: '60%', height: '60%', opacity: 0.5 }} />
      </div>
      <div className="rb-bolt-icon-wrap">
        <BoltIcon size="xl" glow />
      </div>
      <div className="rb-splash__logo">RunBonus</div>
      <p className="rb-text-muted">Бонусы за каждый километр</p>
      <div className="rb-splash__ring" />
    </div>
  );
}
