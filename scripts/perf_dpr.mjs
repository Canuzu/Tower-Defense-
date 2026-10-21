// Frame cost at different canvas pixel ratios (busy round + a big crowd), incl. rasterisation.
//   node scripts/perf_dpr.mjs [baseUrl] [w,h,dpr] [dprcap list]
//   node scripts/perf_dpr.mjs http://127.0.0.1:5173 844,390,3 2,3
// Canvas 2D work is recorded and only rasterised on flush, so every frame ends with a 1-pixel
// getImageData to make the measured time include the pixels (software raster in headless Chromium:
// the absolute numbers are far above a phone GPU's, the ratio between pixel ratios is what counts).
import { chromium } from 'playwright-core';

const base = process.argv[2] ?? 'http://localhost:5173';
const [w, h, dpr] = (process.argv[3] ?? '844,390,3').split(',').map(Number);
const caps = (process.argv[4] ?? '2,3').split(',').map(Number);
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox'] });
for (const cap of caps) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: dpr, hasTouch: true, isMobile: true });
  const page = await ctx.newPage();
  await page.goto(`${base}/?dev=1&dprcap=${cap}`);
  await page.waitForFunction(() => window.__app, null, { timeout: 30000 });
  const r = await page.evaluate(async () => {
    const app = window.__app;
    app.profile.tutorialDone = true;
    app.startGame('meadow', 'sandbox', 'nova');
    await new Promise((res) => setTimeout(res, 1500));
    window.requestAnimationFrame = () => 0;
    const g = app.game;
    const R = app.renderer;
    const ids = ['spike', 'boomer', 'frost', 'ember', 'zap', 'buzz', 'hoot'];
    let n = 0;
    for (let y = 60; y < 880 && n < 16; y += 60)
      for (let x = 40; x < 1560 && n < 16; x += 60) {
        const d = g.paths[0].distanceTo(x, y);
        if (d > 55 && d < 95 && g.canPlace(26, x, y)) {
          const t = g.placeTower(ids[n % ids.length], x, y);
          if (t) {
            g.upgrade(t, 0);
            g.upgrade(t, 0);
            g.upgrade(t, 2);
            n++;
          }
        }
      }
    g.paused = true;
    const ctx2 = R.ctx;
    const frame = () => {
      for (let k = 0; k < 2; k++) g.step(1 / 60);
      R.render(1 / 60);
      ctx2.getImageData(0, 0, 1, 1);
    };
    const measure = (frames) => {
      for (let f = 0; f < 10; f++) frame();
      const times = [];
      for (let f = 0; f < frames; f++) {
        const t0 = performance.now();
        frame();
        times.push(performance.now() - t0);
      }
      times.sort((a, b) => a - b);
      return { median: +times[frames >> 1].toFixed(2), p90: +times[Math.floor(frames * 0.9)].toFixed(2) };
    };
    const out = { canvas: [R.canvas.width, R.canvas.height], dpr: R.dpr, mp: +((R.canvas.width * R.canvas.height) / 1e6).toFixed(2) };
    // busy round: ~120 stars of mixed types
    const mix = ['red', 'blue', 'green', 'yellow', 'pink', 'zebra', 'rainbow', 'ceramic', 'lead'];
    for (let i = 0; i < 120; i++) g.spawn(mix[i % mix.length], { dist: 30 + i * 22 });
    out.busy = measure(60);
    // crowd: 500 stars (renderer switches to its cheap crowd path above 140)
    for (let i = 0; i < 380; i++) g.spawn(mix[i % mix.length], { dist: 20 + i * 6 });
    out.crowd = measure(40);
    out.enemies = g.enemies.length;
    out.particles = R.particles.list.length;
    return out;
  });
  console.log(JSON.stringify({ viewport: `${w}x${h}@${dpr}`, cap, ...r }));
  await ctx.close();
}
await browser.close();
