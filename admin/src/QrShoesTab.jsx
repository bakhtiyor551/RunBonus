import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { adminApi } from './api';
import Icon from './components/Icon';
import { ClientProfileFromShoe } from './components/ClientProfileInfo';

async function qrDataUrl(text) {
  return QRCode.toDataURL(text, { width: 180, margin: 1, errorCorrectionLevel: 'M' });
}

const SHOE_STATUS = {
  new: { label: 'Новый', className: 'entity-card__status--new' },
  activated: { label: 'Активирован', className: 'entity-card__status--ok' },
  blocked: { label: 'Заблокирован', className: 'entity-card__status--bad' },
  expired: { label: 'Истёк', className: 'entity-card__status--muted' },
};

function QrPreview({ code, size = 120 }) {
  const [src, setSrc] = useState('');

  useEffect(() => {
    let cancelled = false;
    qrDataUrl(code).then((url) => {
      if (!cancelled) setSrc(url);
    });
    return () => { cancelled = true; };
  }, [code]);

  if (!src) {
    return (
      <span
        className="qr-placeholder"
        style={{ width: size, height: size, lineHeight: `${size}px` }}
      >
        …
      </span>
    );
  }
  return <img src={src} alt={`QR ${code}`} width={size} height={size} className="qr-img" />;
}

function ClientProfilePanel({ shoe, onClose }) {
  return (
    <div className="glass-card card shoes-client-profile">
      <div className="entity-page__header">
        <h3>Профиль клиента</h3>
        <button type="button" className="btn btn--ghost btn--sm" onClick={onClose}>
          <Icon name="close" />
          Закрыть
        </button>
      </div>
      <p className="hint shoes-client-profile__hint">
        Кроссовки <strong>{shoe.unique_id}</strong> · {shoe.model_name}
      </p>
      <ClientProfileFromShoe shoe={shoe} />
    </div>
  );
}

function ShoeCard({ shoe, selected, onSelect }) {
  const meta = SHOE_STATUS[shoe.status] ?? { label: shoe.status, className: '' };
  const hasClient = shoe.status === 'activated' && shoe.activated_by_user_id;
  const clickable = !!hasClient;

  return (
    <article
      className={`shoe-card glass-card${selected ? ' entity-card--selected' : ''}${clickable ? ' shoe-card--clickable' : ''}`}
      role={clickable ? 'button' : undefined}
      tabIndex={clickable ? 0 : undefined}
      onClick={clickable ? () => onSelect(shoe) : undefined}
      onKeyDown={
        clickable
          ? (e) => e.key === 'Enter' && onSelect(shoe)
          : undefined
      }
    >
      <div className="entity-card__head">
        <div className="entity-card__icon">
          <Icon name="steps" />
        </div>
        <span className={`chip ${meta.className}`}>{meta.label}</span>
      </div>
      <p className="entity-card__title entity-card__title--sm">{shoe.model_name}</p>
      <div className="shoe-card__qr">
        {shoe.qr_image ? (
          <img src={shoe.qr_image} alt="" width={140} height={140} className="qr-img" />
        ) : (
          <QrPreview code={shoe.unique_id} size={140} />
        )}
      </div>
      <code className="shoe-card__code">{shoe.unique_id}</code>
      <p className="entity-card__meta">
        <Icon name="person" />
        {shoe.activated_by_phone
          ? `${shoe.activated_by_name ? `${shoe.activated_by_name} · ` : ''}${shoe.activated_by_phone}`
          : 'Не привязан'}
      </p>
      {clickable && (
        <span className="entity-card__link">
          Профиль клиента <Icon name="arrow_forward" />
        </span>
      )}
    </article>
  );
}

