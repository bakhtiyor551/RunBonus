import { Capacitor } from '@capacitor/core';
import { StatusBar, Style } from '@capacitor/status-bar';

const BG = '#131313';

/** Тёмный фон под вырезом и home indicator на iOS/Android */
export async function initNativeShell() {
  if (!Capacitor.isNativePlatform()) return;

  document.documentElement.classList.add('cap-native');
  document.body.classList.add('cap-native');
  if (Capacitor.getPlatform() === 'ios') {
    document.documentElement.classList.add('cap-ios');
    document.body.classList.add('cap-ios');
  }

  try {
    await StatusBar.setStyle({ style: Style.Dark });
    if (Capacitor.getPlatform() === 'ios') {
      await StatusBar.setOverlaysWebView({ overlay: true });
    } else {
      await StatusBar.setBackgroundColor({ color: BG });
      await StatusBar.setOverlaysWebView({ overlay: false });
    }
  } catch {
    /* plugin unavailable in browser */
  }
}
