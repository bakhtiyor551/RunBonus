import { useState } from 'react';
import {
  IonPage, IonHeader, IonToolbar, IonTitle, IonContent,
  IonItem, IonLabel, IonInput, IonButton, IonText,
} from '@ionic/react';
import { api } from '../api';

export default function ActivatePage({ onActivated }) {
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const activate = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    try {
      const data = await api('/api/shoes/activate', {
        method: 'POST',
        body: JSON.stringify({ unique_id: code }),
      });
      setSuccess(data.message);
      setTimeout(onActivated, 800);
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <IonPage>
      <IonHeader>
        <IonToolbar color="primary">
          <IonTitle>Активация кроссовок</IonTitle>
        </IonToolbar>
      </IonHeader>
      <IonContent className="ion-padding">
        <p>Отсканируйте QR или введите ID с коробки кроссовок.</p>
        <form onSubmit={activate}>
          <IonItem>
            <IonLabel position="stacked">ID / QR-код</IonLabel>
            <IonInput value={code} onIonInput={(e) => setCode(e.detail.value?.toUpperCase())} placeholder="SHOE-..." required />
          </IonItem>
          {error && <IonText color="danger"><p>{error}</p></IonText>}
          {success && <IonText color="success"><p>{success}</p></IonText>}
          <IonButton expand="block" type="submit" className="ion-margin-top">Активировать</IonButton>
        </form>
        <p><small>Демо-код: SHOE-DEMO-001</small></p>
      </IonContent>
    </IonPage>
  );
}
