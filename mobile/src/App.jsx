import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { IonApp } from '@ionic/react';
import { useEffect, useState } from 'react';
import { api, setToken } from './api';
import SplashScreen from './components/SplashScreen';
import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage';
import ActivatePage from './pages/ActivatePage';
import HomePage from './pages/HomePage';
import WorkoutPage from './pages/WorkoutPage';
import WalletPage from './pages/WalletPage';
import WithdrawPage from './pages/WithdrawPage';
import ProfilePage from './pages/ProfilePage';
import HistoryPage from './pages/HistoryPage';
import { initWorkoutLifecycle } from './services/workoutLifecycle';
import { getActiveWorkoutId } from './services/geolocation';
import { startWorkoutSession } from './services/workoutTracker';

function App() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token) {
      setLoading(false);
      return;
    }
    api('/api/auth/me')
      .then(setUser)
      .catch(() => setToken(null))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!user || user.needsActivation) return;
    initWorkoutLifecycle();
    const activeId = getActiveWorkoutId();
    if (activeId) {
      startWorkoutSession(activeId, api).catch(() => {});
    }
  }, [user]);

  const onAuth = (data) => {
    setToken(data.token);
    setUser(data.user);
  };

  const logout = () => {
    setToken(null);
    setUser(null);
  };

  if (loading) {
    return (
      <IonApp>
        <SplashScreen />
      </IonApp>
    );
  }

  if (!user) {
    return (
      <IonApp>
        <BrowserRouter>
          <Routes>
            <Route path="/login" element={<LoginPage onAuth={onAuth} />} />
            <Route path="/register" element={<RegisterPage onAuth={onAuth} />} />
            <Route path="*" element={<Navigate to="/login" replace />} />
          </Routes>
        </BrowserRouter>
      </IonApp>
    );
  }

  if (user.needsActivation) {
    return (
      <IonApp>
        <ActivatePage
          onActivated={async () => {
            const profile = await api('/api/auth/me');
            setUser(profile);
          }}
        />
      </IonApp>
    );
  }

  return (
    <IonApp>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<HomePage user={user} setUser={setUser} />} />
          <Route path="/wallet" element={<WalletPage user={user} />} />
          <Route path="/wallet/withdraw" element={<WithdrawPage user={user} setUser={setUser} />} />
          <Route path="/profile" element={<ProfilePage user={user} setUser={setUser} onLogout={logout} />} />
          <Route path="/workout" element={<WorkoutPage user={user} setUser={setUser} />} />
          <Route path="/activate" element={<ActivatePage onActivated={async () => setUser(await api('/api/auth/me'))} />} />
          <Route path="/history" element={<HistoryPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </IonApp>
  );
}

export default App;
