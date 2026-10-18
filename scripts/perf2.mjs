import { chromium } from 'playwright-core';
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
await page.goto('http://localhost:5173/?dev=1');
await page.waitForTimeout(800);
const r = await page.evaluate(async () => {
  const app = window.__app;
  app.profile.tutorialDone = true;
  app.startGame('meadow', 'sandbox', 'nova');
  await new Promise((r) => setTimeout(r, 300));
  const g = app.game;
  for (let i = 0; i < 800; i++) g.spawn(['ceramic', 'rainbow', 'zebra', 'pink', 'lead'][i % 5], { dist: 20 + i * 4 });
  g.paused = true;
  const R = app.renderer;
  const time = (label, fn, frames = 40) => { const t0 = performance.now(); for (let f = 0; f < frames; f++) fn(); return [label, ((performance.now() - t0) / frames).toFixed(2)]; };
  const out = [];
  R.particles.clear();
  out.push(time('render 800 enemies, no particles', () => R.render(0)));
  // add particles
  for (let i = 0; i < 300; i++) R.splat(Math.random() * 1600, Math.random() * 900, '#ff4d4d', 14);
  out.push(time('render + ~2700 particles', () => R.render(0)));
  R.particles.clear();
  const saved = g.enemies; g.enemies = [];
  out.push(time('render empty map', () => R.render(0)));
  g.enemies = saved;
  return out;
});
console.log(r.map((x) => x.join(': ')).join('\n'));
await browser.close();
