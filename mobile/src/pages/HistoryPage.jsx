import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  IonPage, IonHeader, IonToolbar, IonTitle, IonContent, IonButton, IonButtons, IonList, IonItem, IonLabel,
} from '@ionic/react';
import { api } from '../api';

export default function HistoryPage() {
  const [items, setItems] = useState([]);
  const navigate = useNavigate();

  useEffect(() => {
    api('/api/bonus/history').then(setItems).catch(console.error);
  }, []);

  return (
    <IonPage>
      <IonHeader>
        <IonToolbar color="primary">
          <IonButtons slot="start">
            <IonButton onClick={() => navigate('/')}>Назад</IonButton>
          </IonButtons>
          <IonTitle>История бонусов</IonTitle>
        </IonToolbar>
      </IonHeader>
      <IonContent>
        <IonList>
          {items.map((item) => (
            <IonItem key={item.id}>
              <IonLabel>
                <h3>{new Date(item.date).toLocaleString('ru')}</h3>
                <p>
                  {item.type === 'earn' ? '+' : item.type === 'spend' ? '−' : ''}
                  {item.amount} сомони — {item.status}
                </p>
                {item.km != null && <p>{item.km} км</p>}
              </IonLabel>
            </IonItem>
          ))}
        </IonList>
      </IonContent>
    </IonPage>
  );
}
