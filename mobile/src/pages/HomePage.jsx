import { Link, useNavigate } from 'react-router-dom';
import {
  IonPage, IonHeader, IonToolbar, IonTitle, IonContent, IonButton, IonButtons,
} from '@ionic/react';
import { api } from '../api';
import { requestLocationPermission } from '../services/geolocation';

export default function HomePage({ user, setUser, onLogout }) {
  const navigate = useNavigate();

  const refresh = async () => {
    const profile = await api('/api/auth/me');
    setUser(profile);
  };

  const startWorkout = async () => {
    try {
      if (!navigator.onLine) {
        alert('Нужен подключение к интернету');
        return;
      }

      await requestLocationPermission();

      const data = await api('/api/workouts/start', { method: 'POST', body: '{}' });
      navigate('/workout', { state: { workoutId: data.workoutId || data.id } });
    } catch (err) {
      alert(err.message);
    }
  };

  return (
    <IonPage>
      <IonHeader>
        <IonToolbar color="primary">
          <IonTitle>RunBonus</IonTitle>
          <IonButtons slot="end">
            <IonButton onClick={onLogout}>Выход</IonButton>
          </IonButtons>
        </IonToolbar>
      </IonHeader>
      <IonContent className="ion-padding home-screen">
        <div className="bonus-card">
          <p className="label">Баланс</p>
          <h1>{user.balance?.toFixed(1) ?? 0} сомони</h1>
        </div>

        <IonButton expand="block" size="large" className="start-btn" onClick={startWorkout}>
          Начать тренировку
        </IonButton>

        <IonButton expand="block" fill="outline" routerLink="/history" as={Link} to="/history">
          История бонусов
        </IonButton>
        <IonButton expand="block" fill="clear" onClick={refresh}>Обновить баланс</IonButton>
      </IonContent>
    </IonPage>
  );
}
