import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { IonPage, IonContent } from '@ionic/react';
import { api } from '../api';
import AppHeader from '../components/AppHeader';
import OperationRow from '../components/OperationRow';
import OperationDetailModal from '../components/OperationDetailModal';

export default function HistoryPage() {
  const [items, setItems] = useState([]);
  const [selectedOperation, setSelectedOperation] = useState(null);
  const navigate = useNavigate();

  useEffect(() => {
    api('/api/bonus/history').then(setItems).catch(console.error);
  }, []);

  return (
    <IonPage>
      <AppHeader onBack={() => navigate(-1)} showAvatar={false} />
      <IonContent>
        <main className="rb-main">
          <h2 className="rb-headline font-display" style={{ marginBottom: 24 }}>История бонусов</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {items.map((item) => (
              <OperationRow key={item.id} item={item} onPress={setSelectedOperation} />
            ))}
            {!items.length && <p className="rb-text-muted">История пуста</p>}
          </div>
        </main>
        <OperationDetailModal operation={selectedOperation} onClose={() => setSelectedOperation(null)} />
      </IonContent>
    </IonPage>
  );
}
