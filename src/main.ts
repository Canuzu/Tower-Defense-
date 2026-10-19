import './ui/styles.css';
import { App } from './ui/App';
import { Capacitor } from '@capacitor/core';
import { restoreFromNative } from './save/durable';
import { loadSprites } from './assets/sprites';
import { showLoader } from './ui/loading';

async function boot() {
  const root = document.getElementById('app')!;
  const loader = showLoader(root);
  const sprites = loadSprites((p) => loader.progress(p));
  // wait for the bundled font so canvas text renders with it
  try {
    await Promise.race([document.fonts.load('800 20px "Baloo 2"'), new Promise((r) => setTimeout(r, 1500))]);
  } catch {
    /* ignore */
  }
  await Promise.all([restoreFromNative(), sprites]);
  const app = new App(root);
  loader.done();
  (window as any).__app = app;
  if (Capacitor.isNativePlatform()) {
    try {
      const { App: CapApp } = await import('@capacitor/app');
      CapApp.addListener('backButton', () => app.back());
      CapApp.addListener('pause', () => app.onBackground());
    } catch {
      /* optional */
    }
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
