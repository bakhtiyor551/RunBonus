import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { IonPage, IonContent } from '@ionic/react';
import AppHeader from '../components/AppHeader';
import Icon from '../components/Icon';
import { updateNutritionProfile } from '../services/nutrition';
import { showToast } from '../utils/toast';

const ACTIVITY_LEVELS = [
  { id: 'sedentary', label: 'Мало двигаюсь', desc: 'Сидячая работа' },
  { id: 'light', label: 'Лёгкая', desc: '1–2 тренировки в неделю' },
  { id: 'moderate', label: 'Умеренная', desc: '3–4 тренировки' },
  { id: 'active', label: 'Активная', desc: '5–6 тренировок' },
  { id: 'very_active', label: 'Очень активная', desc: 'Каждый день' },
];

const GOALS = [
  { id: 'lose', label: 'Похудеть', icon: 'trending_down' },
  { id: 'maintain', label: 'Поддержать вес', icon: 'balance' },
  { id: 'gain', label: 'Набрать массу', icon: 'trending_up' },
];

function calcPreview(form) {
  const w = Number(form.weight_kg) || 70;
  const h = Number(form.height_cm) || 170;
  const age = new Date().getFullYear() - (Number(form.birth_year) || 1990);
  let bmr = form.gender === 'female'
    ? 10 * w + 6.25 * h - 5 * age - 161
    : 10 * w + 6.25 * h - 5 * age + 5;
  const mult = { sedentary: 1.2, light: 1.375, moderate: 1.55, active: 1.725, very_active: 1.9 }[form.activity_level] || 1.55;
  let tdee = Math.round(bmr * mult);
  if (form.goal === 'lose') tdee -= 400;
  if (form.goal === 'gain') tdee += 300;
  return Math.max(1200, tdee);
}

export default function NutritionOnboardingPage() {
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    gender: 'male',
    birth_year: 1990,
    height_cm: 170,
    weight_kg: 70,
    target_weight_kg: '',
    activity_level: 'moderate',
    goal: 'maintain',
  });

  const previewCalories = useMemo(() => calcPreview(form), [form]);
  const totalSteps = 4;

  const next = () => setStep((s) => Math.min(s + 1, totalSteps));
  const back = () => setStep((s) => Math.max(s - 1, 0));

  const finish = async () => {
    setSaving(true);
    try {
      const payload = {
        ...form,
        target_weight_kg: form.target_weight_kg ? Number(form.target_weight_kg) : null,
        onboarding_completed: true,
      };
      await updateNutritionProfile(payload);
      showToast('Профиль настроен');
      navigate('/nutrition', { replace: true });
    } catch (e) {
      showToast(e?.message || 'Ошибка сохранения');
    } finally {
      setSaving(false);
    }
  };

  return (
    <IonPage>
      <AppHeader onBack={() => (step > 0 ? back() : navigate('/summary'))} showAvatar={false} />
      <IonContent>
        <main className="rb-main rb-nutrition-onboarding">
          <div className="rb-nutrition-onboarding__progress">
            {[0, 1, 2, 3, 4].map((i) => (
              <span key={i} className={`rb-nutrition-onboarding__dot${i <= step ? ' active' : ''}`} />
            ))}
          </div>

          {step === 0 && (
            <section className="rb-nutrition-onboarding__step">
              <div className="rb-nutrition-onboarding__icon" aria-hidden>
                <Icon name="restaurant" />
              </div>
              <h1 className="font-display">Настройка питания</h1>
              <p className="rb-text-muted">
                Ответьте на несколько вопросов — мы рассчитаем вашу дневную норму калорий и БЖУ.
              </p>
              <button type="button" className="rb-btn-pill" onClick={next}>Начать</button>
            </section>
          )}

          {step === 1 && (
            <section className="rb-nutrition-onboarding__step">
              <h2 className="font-display">О вас</h2>
              <p className="rb-text-muted">Для расчёта базового обмена веществ</p>
              <div className="rb-nutrition-onboarding__choices">
                {['male', 'female'].map((g) => (
                  <button
                    key={g}
                    type="button"
                    className={`rb-nutrition-onboarding__choice${form.gender === g ? ' active' : ''}`}
                    onClick={() => setForm({ ...form, gender: g })}
                  >
                    {g === 'male' ? 'Мужской' : 'Женский'}
                  </button>
                ))}
              </div>
              <label className="rb-field">
                Год рождения
                <input
                  type="number"
                  min={1940}
                  max={2015}
                  value={form.birth_year}
                  onChange={(e) => setForm({ ...form, birth_year: e.target.value })}
                />
              </label>
              <button type="button" className="rb-btn-pill" onClick={next}>Далее</button>
            </section>
          )}

          {step === 2 && (
            <section className="rb-nutrition-onboarding__step">
              <h2 className="font-display">Параметры тела</h2>
              <label className="rb-field">
                Рост (см)
                <input type="number" value={form.height_cm} onChange={(e) => setForm({ ...form, height_cm: e.target.value })} />
              </label>
              <label className="rb-field">
                Текущий вес (кг)
                <input type="number" step="0.1" value={form.weight_kg} onChange={(e) => setForm({ ...form, weight_kg: e.target.value })} />
              </label>
              <label className="rb-field">
                Желаемый вес (кг, необязательно)
                <input type="number" step="0.1" value={form.target_weight_kg} onChange={(e) => setForm({ ...form, target_weight_kg: e.target.value })} placeholder="—" />
              </label>
              <button type="button" className="rb-btn-pill" onClick={next}>Далее</button>
            </section>
          )}

          {step === 3 && (
            <section className="rb-nutrition-onboarding__step">
              <h2 className="font-display">Активность и цель</h2>
              <span className="rb-label">Уровень активности</span>
              <div className="rb-nutrition-onboarding__list">
                {ACTIVITY_LEVELS.map((a) => (
                  <button
                    key={a.id}
                    type="button"
                    className={`rb-nutrition-onboarding__list-item${form.activity_level === a.id ? ' active' : ''}`}
                    onClick={() => setForm({ ...form, activity_level: a.id })}
                  >
                    <strong>{a.label}</strong>
                    <span className="rb-text-muted">{a.desc}</span>
                  </button>
                ))}
              </div>
              <span className="rb-label">Цель</span>
              <div className="rb-nutrition-onboarding__choices">
                {GOALS.map((g) => (
                  <button
                    key={g.id}
                    type="button"
                    className={`rb-nutrition-onboarding__choice${form.goal === g.id ? ' active' : ''}`}
                    onClick={() => setForm({ ...form, goal: g.id })}
                  >
                    <Icon name={g.icon} />
                    {g.label}
                  </button>
                ))}
              </div>
              <button type="button" className="rb-btn-pill" onClick={next}>Далее</button>
            </section>
          )}

          {step === 4 && (
            <section className="rb-nutrition-onboarding__step">
              <h2 className="font-display">Ваша норма</h2>
              <div className="glass-card rb-nutrition-onboarding__result">
                <span className="rb-label">Дневная цель</span>
                <strong className="font-display font-tabular">{previewCalories}</strong>
                <span className="rb-text-muted">kcal / день</span>
              </div>
              <p className="rb-text-muted rb-nutrition-onboarding__hint">
                Норма рассчитана по формуле Mifflin-St Jeor с учётом активности и цели. Вы сможете изменить её в профиле питания.
              </p>
              <button type="button" className="rb-btn-pill" onClick={finish} disabled={saving}>
                {saving ? 'Сохранение…' : 'Перейти к дневнику'}
              </button>
            </section>
          )}
        </main>
      </IonContent>
    </IonPage>
  );
}
