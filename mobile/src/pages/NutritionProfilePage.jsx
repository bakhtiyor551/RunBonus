import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { IonPage, IonContent } from '@ionic/react';
import AppHeader from '../components/AppHeader';
import BottomNav from '../components/BottomNav';
import { fetchNutritionProfile, updateNutritionProfile } from '../services/nutrition';
import { showToast } from '../utils/toast';

const ACTIVITY = [
  { id: 'sedentary', label: 'Мало двигаюсь' },
  { id: 'light', label: 'Лёгкая' },
  { id: 'moderate', label: 'Умеренная' },
  { id: 'active', label: 'Активная' },
  { id: 'very_active', label: 'Очень активная' },
];

const GOALS = [
  { id: 'lose', label: 'Похудеть' },
  { id: 'maintain', label: 'Поддержать' },
  { id: 'gain', label: 'Набрать' },
];

export default function NutritionProfilePage() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(null);
  const [goals, setGoals] = useState(null);

  useEffect(() => {
    fetchNutritionProfile()
      .then((d) => {
        setForm({
          gender: d.profile?.gender || 'male',
          birth_year: d.profile?.birth_year || 1990,
          height_cm: d.profile?.height_cm || 170,
          weight_kg: d.profile?.weight_kg || 70,
          target_weight_kg: d.profile?.target_weight_kg || '',
          activity_level: d.profile?.activity_level || 'moderate',
          goal: d.profile?.goal || 'maintain',
        });
        setGoals(d.goals);
      })
      .catch(() => showToast('Ошибка загрузки'))
      .finally(() => setLoading(false));
  }, []);

  const save = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const result = await updateNutritionProfile({
        ...form,
        target_weight_kg: form.target_weight_kg ? Number(form.target_weight_kg) : null,
      });
      setGoals({
        daily_calories: result.daily_calories,
        daily_protein_g: result.daily_protein_g,
        daily_fat_g: result.daily_fat_g,
        daily_carbs_g: result.daily_carbs_g,
      });
      showToast('Сохранено');
    } catch (err) {
      showToast(err?.message || 'Ошибка');
    } finally {
      setSaving(false);
    }
  };

  return (
    <IonPage>
      <AppHeader onBack={() => navigate('/nutrition')} showAvatar={false} />
      <IonContent>
        <main className="rb-main rb-nutrition-profile">
          <h1 className="font-display">Профиль питания</h1>
          <p className="rb-text-muted">Параметры для расчёта нормы калорий и БЖУ</p>

          {loading ? (
            <p className="rb-text-muted">Загрузка…</p>
          ) : form && (
            <form className="rb-nutrition-profile__form glass-card" onSubmit={save}>
              <label className="rb-field">
                Пол
                <select value={form.gender} onChange={(e) => setForm({ ...form, gender: e.target.value })}>
                  <option value="male">Мужской</option>
                  <option value="female">Женский</option>
                </select>
              </label>
              <label className="rb-field">
                Год рождения
                <input type="number" value={form.birth_year} onChange={(e) => setForm({ ...form, birth_year: e.target.value })} />
              </label>
              <div className="rb-nutrition-edit-grid">
                <label className="rb-field">
                  Рост (см)
                  <input type="number" value={form.height_cm} onChange={(e) => setForm({ ...form, height_cm: e.target.value })} />
                </label>
                <label className="rb-field">
                  Вес (кг)
                  <input type="number" step="0.1" value={form.weight_kg} onChange={(e) => setForm({ ...form, weight_kg: e.target.value })} />
                </label>
              </div>
              <label className="rb-field">
                Желаемый вес (кг)
                <input type="number" step="0.1" value={form.target_weight_kg} onChange={(e) => setForm({ ...form, target_weight_kg: e.target.value })} />
              </label>
              <label className="rb-field">
                Активность
                <select value={form.activity_level} onChange={(e) => setForm({ ...form, activity_level: e.target.value })}>
                  {ACTIVITY.map((a) => <option key={a.id} value={a.id}>{a.label}</option>)}
                </select>
              </label>
              <label className="rb-field">
                Цель
                <select value={form.goal} onChange={(e) => setForm({ ...form, goal: e.target.value })}>
                  {GOALS.map((g) => <option key={g.id} value={g.id}>{g.label}</option>)}
                </select>
              </label>

              {goals && (
                <div className="rb-nutrition-profile__goals">
                  <span className="rb-label">Текущие цели</span>
                  <p><strong>{goals.daily_calories} kcal</strong> · Б {goals.daily_protein_g}г · Ж {goals.daily_fat_g}г · У {goals.daily_carbs_g}г</p>
                </div>
              )}

              <button type="submit" className="rb-btn-pill" disabled={saving}>{saving ? '…' : 'Сохранить'}</button>
            </form>
          )}
        </main>
      </IonContent>
      <BottomNav />
    </IonPage>
  );
}
