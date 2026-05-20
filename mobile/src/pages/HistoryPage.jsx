import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { IonPage, IonContent } from '@ionic/react';
import { api } from '../api';
import AppHeader from '../components/AppHeader';
import Icon from '../components/Icon';

export default function HistoryPage() {
  const [items, setItems] = useState([]);
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
            {items.map((item) => {
              const sign = item.type === 'earn' ? '+' : item.type === 'spend' ? '−' : '';
              return (
                <div key={item.id} className="glass-card rb-activity-card">
                  <div className="rb-activity-card__icon">
                    <Icon name="receipt_long" />
                  </div>
                  <div style={{ flex: 1 }}>
                    <p style={{ margin: 0, fontWeight: 600 }}>{new Date(item.date).toLocaleString('ru')}</p>
                    <p className="rb-text-muted" style={{ margin: '4px 0 0', fontSize: 13 }}>
                      {item.status}
                      {item.km != null ? ` • ${item.km} км` : ''}
                    </p>
                  </div>
                  <span style={{ color: 'var(--rb-neon)', fontWeight: 600 }}>{sign}{item.amount}</span>
                </div>
              );
            })}
          </div>
        </main>
      </IonContent>
    </IonPage>
  );
}
