import React from 'react';
import { createRoot } from 'react-dom/client';
import { setupIonicReact } from '@ionic/react';
import '@ionic/react/css/core.css';
import '@ionic/react/css/normalize.css';
import '@ionic/react/css/structure.css';
import '@ionic/react/css/typography.css';
import App from './App.jsx';
import { initNativeShell } from './nativeShell.js';
import { disableAppSounds } from './utils/disableAppSounds.js';
import { initKeyboardInset } from './utils/keyboard.js';
import { loadAdConfig } from './services/adConfig.js';
import { initAdMob } from './services/admob.js';
import './theme.css';
import 'leaflet/dist/leaflet.css';

setupIonicReact({
  hardwareBackButton: false,
  mode: 'ios',
  rippleEffect: false,
  scrollAssist: false,
  scrollPadding: false,
});

disableAppSounds();
initNativeShell();
initKeyboardInset();
loadAdConfig().finally(() => initAdMob());

createRoot(document.getElementById('root')).render(<App />);
