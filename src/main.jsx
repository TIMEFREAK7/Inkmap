import { createRoot } from 'react-dom/client';
import { Capacitor } from '@capacitor/core';
import App from './App.jsx';
import '@fontsource-variable/inter';
import '@fontsource/space-grotesk/700.css';
import './styles.css';
import { applyTheme, savedTheme } from './theme.js';

applyTheme(savedTheme()); // before the first paint, so there's no flash of the default colours

// Only the web build needs a service worker; Android and Windows ship the files locally.
if (!Capacitor.isNativePlatform() && location.protocol === 'https:') {
  import('virtual:pwa-register').then(({ registerSW }) => registerSW({ immediate: true }));
}
navigator.storage?.persist?.();

createRoot(document.getElementById('root')).render(<App />);
