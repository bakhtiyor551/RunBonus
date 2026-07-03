import { useEffect, useState } from 'react';
import DetailSheet from '../DetailSheet';
import { updateNutritionEntry } from '../../services/nutrition';
import { showToast } from '../../utils/toast';

const MEALS = [
  { id: 'breakfast', label: 'Завтрак' },
  { id: 'lunch', label: 'Обед' },
  { id: 'dinner', label: 'Ужин' },
  { id: 'snack', label: 'Перекус' },
];

export default function EditFoodSheet({ open, entry, onClose, onSaved }) {
  const [form, setForm] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (entry) {
      setForm({
        name: entry.name || '',
        grams: entry.grams ?? 250,
        calories: entry.calories ?? '',
        protein_g: entry.protein_g ?? '',
        fat_g: entry.fat_g ?? '',
        carbs_g: entry.carbs_g ?? '',
        meal_type: entry.meal_type || 'lunch',
      });
    } else {
      setForm(null);
    }
  }, [entry]);

  const submit = async (e) => {
    e.preventDefault();
    if (!form?.name?.trim() || !entry?.id) return;
    setSaving(true);
    try {
      await updateNutritionEntry(entry.id, form);
      showToast('Сохранено');
      onSaved?.();
      onClose?.();
    } catch (err) {
      showToast(err?.message || 'Ошибка');
    } finally {
      setSaving(false);
    }
  };

  if (!form) return null;

  return (
    <DetailSheet open={open} title="Редактировать" titleId="edit-food-title" onClose={onClose}>
      <form className="rb-nutrition-manual" onSubmit={submit}>
        <label className="rb-field">
          Название
          <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
        </label>
        <label className="rb-field">
          Вес (г)
          <input type="number" value={form.grams} onChange={(e) => setForm({ ...form, grams: e.target.value })} />
        </label>
        <label className="rb-field">
          Калории
          <input type="number" value={form.calories} onChange={(e) => setForm({ ...form, calories: e.target.value })} required />
        </label>
        <div className="rb-nutrition-edit-grid">
          <label className="rb-field">
            Белки (г)
            <input type="number" value={form.protein_g} onChange={(e) => setForm({ ...form, protein_g: e.target.value })} />
          </label>
          <label className="rb-field">
            Жиры (г)
            <input type="number" value={form.fat_g} onChange={(e) => setForm({ ...form, fat_g: e.target.value })} />
          </label>
          <label className="rb-field">
            Углеводы (г)
            <input type="number" value={form.carbs_g} onChange={(e) => setForm({ ...form, carbs_g: e.target.value })} />
          </label>
        </div>
        <label className="rb-field">
          Приём пищи
          <select value={form.meal_type} onChange={(e) => setForm({ ...form, meal_type: e.target.value })}>
            {MEALS.map((m) => (
              <option key={m.id} value={m.id}>{m.label}</option>
            ))}
          </select>
        </label>
        <button type="submit" className="rb-btn-pill" disabled={saving}>{saving ? '…' : 'Сохранить'}</button>
      </form>
    </DetailSheet>
  );
}
