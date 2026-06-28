import { useEffect, useState } from 'react';
import DetailSheet from '../DetailSheet';
import Icon from '../Icon';
import {
  searchNutritionFoods,
  fetchNutritionFavorites,
  addNutritionEntry,
} from '../../services/nutrition';
import { showToast } from '../../utils/toast';

const MEALS = [
  { id: 'breakfast', label: 'Завтрак' },
  { id: 'lunch', label: 'Обед' },
  { id: 'dinner', label: 'Ужин' },
  { id: 'snack', label: 'Перекус' },
];

function ManualForm({ mealType, onSaved, onClose }) {
  const [form, setForm] = useState({
    name: '',
    grams: 250,
    calories: '',
    protein_g: '',
    fat_g: '',
    carbs_g: '',
    meal_type: mealType,
  });
  const [saving, setSaving] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    if (!form.name.trim()) {
      showToast('Укажите название');
      return;
    }
    setSaving(true);
    try {
      await addNutritionEntry({ ...form, source: 'manual' });
      showToast('Добавлено');
      onSaved?.();
      onClose?.();
    } catch (err) {
      showToast(err?.message || 'Ошибка');
    } finally {
      setSaving(false);
    }
  };

  return (
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
  );
}

function FoodPicker({ mealType, onSaved, onClose }) {
  const [q, setQ] = useState('');
  const [foods, setFoods] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const t = setTimeout(async () => {
      setLoading(true);
      try {
        const data = await searchNutritionFoods(q);
        setFoods(data.foods || []);
      } catch {
        setFoods([]);
      } finally {
        setLoading(false);
      }
    }, 300);
    return () => clearTimeout(t);
  }, [q]);

  const pick = async (food) => {
    try {
      const n = food.default_nutrients;
      await addNutritionEntry({
        food_id: food.id,
        name: food.name,
        meal_type: mealType,
        grams: food.serving_grams,
        portions: 1,
        calories: n.calories,
        protein_g: n.protein_g,
        fat_g: n.fat_g,
        carbs_g: n.carbs_g,
        source: 'search',
      });
      showToast(`${food.name} добавлено`);
      onSaved?.();
      onClose?.();
    } catch (e) {
      showToast(e?.message || 'Ошибка');
    }
  };

  return (
    <div className="rb-nutrition-search">
      <input
        className="rb-input"
        placeholder="Поиск блюда…"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        autoFocus
      />
      {loading && <p className="rb-text-muted">Поиск…</p>}
      <ul className="rb-nutrition-food-list">
        {foods.map((f) => (
          <li key={f.id}>
            <button type="button" className="rb-nutrition-food-item" onClick={() => pick(f)}>
              <span>{f.name}</span>
              <span className="rb-text-muted">{f.default_nutrients?.calories} kcal</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function FavoritesList({ mealType, onSaved, onClose }) {
  const [items, setItems] = useState([]);

  useEffect(() => {
    fetchNutritionFavorites().then((d) => setItems(d.favorites || [])).catch(() => setItems([]));
  }, []);

  const pick = async (food) => {
    try {
      const n = food.default_nutrients;
      await addNutritionEntry({
        food_id: food.id,
        name: food.name,
        meal_type: mealType,
        grams: food.serving_grams,
        calories: n.calories,
        protein_g: n.protein_g,
        fat_g: n.fat_g,
        carbs_g: n.carbs_g,
        source: 'favorite',
      });
      showToast('Добавлено из избранного');
      onSaved?.();
      onClose?.();
    } catch (e) {
      showToast(e?.message || 'Ошибка');
    }
  };

  if (!items.length) return <p className="rb-text-muted">Избранное пусто</p>;

  return (
    <ul className="rb-nutrition-food-list">
      {items.map((f) => (
        <li key={f.id}>
          <button type="button" className="rb-nutrition-food-item" onClick={() => pick(f)}>
            <span>{f.name}</span>
            <span className="rb-text-muted">{f.default_nutrients?.calories} kcal</span>
          </button>
        </li>
      ))}
    </ul>
  );
}

export default function AddFoodSheet({ open, onClose, onPhoto, onSaved, mealType = 'lunch' }) {
  const [mode, setMode] = useState(null);

  useEffect(() => {
    if (!open) setMode(null);
  }, [open]);

  const handleClose = () => {
    setMode(null);
    onClose?.();
  };

  const titles = {
    null: 'Добавить еду',
    search: 'Поиск блюда',
    manual: 'Вручную',
    favorites: 'Избранное',
  };

  return (
    <DetailSheet open={open} title={titles[mode] || titles.null} titleId="add-food-title" onClose={handleClose}>
      {!mode && (
        <div className="rb-nutrition-add-menu">
          <button type="button" className="rb-nutrition-add-opt" onClick={() => { handleClose(); onPhoto?.(); }}>
            <Icon name="photo_camera" />
            <span>Фото</span>
          </button>
          <button type="button" className="rb-nutrition-add-opt" onClick={() => setMode('search')}>
            <Icon name="search" />
            <span>Поиск</span>
          </button>
          <button type="button" className="rb-nutrition-add-opt" onClick={() => setMode('manual')}>
            <Icon name="edit" />
            <span>Вручную</span>
          </button>
          <button type="button" className="rb-nutrition-add-opt" onClick={() => setMode('favorites')}>
            <Icon name="star" />
            <span>Избранное</span>
          </button>
        </div>
      )}
      {mode === 'search' && <FoodPicker mealType={mealType} onSaved={onSaved} onClose={handleClose} />}
      {mode === 'manual' && <ManualForm mealType={mealType} onSaved={onSaved} onClose={handleClose} />}
      {mode === 'favorites' && <FavoritesList mealType={mealType} onSaved={onSaved} onClose={handleClose} />}
    </DetailSheet>
  );
}
