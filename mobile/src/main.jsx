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
import './theme.css';

setupIonicReact({
  hardwareBackButton: false,
  mode: 'ios',
  rippleEffect: false,
  scrollAssist: true,
  scrollPadding: true,
});

disableAppSounds();
initNativeShell();
initKeyboardInset();

createRoot(document.getElementById('root')).render(<App />);
