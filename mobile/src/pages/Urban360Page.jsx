import { useNavigate, useParams, useLocation } from 'react-router-dom';
import { IonPage, IonContent } from '@ionic/react';
import Product360Viewer from '../components/Product360Viewer';
import Icon from '../components/Icon';

/** Экран 360° по фото (макет Urban Sprint). */
export default function Urban360Page() {
  const { slug = 'urban-sprint' } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const productId = location.state?.productId;

  const buy = () => {
    if (productId) {
      navigate(`/shop/${productId}`, { state: { from360: true } });
      return;
    }
    navigate('/shop');
  };

  const openAr = () => {
    navigate(`/shop/ar/${slug}`, { state: { productId } });
  };

  return (
    <IonPage className="rb-360-page">
      <button
        type="button"
        className="rb-360-page__back"
        onClick={() => navigate(-1)}
        aria-label="Назад"
      >
        <Icon name="arrow_back" />
      </button>
      <IonContent fullscreen scrollY={false}>
        <Product360Viewer onBuy={buy} onOpenAr={openAr} />
      </IonContent>
    </IonPage>
  );
}
