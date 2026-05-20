import Icon from './Icon';

export default function SplashScreen() {
  return (
    <div className="rb-splash">
      <div className="rb-atmosphere">
        <div className="rb-atmosphere__blob" style={{ top: '-10%', right: '-10%', width: '50%', height: '50%' }} />
        <div className="rb-atmosphere__blob" style={{ bottom: '10%', left: '-15%', width: '60%', height: '60%', opacity: 0.5 }} />
      </div>
      <Icon name="bolt" filled style={{ fontSize: 56, color: 'var(--rb-neon)' }} />
      <div className="rb-splash__logo">RunBonus</div>
      <p className="rb-text-muted">Бонусы за каждый километр</p>
      <div className="rb-splash__ring" />
    </div>
  );
}
