import { useMemo, useState } from 'react';
import DetailSheet from './DetailSheet';
import Icon from './Icon';
import { TAJIKISTAN_CITIES } from '../data/tajikistanCities';

export default function CityPicker({ value, onChange, label = 'Город' }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return TAJIKISTAN_CITIES;
    return TAJIKISTAN_CITIES.filter((c) => c.toLowerCase().includes(q));
  }, [query]);

  const pick = (city) => {
    onChange(city);
    setOpen(false);
    setQuery('');
  };

  return (
    <>
      <div style={{ marginBottom: 12 }}>
        <label className="rb-label" style={{ display: 'block', marginBottom: 4 }}>
          {label}
        </label>
        <button
          type="button"
          className="rb-input-wrap rb-city-picker-trigger"
          onClick={() => setOpen(true)}
          aria-haspopup="listbox"
          aria-expanded={open}
        >
          <span className={`rb-city-picker-value${value ? '' : ' rb-city-picker-value--placeholder'}`}>
            {value || 'Выберите город'}
          </span>
          <Icon name="expand_more" style={{ fontSize: 22, color: 'var(--rb-on-surface-variant)' }} />
        </button>
      </div>

      <DetailSheet open={open} title="Города Таджикистана" titleId="city-picker-title" onClose={() => setOpen(false)}>
        <div className="rb-city-picker-search">
          <div className="rb-input-wrap">
            <input
              className="rb-input"
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Поиск города"
              autoFocus
            />
          </div>
        </div>
        <ul className="rb-city-picker-list" role="listbox" aria-label="Города Таджикистана">
          {filtered.length > 0 ? (
            filtered.map((city) => (
              <li key={city}>
                <button
                  type="button"
                  className={`rb-city-picker-item${value === city ? ' rb-city-picker-item--active' : ''}`}
                  role="option"
                  aria-selected={value === city}
                  onClick={() => pick(city)}
                >
                  <span>{city}</span>
                  {value === city && <Icon name="check" style={{ fontSize: 20 }} />}
                </button>
              </li>
            ))
          ) : (
            <li className="rb-text-muted" style={{ padding: '12px 4px', listStyle: 'none' }}>
              Город не найден
            </li>
          )}
        </ul>
      </DetailSheet>
    </>
  );
}