export default function QrShoesTab() {
  const [shoes, setShoes] = useState([]);
  const [genForm, setGenForm] = useState({ model_name: 'Runner Pro', quantity: 5 });
  const [generated, setGenerated] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [filterModel, setFilterModel] = useState('');
  const [selectedShoe, setSelectedShoe] = useState(null);

  const loadShoes = async () => {
    const rows = await adminApi('/api/admin/shoes');
    setShoes(rows);
    if (selectedShoe) {
      const fresh = rows.find((s) => s.id === selectedShoe.id);
      if (fresh?.activated_by_user_id) setSelectedShoe(fresh);
      else setSelectedShoe(null);
    }
  };

  useEffect(() => {
    loadShoes().catch((e) => setError(e.message));
  }, []);

  const generateShoes = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    setGenerated([]);
    try {
      const data = await adminApi('/api/admin/shoes/generate', {
        method: 'POST',
        body: JSON.stringify(genForm),
      });
      const withQr = await Promise.all(
        data.shoes.map(async (s) => ({
          ...s,
          qr_image: await qrDataUrl(s.unique_id),
        }))
      );
      setGenerated(withQr);
      await loadShoes();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handlePrint = () => {
    if (!generated.length) {
      alert('Сначала сгенерируйте коды');
      return;
    }
    const esc = (s) =>
      String(s)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
    const cards = generated
      .map((s) => {
        const item = 'div';
        return (
          '<' + item + ' class="item">' +
          '<img src="' + esc(s.qr_image) + '" width="160" height="160" alt=""/>' +
          '<' + item + ' class="code">' + esc(s.unique_id) + '</' + item + '>' +
          '<' + item + ' class="model">' + esc(s.model_name) + '</' + item + '>' +
          '</' + item + '>'
        );
      })
      .join('');
    const html =
      '<!DOCTYPE html><html><head><meta charset="utf-8"><title>QR</title><style>' +
      'body{font-family:sans-serif;padding:16px}.grid{display:flex;flex-wrap:wrap;gap:12px}' +
      '.item{border:1px solid #ddd;padding:12px;width:190px;text-align:center;page-break-inside:avoid}' +
      '.code{font-weight:700;font-size:13px;margin-top:8px;word-break:break-all}' +
      '.model{font-size:11px;color:#666;margin-top:4px}' +
      '</style></head><body>' +
      '<h2>RunBonus — ' + esc(genForm.model_name) + '</h2>' +
      '<' + 'div' + ' class="grid">' + cards + '</' + 'div' + '>' +
      '</body></html>';
    const w = window.open('', '_blank');
    if (!w) return;
    w.document.write(html);
    w.document.close();
    w.focus();
    w.print();
  };

  const models = [...new Set(shoes.map((s) => s.model_name))].sort();
  const filtered = filterModel ? shoes.filter((s) => s.model_name === filterModel) : shoes;

  const openClientProfile = (shoe) => {
    if (shoe.status === 'activated' && shoe.activated_by_user_id) {
      setSelectedShoe(shoe);
    }
  };

  return (
    <div className="entity-page">
      <div className="glass-card card">
        <h2>Генерация кодов и QR</h2>
        <p className="hint">Категория (модель) и количество. Создаётся код SHOE-… и QR для печати на коробку.</p>
        <form className="inline-form" onSubmit={generateShoes}>
          <input
            placeholder="Категория / модель"
            value={genForm.model_name}
            onChange={(e) => setGenForm({ ...genForm, model_name: e.target.value })}
            required
          />
          <input
            type="number"
            min={1}
            max={500}
            value={genForm.quantity}
            onChange={(e) => setGenForm({ ...genForm, quantity: Number(e.target.value) })}
            required
          />
          <button className="primary" type="submit" disabled={loading}>
            {loading ? 'Генерация…' : 'Сгенерировать коды + QR'}
          </button>
          {generated.length > 0 && (
            <button type="button" onClick={handlePrint}>Печать QR</button>
          )}
        </form>
        {error && <p className="error-text">{error}</p>}
      </div>

      {generated.length > 0 && (
        <div className="glass-card card">
          <h3>Новые коды ({generated.length})</h3>
          <div className="entity-cards-grid entity-cards-grid--compact">
            {generated.map((s) => (
              <ShoeCard key={s.id} shoe={s} selected={false} onSelect={() => {}} />
            ))}
          </div>
        </div>
      )}

      {selectedShoe && (
        <ClientProfilePanel shoe={selectedShoe} onClose={() => setSelectedShoe(null)} />
      )}

      <div className="glass-card card">
        <div className="entity-page__header">
          <div>
            <h3>Каталог кроссовок</h3>
            <p className="hint">
              {filtered.length} из {shoes.length} пар
              {selectedShoe ? ' · выбран активированный QR' : ''}
            </p>
          </div>
          <div className="inline-form">
            <label>
              Категория:
              <select value={filterModel} onChange={(e) => setFilterModel(e.target.value)}>
                <option value="">Все</option>
                {models.map((m) => (
                  <option key={m} value={m}>{m}</option>
                ))}
              </select>
            </label>
            <button type="button" onClick={() => loadShoes().catch((e) => setError(e.message))}>
              Обновить
            </button>
          </div>
        </div>
        {filtered.length === 0 ? (
          <p className="entity-page__empty">Нет кроссовок по выбранному фильтру</p>
        ) : (
          <div className="entity-cards-grid entity-cards-grid--compact">
            {filtered.map((s) => (
              <ShoeCard
                key={s.id}
                shoe={s}
                selected={selectedShoe?.id === s.id}
                onSelect={openClientProfile}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
