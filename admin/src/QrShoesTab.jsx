import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { adminApi } from './api';

async function qrDataUrl(text) {
  return QRCode.toDataURL(text, { width: 180, margin: 1, errorCorrectionLevel: 'M' });
}

function QrPreview({ code, size = 80 }) {
  const [src, setSrc] = useState('');

  useEffect(() => {
    let cancelled = false;
    qrDataUrl(code).then((url) => {
      if (!cancelled) setSrc(url);
    });
    return () => { cancelled = true; };
  }, [code]);

  if (!src) return <span className="qr-placeholder">…</span>;
  return <img src={src} alt={`QR ${code}`} width={size} height={size} className="qr-img" />;
}

function QrCard({ shoe }) {
  return (
    <div className="qr-card">
      <img src={shoe.qr_image} alt="" width={140} height={140} />
      <code className="qr-card__code">{shoe.unique_id}</code>
      <span className="qr-card__model">{shoe.model_name}</span>
    </div>
  );
}

export default function QrShoesTab() {
  const [shoes, setShoes] = useState([]);
  const [genForm, setGenForm] = useState({ model_name: 'Runner Pro', quantity: 5 });
  const [generated, setGenerated] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [filterModel, setFilterModel] = useState('');

  const loadShoes = async () => {
    const rows = await adminApi('/api/admin/shoes');
    setShoes(rows);
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

  return (
    <div>
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
        {error && <p style={{ color: 'crimson' }}>{error}</p>}
      </div>

      {generated.length > 0 && (
        <div className="glass-card card">
          <h3>Новые коды ({generated.length})</h3>
          <div className="qr-grid">
            {generated.map((s) => (
              <QrCard key={s.id} shoe={s} />
            ))}
          </div>
        </div>
      )}

      <div className="glass-card card">
        <h3>Каталог кодов</h3>
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
          <button type="button" onClick={loadShoes}>Обновить</button>
        </div>
        <table>
          <thead>
            <tr>
              <th>QR</th>
              <th>Код</th>
              <th>Категория</th>
              <th>Статус</th>
              <th>Клиент</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((s) => (
              <tr key={s.id}>
                <td><QrPreview code={s.unique_id} size={64} /></td>
                <td><code>{s.unique_id}</code></td>
                <td>{s.model_name}</td>
                <td>{s.status}</td>
                <td>{s.activated_by_phone || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
