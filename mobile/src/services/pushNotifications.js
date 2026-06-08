import { Capacitor } from '@capacitor/core';
import { PushNotifications } from '@capacitor/push-notifications';
import { api } from '../api';
import { getDeviceId } from './deviceId';

const CHANNEL_ID = 'runbonus_default';
let initialized = false;
let currentToken = null;

async function ensureAndroidChannel() {
  if (Capacitor.getPlatform() !== 'android') return;
  try {
    await PushNotifications.createChannel({
      id: CHANNEL_ID,
      name: 'RunBonus',
      description: 'Уведомления RunBonus',
      importance: 4,
      visibility: 1,
      sound: 'default',
      vibration: true,
    });
  } catch {
    /* channel exists */
  }
}

async function sendTokenToServer(token) {
  if (!token) return;
  currentToken = token;
  await api('/api/mobile/push/register', {
    method: 'POST',
    body: JSON.stringify({
      token,
      platform: Capacitor.getPlatform(),
      device_id: getDeviceId(),
    }),
  });
}

function handleNotificationAction(action) {
  const data = action?.notification?.data || action?.data || {};
  const url = data.url;
  if (url && typeof url === 'string' && /^https?:\/\//i.test(url)) {
    window.open(url, '_system');
  }
}

/** Регистрация FCM и отправка токена на сервер (после входа пользователя). */
export async function initPushNotifications() {
  if (!Capacitor.isNativePlatform() || initialized) return false;
  initialized = true;

  try {
    await ensureAndroidChannel();

    let perm = await PushNotifications.checkPermissions();
    if (perm.receive === 'prompt') {
      perm = await PushNotifications.requestPermissions();
    }
    if (perm.receive !== 'granted') {
      return false;
    }

    await PushNotifications.addListener('registration', async (ev) => {
      try {
        await sendTokenToServer(ev.value);
      } catch (err) {
        console.warn('[Push] token register failed', err);
      }
    });

    await PushNotifications.addListener('registrationError', (err) => {
      console.warn('[Push] registration error', err);
    });

    await PushNotifications.addListener('pushNotificationReceived', () => {
      /* foreground — системный баннер на Android */
    });

    await PushNotifications.addListener('pushNotificationActionPerformed', (action) => {
      handleNotificationAction(action);
    });

    await PushNotifications.register();
    return true;
  } catch (err) {
    console.warn('[Push] init failed', err);
    initialized = false;
    return false;
  }
}

export async function unregisterPushNotifications() {
  if (!currentToken) return;
  try {
    await api('/api/mobile/push/register', {
      method: 'DELETE',
      body: JSON.stringify({ token: currentToken }),
    });
  } catch {
    /* ignore */
  }
  currentToken = null;
  initialized = false;
}
