import './ui/styles.css';
import { App } from './ui/App';
import { Capacitor } from '@capacitor/core';
import { restoreFromNative } from './save/durable';
import { loadSprites } from './assets/sprites';
import { showLoader } from './ui/loading';
import type { Viz } from './render/viz';
import type { Renderer } from './render/Renderer';

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
  const dev = new URLSearchParams(location.search).has('dev') || location.hash === '#dev';
  // scale lab knobs (dev only): ?dev=1&viz=towers:1.2,stars:1.4 / window.__viz({ stars: 1.6 }) / __viz() = shipped look
  const viz = dev ? await import('./render/viz') : null;
  viz?.initVizFromUrl();
  const app = new App(root);
  loader.done();
  (window as any).__app = app;
  if (viz) {
    const r = (app as unknown as { renderer: Renderer }).renderer;
    const applyViz = (v: Viz) => {
      r.depthOverride = v.depth;
      r.refreshLook();
      return v;
    };
    applyViz(viz.setViz({}));
    (window as any).__viz = (p?: Partial<Viz> | string | null) => applyViz(viz.setViz(p ?? null));
    // perf probes: ?dprcap=2 renders like the old fixed 2x cap
    const cap = Number(new URLSearchParams(location.search).get('dprcap'));
    if (cap > 0) {
      r.dprCap = cap;
      window.dispatchEvent(new Event('resize'));
    }
  }
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
