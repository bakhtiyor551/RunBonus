import { useRef, useState } from 'react';
import DetailSheet, { StatRow } from '../DetailSheet';
import Icon from '../Icon';
import { compressReceiptImage } from '../../utils/compressImage';
import { analyzeNutritionPhoto, addNutritionEntry } from '../../services/nutrition';
import { showToast } from '../../utils/toast';

const MEALS = [
  { id: 'breakfast', label: 'Завтрак', icon: 'free_breakfast' },
  { id: 'lunch', label: 'Обед', icon: 'lunch_dining' },
  { id: 'dinner', label: 'Ужин', icon: 'dinner_dining' },
  { id: 'snack', label: 'Перекус', icon: 'cookie' },
];

export default function PhotoAnalysisSheet({ open, onClose, onSaved, mealType = 'lunch' }) {
  const cameraRef = useRef(null);
  const galleryRef = useRef(null);
  const [preview, setPreview] = useState('');
  const [analyzing, setAnalyzing] = useState(false);
  const [result, setResult] = useState(null);
  const [edit, setEdit] = useState({});
  const [saving, setSaving] = useState(false);
  const [selectedMeal, setSelectedMeal] = useState(mealType);

  const reset = () => {
    setPreview('');
    setResult(null);
    setEdit({});
    setAnalyzing(false);
  };

  const handleClose = () => {
    reset();
    onClose?.();
  };

  const handleFile = async (file) => {
    if (!file) return;
    try {
      const dataUrl = await compressReceiptImage(file);
      setPreview(dataUrl);
      setAnalyzing(true);
      const analysis = await analyzeNutritionPhoto(dataUrl);
      setResult(analysis);
      setEdit({
        name: analysis.name,
        grams: analysis.grams,
        portions: analysis.portions || 1,
        calories: analysis.calories,
        protein_g: analysis.protein_g,
        fat_g: analysis.fat_g,
        carbs_g: analysis.carbs_g,
      });
    } catch (e) {
      showToast(e?.message || 'Не удалось проанализировать фото');
      setPreview('');
    } finally {
      setAnalyzing(false);
    }
  };

  const selectAlternative = (alt) => {
    setEdit({
      name: alt.name,
      grams: alt.grams,
      portions: 1,
      calories: alt.calories,
      protein_g: alt.protein_g,
      fat_g: alt.fat_g,
      carbs_g: alt.carbs_g,
    });
    setResult((r) => ({ ...r, food_id: alt.food_id, low_confidence: false }));
  };

  const handleSave = async () => {
    if (!edit.name?.trim()) {
      showToast('Укажите название');
      return;
    }
    setSaving(true);
    try {
      await addNutritionEntry({
        name: edit.name,
        food_id: result?.food_id,
        meal_type: selectedMeal,
        grams: Number(edit.grams) || 100,
        portions: Number(edit.portions) || 1,
        calories: Number(edit.calories),
        protein_g: Number(edit.protein_g),
        fat_g: Number(edit.fat_g),
        carbs_g: Number(edit.carbs_g),
        source: 'photo_ai',
        photo_url: result?.photo_url,
        ai_confidence: result?.confidence,
      });
      showToast('Запись сохранена');
      onSaved?.();
      handleClose();
    } catch (e) {
      showToast(e?.message || 'Ошибка сохранения');
    } finally {
      setSaving(false);
    }
  };

  return (
    <DetailSheet open={open} title="Фото еды" titleId="photo-sheet-title" onClose={handleClose}>
      <input ref={cameraRef} type="file" accept="image/*" capture="environment" hidden onChange={(e) => handleFile(e.target.files?.[0])} />
      <input ref={galleryRef} type="file" accept="image/*" hidden onChange={(e) => handleFile(e.target.files?.[0])} />

      {!preview && (
        <div className="rb-nutrition-photo-actions">
          <button type="button" className="rb-nutrition-action-btn" onClick={() => cameraRef.current?.click()}>
            <Icon name="photo_camera" />
            Сделать фото
          </button>
          <button type="button" className="rb-nutrition-action-btn" onClick={() => galleryRef.current?.click()}>
            <Icon name="photo_library" />
            Выбрать из галереи
          </button>
        </div>
      )}

      {preview && (
        <div className="rb-nutrition-photo-preview">
          <img src={preview} alt="Еда" />
        </div>
      )}

      {analyzing && <p className="rb-text-muted rb-nutrition-analyzing">AI анализирует изображение…</p>}

      {result && !analyzing && (
        <>
          {result.low_confidence && result.alternatives?.length > 0 && (
            <div className="rb-nutrition-alternatives">
              <p className="rb-label">ИИ не уверен ({result.confidence}%). Выберите блюдо:</p>
              <div className="rb-nutrition-alt-list">
                {[result, ...result.alternatives].slice(0, 4).map((alt) => (
                  <button key={alt.name} type="button" className="rb-nutrition-alt-btn" onClick={() => selectAlternative(alt)}>
                    {alt.name}
                    <span>{alt.confidence ?? '—'}%</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="rb-nutrition-confidence">
            <Icon name="auto_awesome" />
            {result.name} — {result.confidence}% уверенность
          </div>

          <label className="rb-field">
            Название
            <input value={edit.name || ''} onChange={(e) => setEdit({ ...edit, name: e.target.value })} />
          </label>
          <div className="rb-nutrition-edit-grid">
            <label className="rb-field">
              Вес (г)
              <input type="number" value={edit.grams || ''} onChange={(e) => setEdit({ ...edit, grams: e.target.value })} />
            </label>
            <label className="rb-field">
              Порции
              <input type="number" step="0.5" value={edit.portions || 1} onChange={(e) => setEdit({ ...edit, portions: e.target.value })} />
            </label>
          </div>

          <StatRow label="Калории" value={`${edit.calories || 0} kcal`} highlight />
          <StatRow label="Белки" value={`${edit.protein_g || 0} г`} />
          <StatRow label="Жиры" value={`${edit.fat_g || 0} г`} />
          <StatRow label="Углеводы" value={`${edit.carbs_g || 0} г`} />

          <p className="rb-label">Приём пищи</p>
          <div className="rb-nutrition-meals">
            {MEALS.map((m) => (
              <button
                key={m.id}
                type="button"
                className={`rb-nutrition-meal-btn${selectedMeal === m.id ? ' active' : ''}`}
                onClick={() => setSelectedMeal(m.id)}
              >
                <Icon name={m.icon} />
                {m.label}
              </button>
            ))}
          </div>

          <button type="button" className="rb-btn-pill" disabled={saving} onClick={handleSave}>
            {saving ? 'Сохранение…' : 'Подтвердить'}
          </button>
        </>
      )}
    </DetailSheet>
  );
}
