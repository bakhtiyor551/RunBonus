import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { IonApp } from '@ionic/react';
import { useEffect, useState } from 'react';
import { api, cacheUser, getCachedUser, isNetworkError, logoutApi, onForcedLogout, setToken } from './api';
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
import LevelPage from './pages/LevelPage';
import ShopPage from './pages/ShopPage';
import ProductDetailPage from './pages/ProductDetailPage';
import CartPage from './pages/CartPage';
import MyOrdersPage from './pages/MyOrdersPage';
import OfflineModal from './components/OfflineModal';
import { initWorkoutLifecycle } from './services/workoutLifecycle';
import {
  clearWorkoutLocal,
  getActiveWorkoutId,
  setActiveWorkoutId,
} from './services/geolocation';
import { syncActiveWorkoutWithServer } from './services/activeWorkout';
import { startWorkoutSession, stopWorkoutSession } from './services/workoutTracker';
import { refreshAdSettings } from './services/adSettings';
import { initAdMob, hideBannerAd } from './services/admob';
import { initPushNotifications, unregisterPushNotifications } from './services/pushNotifications';

function App() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    return onForcedLogout(() => {
      const id = getActiveWorkoutId();
      stopWorkoutSession();
      if (id) clearWorkoutLocal(id);
      setActiveWorkoutId(null);
      setUser(null);
    });
  }, []);

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token) {
      setLoading(false);
      return;
    }
    api('/api/auth/me')
      .then((profile) => {
        cacheUser(profile);
        setUser(profile);
      })
      .catch((err) => {
        if (err?.status === 401 || err?.code === 'DEVICE_MISMATCH') {
          setToken(null);
          return;
        }
        const cached = getCachedUser();
        if (cached) {
          setUser(cached);
          return;
        }
        if (!isNetworkError(err)) {
          setToken(null);
        }
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    const refreshProfile = () => {
      if (!navigator.onLine || !localStorage.getItem('token')) return;
      api('/api/auth/me')
        .then((profile) => {
          cacheUser(profile);
          setUser(profile);
        })
        .catch(() => {});
      refreshAdSettings().then((enabled) => {
        if (enabled) initAdMob();
        else hideBannerAd().catch(() => {});
      });
    };
    window.addEventListener('online', refreshProfile);
    return () => window.removeEventListener('online', refreshProfile);
  }, []);

  useEffect(() => {
    if (!user) return;
    refreshAdSettings().then((enabled) => {
      if (enabled) initAdMob();
      else hideBannerAd().catch(() => {});
    });
    initPushNotifications().catch(() => {});
    initWorkoutLifecycle();
    if (user.needsActivation) return;
    syncActiveWorkoutWithServer()
      .then(({ workoutId, startedAt }) => {
        if (workoutId) startWorkoutSession(workoutId, api, { startedAt }).catch(() => {});
      })
      .catch(() => {});
  }, [user]);

  const onAuth = (data) => {
    setToken(data.token);
    cacheUser(data.user);
    setUser(data.user);
    if (data.message) {
      sessionStorage.setItem('auth_notice', data.message);
    }
  };

  const logout = async () => {
    await unregisterPushNotifications().catch(() => {});
    await logoutApi();
    setUser(null);
  };

  if (loading) {
    return (
      <>
        <IonApp>
          <SplashScreen />
        </IonApp>
        <OfflineModal />
      </>
    );
  }

  if (!user) {
    return (
      <>
        <IonApp>
          <BrowserRouter>
            <Routes>
              <Route path="/login" element={<LoginPage onAuth={onAuth} />} />
              <Route path="/register" element={<RegisterPage onAuth={onAuth} />} />
              <Route path="*" element={<Navigate to="/login" replace />} />
            </Routes>
          </BrowserRouter>
        </IonApp>
        <OfflineModal />
      </>
    );
  }

  return (
    <>
      <IonApp>
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<HomePage user={user} setUser={setUser} />} />
            <Route path="/wallet" element={<WalletPage user={user} />} />
            <Route path="/wallet/withdraw" element={<WithdrawPage user={user} setUser={setUser} />} />
            <Route path="/profile" element={<ProfilePage user={user} setUser={setUser} onLogout={logout} />} />
            <Route path="/workout" element={<WorkoutPage user={user} setUser={setUser} />} />
            <Route
              path="/activate"
              element={
                <ActivatePage
                  user={user}
                  onActivated={async () => {
                    const profile = await api('/api/auth/me');
                    cacheUser(profile);
                    setUser(profile);
                  }}
                />
              }
            />
            <Route path="/history" element={<HistoryPage />} />
            <Route path="/level" element={<LevelPage />} />
            <Route path="/shop" element={<ShopPage user={user} />} />
            <Route path="/shop/:id" element={<ProductDetailPage />} />
            <Route path="/cart" element={<CartPage user={user} />} />
            <Route path="/orders" element={<MyOrdersPage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </BrowserRouter>
      </IonApp>
      <OfflineModal />
    </>
  );
}

export default App;
