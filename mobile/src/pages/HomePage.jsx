import { Link, useNavigate } from 'react-router-dom';
import { useState } from 'react';
import {
  IonPage, IonHeader, IonToolbar, IonTitle, IonContent, IonButton, IonButtons,
} from '@ionic/react';
import { api } from '../api';

export default function HomePage({ user, setUser, onLogout }) {
  const navigate = useNavigate();
  const [starting, setStarting] = useState(false);

  const refresh = async () => {
    const profile = await api('/api/auth/me');
    setUser(profile);
  };

  const startWorkout = async () => {
    if (starting) return;
    setStarting(true);
    try {
      if (!navigator.onLine) {
        alert('Нужен подключение к интернету');
        return;
      }

      if (!user.activeShoe) {
        alert('Сначала активируйте кроссовки по QR-коду');
        return;
      }

      const data = await api('/api/workouts/start', { method: 'POST', body: '{}' });
      const id = data.workoutId ?? data.id;
      if (!id) {
        throw new Error('Сервер не вернул id тренировки');
      }
      navigate('/workout', { state: { workoutId: id } });
    } catch (err) {
      alert(err.message || 'Не удалось начать тренировку');
    } finally {
      setStarting(false);
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

        <IonButton
          expand="block"
          size="large"
          className="start-btn"
          disabled={starting}
          onClick={startWorkout}
        >
          {starting ? 'Запуск…' : 'Начать тренировку'}
        </IonButton>

        <IonButton expand="block" fill="outline" routerLink="/history" as={Link} to="/history">
          История бонусов
        </IonButton>
        <IonButton expand="block" fill="clear" onClick={refresh}>Обновить баланс</IonButton>
      </IonContent>
    </IonPage>
  );
}
