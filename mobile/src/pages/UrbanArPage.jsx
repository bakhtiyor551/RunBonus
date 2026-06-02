import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams, useLocation } from 'react-router-dom';
import { IonPage, IonContent } from '@ionic/react';
import { api } from '../api';
import ShoeModelViewer, { checkArSupport } from '../components/ShoeModelViewer';
import Icon from '../components/Icon';

const SPECS = [
  { key: 'weight', label: 'Лёгкость', icon: 'scale' },
  { key: 'cushioning', label: 'Амортизация', icon: 'air' },
  { key: 'upper', label: 'Верх', icon: 'grid_on' },
  { key: 'traction', label: 'Сцепление', icon: 'terrain' },
  { key: 'fit', label: 'Посадка', icon: 'accessibility_new' },
];

const MODES = [
  { id: 'ar', label: 'AR' },
  { id: '3d', label: '3D' },
  { id: 'photo', label: 'Фото' },
];

function open360(navigate, slug, productId) {
  navigate(`/shop/360/${slug}`, { state: { productId } });
}

export default function UrbanArPage({ user }) {
  const { slug = 'urban-sprint' } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const viewerRef = useRef(null);
  const [model, setModel] = useState(null);
  const [variantSlug, setVariantSlug] = useState(location.state?.variant || '');
  const [mode, setMode] = useState('3d');
  const [autoRotate, setAutoRotate] = useState(false);
  const [loading, setLoading] = useState(true);
  const [arOk, setArOk] = useState(checkArSupport());
  const [arBlocked, setArBlocked] = useState(false);
  const [photoUrl, setPhotoUrl] = useState(null);

  useEffect(() => {
    setLoading(true);
    api(`/api/shoe-models/slug/${slug}`)
      .then((m) => {
        setModel(m);
        const def = m.variants?.find((v) => v.is_default) || m.variants?.[0];
        if (!variantSlug && def) setVariantSlug(def.slug);
      })
      .catch(() => setModel(null))
      .finally(() => setLoading(false));
  }, [slug]);

  const variant =
    model?.variants?.find((v) => v.slug === variantSlug) ||
    model?.variants?.find((v) => v.is_default) ||
    model?.variants?.[0];

  const glb = variant?.glb || model?.glb;
  const usdz = variant?.usdz || model?.usdz;
  const productId = model?.product_id || location.state?.productId;

  const switchMode = (next) => {
    setArBlocked(false);
    if (next === 'ar' && !arOk) {
      setArBlocked(true);
      setMode('3d');
      return;
    }
    setMode(next);
    if (next === 'ar') {
      setTimeout(() => viewerRef.current?.activateAR?.(), 300);
    }
  };

  const takePhoto = async () => {
    try {
      const blob = await viewerRef.current?.takePhoto?.();
      if (!blob) {
        alert('Не удалось сделать снимок');
        return;
      }
      const url = URL.createObjectURL(blob);
      if (photoUrl) URL.revokeObjectURL(photoUrl);
      setPhotoUrl(url);
      setMode('photo');
    } catch {
      alert('Снимок недоступен на этом устройстве');
    }
  };

  const buy = () => {
    if (productId) {
      navigate(`/shop/${productId}`, {
        state: { color: variant?.color_name, variantSlug: variant?.slug },
      });
      return;
    }
    navigate('/shop');
  };

  if (loading) {
    return (
      <IonPage className="rb-ar-page">
        <IonContent>
          <main className="rb-ar-page__loading">
            <p className="rb-text-muted">Загрузка 3D…</p>
          </main>
        </IonContent>
      </IonPage>
    );
  }

  if (!model) {
    return (
      <IonPage className="rb-ar-page">
        <IonContent>
          <main className="rb-main">
            <p className="rb-text-error">Модель не найдена</p>
            <button type="button" className="rb-btn-pill" onClick={() => navigate('/shop')}>
              В магазин
            </button>
          </main>
        </IonContent>
      </IonPage>
    );
  }

  return (
    <IonPage className="rb-ar-page">
      <IonContent fullscreen scrollY={false}>
        <div className="rb-ar-page__viewport">
          <ShoeModelViewer
            ref={viewerRef}
            glb={glb}
            usdz={usdz}
            mode={mode === 'photo' ? '3d' : mode}
            ar={mode === 'ar'}
            autoRotate={autoRotate}
            onArSupported={(ok) => {
              if (!ok && mode === 'ar') setArBlocked(true);
            }}
          />
          {photoUrl && mode === 'photo' && (
            <img src={photoUrl} alt="Снимок примерки" className="rb-ar-page__snapshot" />
          )}
        </div>

        <header className="rb-ar-page__top">
          <button type="button" className="rb-ar-page__icon-btn" onClick={() => navigate(-1)} aria-label="Назад">
            <Icon name="arrow_back" />
          </button>
          <div className="rb-ar-page__title-wrap">
            <h1 className="rb-ar-page__title font-display">{model.name}</h1>
            <p className="rb-ar-page__subtitle">{variant?.color_name || 'RunBonus'}</p>
          </div>
          <button type="button" className="rb-ar-page__icon-btn" onClick={buy} aria-label="Купить">
            <Icon name="shopping_bag" />
          </button>
        </header>

        <div className="rb-ar-page__mode-tabs">
          {MODES.map((m) => (
            <button
              key={m.id}
              type="button"
              className={`rb-ar-page__mode-tab${mode === m.id ? ' rb-ar-page__mode-tab--active' : ''}`}
              onClick={() => switchMode(m.id)}
            >
              {m.label}
            </button>
          ))}
        </div>

        {arBlocked && (
          <div className="rb-ar-page__fallback glass-card">
            <p style={{ margin: 0, fontSize: 13, lineHeight: 1.45 }}>
              Ваш телефон не поддерживает AR. Вы можете посмотреть товар в 3D.
            </p>
          </div>
        )}

        <aside className="rb-ar-page__colors" aria-label="Цвета">
          {model.variants?.map((v) => (
            <button
              key={v.slug}
              type="button"
              className={`rb-ar-page__color${variantSlug === v.slug ? ' rb-ar-page__color--active' : ''}`}
              style={{ background: v.color_code || '#666' }}
              title={v.color_name}
              onClick={() => setVariantSlug(v.slug)}
              aria-label={v.color_name}
            />
          ))}
        </aside>

        <footer className="rb-ar-page__bottom glass-card">
          <div className="rb-ar-page__actions">
            <button type="button" className="rb-btn-primary rb-ar-page__buy" onClick={buy}>
              <Icon name="shopping_cart" />
              Купить
            </button>
            <button type="button" className="rb-ar-page__icon-btn rb-ar-page__icon-btn--neon" onClick={takePhoto} aria-label="Фото">
              <Icon name="photo_camera" />
            </button>
            <button
              type="button"
              className="rb-ar-page__icon-btn rb-ar-page__icon-btn--neon"
              onClick={() => open360(navigate, slug, productId)}
              aria-label="360° по фото"
            >
              <Icon name="360" />
            </button>
          </div>
          <ul className="rb-ar-page__specs">
            {SPECS.map(({ key, label, icon }) => (
              <li key={key}>
                <Icon name={icon} style={{ fontSize: 18 }} />
                <span className="rb-ar-page__spec-label">{label}</span>
                <span className="rb-ar-page__spec-value">{model.specs?.[key] || '—'}</span>
              </li>
            ))}
          </ul>
        </footer>
      </IonContent>
    </IonPage>
  );
}
