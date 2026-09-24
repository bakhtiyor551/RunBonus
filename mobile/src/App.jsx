import { BrowserRouter, Routes, Route, Navigate, useNavigate, useLocation } from 'react-router-dom';
import { IonApp } from '@ionic/react';
import { useEffect, useState } from 'react';
import { api, cacheUser, getCachedUser, isNetworkError, logoutApi, onForcedLogout, setToken } from './api';
import SplashScreen from './components/SplashScreen';
import LoginPage from './pages/LoginPage';
import HomePage from './pages/HomePage';
import WorkoutPage from './pages/WorkoutPage';
import ProfilePage from './pages/ProfilePage';
import WorkoutHistoryPage from './pages/WorkoutHistoryPage';
import ProgressPage from './pages/ProgressPage';
import ChallengesPage from './pages/ChallengesPage';
import MyRewardsPage from './pages/MyRewardsPage';
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
import { initPushNotifications, unregisterPushNotifications, setPushNavigationHandler } from './services/pushNotifications';

function PushNavigationBridge() {
  const navigate = useNavigate();
  useEffect(() => {
    setPushNavigationHandler((path) => navigate(path));
    return () => setPushNavigationHandler(null);
  }, [navigate]);
  return null;
}

/** Неактивированные клиенты и первый вход → магазин. */
function InactiveShopRedirect({ user }) {
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    const needsShop =
      sessionStorage.getItem('rb_open_shop') === '1' ||
      user?.needsActivation ||
      !user?.activeShoe;

    if (!needsShop) return;

    sessionStorage.removeItem('rb_open_shop');

    const path = location.pathname || '/';
    const allowed =
      path === '/shop' ||
      path.startsWith('/shop/') ||
      path === '/cart' ||
      path === '/orders' ||
      path === '/profile';

    if (!allowed) {
      navigate('/shop', { replace: true });
    }
  }, [user, location.pathname, navigate]);

  return null;
}

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
    // Первый вход / регистрация → сразу в магазин
    if (data.isNew || data.user?.isNew) {
      sessionStorage.setItem('rb_open_shop', '1');
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
          <PushNavigationBridge />
          <InactiveShopRedirect user={user} />
          <Routes>
            <Route path="/" element={<HomePage user={user} setUser={setUser} />} />
            <Route path="/profile" element={<ProfilePage user={user} setUser={setUser} onLogout={logout} />} />
            <Route path="/workout" element={<WorkoutPage user={user} setUser={setUser} />} />
            <Route path="/rewards" element={<ChallengesPage />} />
            <Route path="/challenges" element={<ChallengesPage />} />
            <Route path="/milestones" element={<ProgressPage />} />
            <Route path="/my-rewards" element={<MyRewardsPage />} />
            <Route path="/progress" element={<Navigate to="/rewards" replace />} />
            <Route path="/activate" element={<Navigate to="/shop" replace />} />
            <Route path="/workouts" element={<WorkoutHistoryPage />} />
            <Route path="/shop" element={<ShopPage user={user} />} />
            <Route path="/shop/:id" element={<ProductDetailPage />} />
            <Route path="/cart" element={<CartPage user={user} />} />
            <Route path="/orders" element={<MyOrdersPage />} />
            {/* Legacy money screens removed */}
            <Route path="/summary" element={<Navigate to="/" replace />} />
            <Route path="/wallet" element={<Navigate to="/rewards" replace />} />
            <Route path="/history" element={<Navigate to="/workouts" replace />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </BrowserRouter>
      </IonApp>
      <OfflineModal />
    </>
  );
}

export default App;
