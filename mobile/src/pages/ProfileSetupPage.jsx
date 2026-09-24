import { useState } from 'react';
import { IonPage, IonContent } from '@ionic/react';
import { api, cacheUser } from '../api';
import BoltIcon from '../components/BoltIcon';
import CityPicker from '../components/CityPicker';

/**
 * После регистрации по телефону: имя + город.
 * Client ID уже создан на сервере (users.id).
 */
export default function ProfileSetupPage({ user, setUser }) {
  const [firstName, setFirstName] = useState(user?.first_name || '');
  const [city, setCity] = useState(
    user?.city && user.city !== 'Не указан' ? user.city : ''
  );
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const clientId = user?.clientId ?? user?.client_id ?? user?.id;

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    if (!firstName.trim()) {
      setError('Укажите имя');
      return;
    }
    if (!city.trim()) {
      setError('Выберите город');
      return;
    }
    setSaving(true);
    try {
      const profile = await api('/api/auth/profile', {
        method: 'PATCH',
        body: JSON.stringify({
          firstName: firstName.trim(),
          lastName: '',
          city: city.trim(),
        }),
      });
      cacheUser(profile);
      setUser(profile);
    } catch (err) {
      setError(err.message || 'Не удалось сохранить');
    } finally {
      setSaving(false);
    }
  };

  return (
    <IonPage>
      <header className="rb-header">
        <div className="rb-header__brand">
          <BoltIcon size="md" />
          <h1 className="rb-header__logo">RunBonus</h1>
        </div>
        <div style={{ width: 40 }} />
      </header>
      <IonContent>
        <main style={{ padding: '16px 24px 32px', maxWidth: 440, margin: '0 auto' }}>
          <form onSubmit={submit} className="glass-effect" style={{ padding: 24, borderRadius: 24 }}>
            <h2 className="font-display" style={{ fontSize: 22, margin: '0 0 8px' }}>
              Настройка профиля
            </h2>
            <p className="rb-text-muted" style={{ marginBottom: 16, fontSize: 14 }}>
              Укажите имя и город — можно изменить позже в профиле.
            </p>

            {clientId != null && (
              <div className="glass-card" style={{ padding: 14, marginBottom: 16 }}>
                <span className="rb-label">Ваш ID клиента</span>
                <p className="font-display font-tabular" style={{ margin: '6px 0 0', fontSize: 22, color: 'var(--rb-neon)' }}>
                  RB-{clientId}
                </p>
              </div>
            )}

            <label className="rb-label" style={{ display: 'block', marginBottom: 6 }}>
              Имя
            </label>
            <div className="rb-input-wrap" style={{ marginBottom: 14 }}>
              <input
                className="rb-input"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                placeholder="Как к вам обращаться"
                autoComplete="given-name"
                maxLength={60}
                required
              />
            </div>

            <CityPicker value={city} onChange={setCity} />

            {error && <p className="rb-text-error">{error}</p>}

            <button type="submit" className="rb-btn-primary" disabled={saving} style={{ width: '100%', marginTop: 16 }}>
              {saving ? 'Сохранение…' : 'Готово'}
            </button>
          </form>
        </main>
      </IonContent>
    </IonPage>
  );
}
