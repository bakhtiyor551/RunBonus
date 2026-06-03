import Icon from './Icon';

/** Палитра по умолчанию, если в админке не задан hex. */
const LABEL_HEX = {
  black: '#1a1a1a',
  white: '#f5f5f5',
  green: '#22c55e',
  grey: '#6b7280',
  gray: '#6b7280',
  orange: '#f97316',
  neon: '#c3f400',
  red: '#ef4444',
  blue: '#3b82f6',
};

function hexForColor(c) {
  if (c.hex_code && /^#[0-9A-Fa-f]{3,8}$/.test(c.hex_code)) return c.hex_code;
  const key = String(c.label || '')
    .toLowerCase()
    .replace(/[^a-z]/g, ' ');
  for (const [word, hex] of Object.entries(LABEL_HEX)) {
    if (key.includes(word)) return hex;
  }
  return '#444444';
}

export default function ColorPicker({ colors, value, onChange }) {
  if (!colors?.length) return null;
  const list = colors.length > 0 ? colors : [];

  return (
    <section style={{ marginBottom: 20 }}>
      <p className="rb-label" style={{ marginBottom: 8 }}>
        Цвет
      </p>
      <div className="rb-color-picker">
        {list.map((c) => {
          const key = c.id ?? c.label;
          const active = value === c.label;
          const hex = hexForColor(c);
          return (
            <button
              key={key}
              type="button"
              className={`rb-color-chip${active ? ' rb-color-chip--active' : ''}`}
              onClick={() => onChange(c)}
              title={c.label}
            >
              <span className="rb-color-chip__swatch" style={{ background: hex }} />
              <span className="rb-color-chip__label">{c.label}</span>
              {active && <Icon name="check" style={{ fontSize: 16, marginLeft: 4 }} />}
            </button>
          );
        })}
      </div>
    </section>
  );
}
