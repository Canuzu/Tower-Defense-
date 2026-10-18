// Rough performance probe: measures sim + render cost with a big crowd.
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
  const ids = ['spike', 'boomer', 'frost', 'ember', 'zap', 'buzz', 'hoot'];
  let n = 0;
  for (let y = 60; y < 880 && n < 20; y += 60) for (let x = 40; x < 1560 && n < 20; x += 60) {
    const d = g.paths[0].distanceTo(x, y);
    if (d > 50 && d < 90 && g.canPlace(26, x, y)) { const t = g.placeTower(ids[n % ids.length], x, y); if (t) { g.upgrade(t, 0); g.upgrade(t, 0); g.upgrade(t, 2); n++; } }
  }
  for (let i = 0; i < 500; i++) g.spawn(['ceramic', 'rainbow', 'zebra', 'pink', 'lead'][i % 5], { dist: 20 + i * 6 });
  g.paused = true; // we drive the loop manually
  const R = app.renderer;
  let sim = 0, ren = 0;
  const frames = 90;
  for (let f = 0; f < frames; f++) {
    const t0 = performance.now();
    for (let k = 0; k < 2; k++) g.step(1 / 60);
    const t1 = performance.now();
    R.render(1 / 60);
    const t2 = performance.now();
    sim += t1 - t0; ren += t2 - t1;
  }
  return { simMs: (sim / frames).toFixed(2), renderMs: (ren / frames).toFixed(2), enemies: g.enemies.length, proj: g.projectiles.length, particles: R.particles.list.length };
});
console.log(JSON.stringify(r));
await browser.close();
