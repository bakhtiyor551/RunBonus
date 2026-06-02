import { useEffect, useState } from 'react';
import { adminApi } from './api';

const emptyVariant = () => ({
  name: '',
  slug: '',
  color_name: '',
  color_code: '#c3f400',
  glb_file: '',
  usdz_file: '',
  is_default: false,
  status: 'active',
});

const emptyForm = {
  name: 'Urban Sprint',
  slug: 'urban-sprint',
  description: '',
  price: '',
  product_id: '',
  main_image: '',
  glb_file: '',
  usdz_file: '',
  status: 'active',
  variants: [
    { ...emptyVariant(), name: 'Night Pulse', slug: 'night-pulse', color_name: 'Night Pulse', color_code: '#0a0a0a', is_default: true },
    { ...emptyVariant(), name: 'Midnight Gold', slug: 'midnight-gold', color_name: 'Midnight Gold', color_code: '#3d3d3d' },
    { ...emptyVariant(), name: 'Arctic Drive', slug: 'arctic-drive', color_name: 'Arctic Drive', color_code: '#f5f5f5' },
    { ...emptyVariant(), name: 'Stealth Mode', slug: 'stealth-mode', color_name: 'Stealth Mode', color_code: '#1a1a1a' },
  ],
};

export default function ArShoeModelsTab() {
  const [models, setModels] = useState([]);
  const [form, setForm] = useState(emptyForm);
  const [editId, setEditId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);

  const load = () => {
    setLoading(true);
    adminApi('/api/admin/shoe-models')
      .then(setModels)
      .catch(() => setModels([]))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, []);

  const startEdit = (m) => {
    setEditId(m.id);
    setForm({
      name: m.name,
      slug: m.slug,
      description: m.description || '',
      price: m.price != null ? String(m.price) : '',
      product_id: m.product_id || '',
      main_image: m.main_image || '',
      glb_file: m.glb_file || '',
      usdz_file: m.usdz_file || '',
      status: m.status,
      variants: m.variants?.length
        ? m.variants.map((v) => ({
            name: v.name,
            slug: v.slug,
            color_name: v.color_name,
            color_code: v.color_code,
            glb_file: v.glb_file || '',
            usdz_file: v.usdz_file || '',
            is_default: !!v.is_default,
            status: v.status,
          }))
        : [emptyVariant()],
    });
  };

  const save = async (e) => {
    e.preventDefault();
    const payload = {
      ...form,
      price: form.price ? Number(form.price) : null,
      product_id: form.product_id ? Number(form.product_id) : null,
      variants: form.variants.filter((v) => v.name && v.slug),
    };
    if (editId) {
      await adminApi(`/api/admin/shoe-models/${editId}`, { method: 'PUT', body: JSON.stringify(payload) });
    } else {
      await adminApi('/api/admin/shoe-models', { method: 'POST', body: JSON.stringify(payload) });
    }
    setForm(emptyForm);
    setEditId(null);
    load();
  };

  const uploadFile = async (file, filename) => {
    setUploading(true);
    try {
      const token = localStorage.getItem('adminToken');
      const fd = new FormData();
      fd.append('file', file);
      fd.append('filename', filename);
      const base = import.meta.env.VITE_API_URL || '';
      const res = await fetch(`${base}/api/admin/shoe-models/upload`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: fd,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Ошибка загрузки');
      return data.url;
    } finally {
      setUploading(false);
    }
  };

  const onFilePick = async (e, target, variantIndex = null) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    const url = await uploadFile(file, file.name.replace(/\.[^.]+$/, ''));
    if (variantIndex != null) {
      const variants = [...form.variants];
      variants[variantIndex] = { ...variants[variantIndex], [target]: url };
      setForm({ ...form, variants });
    } else {
      setForm({ ...form, [target]: url });
    }
  };

  const deactivate = async (id) => {
    if (!confirm('Отключить модель?')) return;
    await adminApi(`/api/admin/shoe-models/${id}`, { method: 'DELETE' });
    load();
  };

  return (
    <div className="page-content">
      <div className="glass-card card">
        <h2>AR-модели (Urban Sprint)</h2>
        <p className="hint">Загрузка .glb / .usdz для примерки в приложении. До загрузки используется демо-модель.</p>

        <form className="settings-form" onSubmit={save} style={{ marginBottom: 24 }}>
          <h3>{editId ? `Редактировать #${editId}` : 'Новая модель'}</h3>
          <label>
            Название
            <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
          </label>
          <label>
            Slug
            <input value={form.slug} onChange={(e) => setForm({ ...form, slug: e.target.value })} required />
          </label>
          <label>
            ID товара (products)
            <input value={form.product_id} onChange={(e) => setForm({ ...form, product_id: e.target.value })} />
          </label>
          <label>
            Цена
            <input type="number" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} />
          </label>
          <label>
            Описание
            <textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={3} />
          </label>
          <label>
            GLB (модель)
            <input value={form.glb_file} onChange={(e) => setForm({ ...form, glb_file: e.target.value })} placeholder="/models/..." />
            <input type="file" accept=".glb,.gltf" onChange={(e) => onFilePick(e, 'glb_file')} disabled={uploading} />
          </label>
          <label>
            USDZ (iOS)
            <input value={form.usdz_file} onChange={(e) => setForm({ ...form, usdz_file: e.target.value })} placeholder="/models/..." />
            <input type="file" accept=".usdz" onChange={(e) => onFilePick(e, 'usdz_file')} disabled={uploading} />
          </label>

          <h4>Варианты цвета</h4>
          {form.variants.map((v, i) => (
            <div key={i} className="glass-card" style={{ padding: 12, marginBottom: 12 }}>
              <label>
                Название
                <input value={v.name} onChange={(e) => {
                  const variants = [...form.variants];
                  variants[i] = { ...v, name: e.target.value };
                  setForm({ ...form, variants });
                }} />
              </label>
              <label>
                Slug
                <input value={v.slug} onChange={(e) => {
                  const variants = [...form.variants];
                  variants[i] = { ...v, slug: e.target.value };
                  setForm({ ...form, variants });
                }} />
              </label>
              <label>
                Цвет (hex)
                <input value={v.color_code} onChange={(e) => {
                  const variants = [...form.variants];
                  variants[i] = { ...v, color_code: e.target.value };
                  setForm({ ...form, variants });
                }} />
              </label>
              <label>
                GLB
                <input value={v.glb_file} onChange={(e) => {
                  const variants = [...form.variants];
                  variants[i] = { ...v, glb_file: e.target.value };
                  setForm({ ...form, variants });
                }} />
                <input type="file" accept=".glb" onChange={(e) => onFilePick(e, 'glb_file', i)} disabled={uploading} />
              </label>
              <label>
                <input
                  type="checkbox"
                  checked={!!v.is_default}
                  onChange={(e) => {
                    const variants = form.variants.map((x, j) => ({
                      ...x,
                      is_default: j === i ? e.target.checked : false,
                    }));
                    setForm({ ...form, variants });
                  }}
                />{' '}
                По умолчанию
              </label>
            </div>
          ))}

          <button className="btn btn--primary" type="submit" disabled={uploading}>
            {uploading ? 'Загрузка…' : 'Сохранить'}
          </button>
          {editId && (
            <button type="button" className="btn btn--ghost" onClick={() => { setEditId(null); setForm(emptyForm); }}>
              Отмена
            </button>
          )}
        </form>

        {loading && <p>Загрузка…</p>}
        <table className="data-table">
          <thead>
            <tr>
              <th>ID</th>
              <th>Название</th>
              <th>Slug</th>
              <th>Варианты</th>
              <th>Статус</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {models.map((m) => (
              <tr key={m.id}>
                <td>{m.id}</td>
                <td>{m.name}</td>
                <td>{m.slug}</td>
                <td>{m.variants?.length || 0}</td>
                <td>{m.status}</td>
                <td>
                  <button type="button" className="btn btn--sm" onClick={() => startEdit(m)}>
                    Изменить
                  </button>
                  <button type="button" className="btn btn--sm btn--ghost" onClick={() => deactivate(m.id)}>
                    Выкл
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
