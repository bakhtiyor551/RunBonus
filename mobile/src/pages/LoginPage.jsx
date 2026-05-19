import { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  IonPage, IonHeader, IonToolbar, IonTitle, IonContent,
  IonItem, IonLabel, IonInput, IonButton, IonText,
} from '@ionic/react';
import { api } from '../api';

export default function LoginPage({ onAuth }) {
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    try {
      const data = await api('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ phone, password }),
      });
      onAuth(data);
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <IonPage>
      <IonHeader>
        <IonToolbar color="primary">
          <IonTitle>Вход</IonTitle>
        </IonToolbar>
      </IonHeader>
      <IonContent className="ion-padding">
        <h1>RunBonus</h1>
        <p>Бегай, собирай бонусы и получай скидку на следующую покупку.</p>
        <form onSubmit={submit}>
          <IonItem>
            <IonLabel position="stacked">Телефон</IonLabel>
            <IonInput type="tel" value={phone} onIonInput={(e) => setPhone(e.detail.value)} required />
          </IonItem>
          <IonItem>
            <IonLabel position="stacked">Пароль</IonLabel>
            <IonInput type="password" value={password} onIonInput={(e) => setPassword(e.detail.value)} required />
          </IonItem>
          {error && <IonText color="danger"><p>{error}</p></IonText>}
          <IonButton expand="block" type="submit" className="ion-margin-top">Войти</IonButton>
        </form>
        <IonButton fill="clear" routerLink="/register" routerDirection="forward" as={Link} to="/register">
          Регистрация
        </IonButton>
      </IonContent>
    </IonPage>
  );
}
