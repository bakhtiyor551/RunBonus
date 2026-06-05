import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { IonPage, IonContent } from '@ionic/react';
import { api } from '../api';
import AppHeader from '../components/AppHeader';
import BottomNav from '../components/BottomNav';
import ShoeBindBanner from '../components/ShoeBindBanner';
import Icon from '../components/Icon';
import CityPicker from '../components/CityPicker';
import { formatBalance } from '../utils/format';
import { formatPhoneDisplay } from '../utils/phone';
import { compressImageFile, resolveAvatarUrl } from '../utils/avatar';

function profileCity(raw) {
  const s = String(raw || '').trim();
  if (!s || s === 'Не указан') return '';
  return s;
}

export default function ProfilePage({ user, setUser, onLogout }) {
  const navigate = useNavigate();
  const fileRef = useRef(null);
  const shoe = user.activeShoe;

  const [editing, setEditing] = useState(false);
  const [firstName, setFirstName] = useState(user.first_name || '');
  const [lastName, setLastName] = useState(user.last_name || '');
  const [city, setCity] = useState(profileCity(user.city));
  const [avatarPreview, setAvatarPreview] = useState(null);
  const [avatarBase64, setAvatarBase64] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [avatarCacheKey, setAvatarCacheKey] = useState(0);

  const displayAvatar =
    avatarPreview || resolveAvatarUrl(user.avatar_url, avatarCacheKey || undefined);

  useEffect(() => {
    if (!editing) {
      setFirstName(user.first_name || '');
      setLastName(user.last_name || '');
      setCity(profileCity(user.city));
    }
  }, [user.first_name, user.last_name, user.city, editing]);

  const startEdit = () => {
    setFirstName(user.first_name || '');
    setLastName(user.last_name || '');
    setCity(profileCity(user.city));
    setAvatarPreview(null);
    setAvatarBase64(null);
    setError('');
    setEditing(true);
  };

  const cancelEdit = () => {
    setEditing(false);
    setAvatarPreview(null);
    setAvatarBase64(null);
    setError('');
  };

  const onPickPhoto = () => fileRef.current?.click();

  const onFileChange = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setError('Выберите изображение');
      return;
    }
    try {
      const dataUrl = await compressImageFile(file);
      setAvatarPreview(dataUrl);
      setAvatarBase64(dataUrl);
      setError('');
    } catch (err) {
      setError(err.message || 'Не удалось обработать фото');
    }
  };

  const saveProfile = async () => {
    if (!firstName.trim() || !lastName.trim()) {
      setError('Укажите имя и фамилию');
      return;
    }
    if (!city.trim()) {
      setError('Выберите город');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const body = {
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        city: city.trim(),
      };
      if (avatarBase64) body.avatarBase64 = avatarBase64;
      const profile = await api('/api/auth/profile', {
        method: 'PATCH',
        body: JSON.stringify(body),
      });
      setUser(profile);
      setAvatarCacheKey(Date.now());
      setEditing(false);
      setAvatarPreview(null);
      setAvatarBase64(null);
    } catch (err) {
      setError(err.message || 'Не удалось сохранить');
    } finally {
      setSaving(false);
    }
  };

  return (
    <IonPage>
      <AppHeader showAvatar={false} />
      <IonContent>
        <main className="rb-main">
          <ShoeBindBanner user={user} />
          <section className="rb-profile-hero">
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              style={{ display: 'none' }}
              onChange={onFileChange}
            />
            <button
              type="button"
              className="rb-profile-avatar-btn"
              onClick={editing ? onPickPhoto : undefined}
              disabled={!editing}
              aria-label={editing ? 'Выбрать фото профиля' : 'Фото профиля'}
            >
              <div className="rb-profile-avatar">
                {displayAvatar ? (
                  <img src={displayAvatar} alt="" className="rb-profile-avatar__img" />
                ) : (
                  <Icon name="person" style={{ fontSize: 56, color: 'var(--rb-neon)' }} />
                )}
              </div>
              {editing && (
                <span className="rb-profile-avatar-badge">
                  <Icon name="photo_camera" style={{ fontSize: 20 }} />
                </span>
              )}
            </button>

            {editing ? (
              <form
                className="rb-profile-form"
                onSubmit={(e) => {
                  e.preventDefault();
                  saveProfile();
                }}
              >
                <label className="rb-profile-form__field">
                  <span className="rb-label">Имя</span>
                  <div className="rb-input-wrap">
                    <input
                      className="rb-input"
                      value={firstName}
                      onChange={(e) => setFirstName(e.target.value)}
                      autoComplete="given-name"
                      maxLength={60}
                    />
                  </div>
                </label>
                <label className="rb-profile-form__field">
                  <span className="rb-label">Фамилия</span>
                  <div className="rb-input-wrap">
                    <input
                      className="rb-input"
                      value={lastName}
                      onChange={(e) => setLastName(e.target.value)}
                      autoComplete="family-name"
                      maxLength={60}
                    />
                  </div>
                </label>
                <CityPicker value={city} onChange={setCity} />
                {error && <p className="rb-text-error">{error}</p>}
                <div className="rb-profile-form__actions">
                  <button type="submit" className="rb-btn-pill" disabled={saving} style={{ flex: 1 }}>
                    {saving ? 'Сохранение…' : 'Сохранить'}
                  </button>
                  <button type="button" className="rb-btn-outline" onClick={cancelEdit} disabled={saving}>
                    Отмена
                  </button>
                </div>
              </form>
            ) : (
              <>
                <h2 className="rb-headline font-display" style={{ margin: '0 0 4px' }}>
                  {user.name || 'Пользователь'}
                </h2>
                <p className="rb-text-muted">{formatPhoneDisplay(user.phone)}</p>
                {profileCity(user.city) && (
                  <p className="rb-text-muted" style={{ marginTop: 4 }}>
                    {profileCity(user.city)}
                  </p>
                )}
                <p className="rb-label" style={{ marginTop: 8 }}>
                  {formatBalance(user.balance)} сомони
                </p>
                <button type="button" className="rb-link" style={{ marginTop: 16, display: 'block', background: 'none', border: 'none', cursor: 'pointer', fontSize: 14, fontWeight: 600 }} onClick={startEdit}>
                  Редактировать профиль
                </button>
              </>
            )}
          </section>

          {!editing && (
            <>
              <section style={{ marginBottom: 24 }}>
                <p className="rb-label" style={{ marginBottom: 12 }}>Подключённая обувь</p>
                <div className="glass-panel" style={{ padding: 'var(--rb-card-padding)' }}>
                  {shoe ? (
                    <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
                      <div
                        style={{
                          width: 56,
                          height: 56,
                          borderRadius: 12,
                          background: 'var(--rb-surface-high)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}
                      >
                        <Icon name="ice_skating" style={{ color: 'var(--rb-neon)' }} />
                      </div>
                      <div>
                        <h3 style={{ margin: 0 }}>{shoe.model_name || 'Кроссовки'}</h3>
                        <p className="rb-text-muted" style={{ margin: '4px 0 0', fontSize: 13 }}>
                          {shoe.unique_id}
                        </p>
                      </div>
                    </div>
                  ) : (
                    <p className="rb-text-muted">Кроссовки не активированы</p>
                  )}
                </div>
              </section>

              {user.qrActivationAllowed === false ? (
                <p className="rb-text-muted" style={{ marginBottom: 12, fontSize: 13, textAlign: 'center' }}>
                  Активация QR доступна только на основном устройстве.
                </p>
              ) : (
                <button
                  type="button"
                  className="rb-btn-outline"
                  style={{ width: '100%', marginBottom: 12 }}
                  onClick={() => navigate('/activate')}
                >
                  <Icon name="qr_code_scanner" /> Активировать QR
                </button>
              )}
              <button
                type="button"
                className="rb-btn-outline"
                style={{ width: '100%', color: 'var(--rb-error)', borderColor: 'var(--rb-error)' }}
                onClick={onLogout}
              >
                Выйти
              </button>
            </>
          )}
        </main>
      </IonContent>
      <BottomNav />
    </IonPage>
  );
}
