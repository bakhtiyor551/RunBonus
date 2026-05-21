const SIZES = { sm: 20, md: 28, lg: 56, xl: 80 };

/** Логотип RunBonus — молния Material Symbols `bolt` */
export default function BoltIcon({ size = 'md', glow = false, className = '', style }) {
  const fontSize = typeof size === 'number' ? size : SIZES[size] ?? SIZES.md;

  return (
    <span
      className={`material-symbols-outlined filled rb-bolt-icon${glow ? ' rb-bolt-icon--glow' : ''} ${className}`.trim()}
      style={{ fontSize, ...style }}
      aria-hidden
    >
      bolt
    </span>
  );
}
