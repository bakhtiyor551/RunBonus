import { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  IonPage, IonHeader, IonToolbar, IonTitle, IonContent,
  IonItem, IonLabel, IonInput, IonButton, IonText,
} from '@ionic/react';
import { api } from '../api';

export default function RegisterPage({ onAuth }) {
  const [form, setForm] = useState({ name: '', phone: '', password: '', city: '' });
  const [error, setError] = useState('');

  const set = (key) => (e) => setForm({ ...form, [key]: e.detail.value });

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    try {
      const data = await api('/api/auth/register', {
        method: 'POST',
        body: JSON.stringify(form),
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
          <IonTitle>Регистрация</IonTitle>
        </IonToolbar>
      </IonHeader>
      <IonContent className="ion-padding">
        <form onSubmit={submit}>
          <IonItem><IonLabel position="stacked">Имя</IonLabel><IonInput value={form.name} onIonInput={set('name')} required /></IonItem>
          <IonItem><IonLabel position="stacked">Телефон</IonLabel><IonInput type="tel" value={form.phone} onIonInput={set('phone')} required /></IonItem>
          <IonItem><IonLabel position="stacked">Пароль</IonLabel><IonInput type="password" value={form.password} onIonInput={set('password')} required /></IonItem>
          <IonItem><IonLabel position="stacked">Город</IonLabel><IonInput value={form.city} onIonInput={set('city')} required /></IonItem>
          {error && <IonText color="danger"><p>{error}</p></IonText>}
          <IonButton expand="block" type="submit" className="ion-margin-top">Зарегистрироваться</IonButton>
        </form>
        <IonButton fill="clear" as={Link} to="/login">Уже есть аккаунт</IonButton>
      </IonContent>
    </IonPage>
  );
}
