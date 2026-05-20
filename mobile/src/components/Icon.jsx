export default function Icon({ name, filled, className = '', style }) {
  return (
    <span
      className={`material-symbols-outlined${filled ? ' filled' : ''} ${className}`.trim()}
      style={style}
      aria-hidden
    >
      {name}
    </span>
  );
}
