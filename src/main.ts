import './ui/styles.css';
import { App } from './ui/App';
import { Capacitor } from '@capacitor/core';

async function boot() {
  const root = document.getElementById('app')!;
  // wait for the bundled font so canvas text renders with it
  try {
    await Promise.race([document.fonts.load('800 20px "Baloo 2"'), new Promise((r) => setTimeout(r, 1500))]);
  } catch {
    /* ignore */
  }
  const app = new App(root);
  (window as any).__app = app;
  if (Capacitor.isNativePlatform()) {
    try {
      const { StatusBar } = await import('@capacitor/status-bar');
      await StatusBar.hide();
    } catch {
      /* optional */
    }
    try {
      const { SplashScreen } = await import('@capacitor/splash-screen');
      await SplashScreen.hide();
    } catch {
      /* optional */
    }
  }
}

boot();
