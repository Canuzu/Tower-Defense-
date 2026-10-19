// Drives the game in headless Chromium and captures screenshots.
// Usage: node scripts/play.mjs [width] [height] [outPrefix]
import { chromium } from 'playwright-core';
const [w = '1280', hgt = '720', out = 'screens/play'] = process.argv.slice(2);
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage({ viewport: { width: +w, height: +hgt }, deviceScaleFactor: 1 });
const logs = [];
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') logs.push(m.type() + ': ' + m.text()); });
page.on('pageerror', (e) => logs.push('PAGEERROR: ' + e.message + '\n' + e.stack));
await page.goto('http://localhost:5173/?dev=1');
await page.waitForTimeout(1200);
await page.locator('.btn.big').click();
await page.waitForTimeout(400);
await page.screenshot({ path: out + '-maps.png' });
await page.locator('.mapcard').first().click();
await page.waitForTimeout(400);
await page.screenshot({ path: out + '-setup.png' });
await page.locator('.setup-actions .btn.green').click();
await page.waitForTimeout(800);
// place towers through the game API (world coords) to keep the script stable
await page.evaluate(() => {
  const app = window.__app;
  const g = app.game;
  g.cash = 20000;
  const place = (id, x, y, ups) => { const t = g.placeTower(id, x, y); if (t) for (const [p, n] of ups) for (let i = 0; i < n; i++) g.upgrade(t, p); return t; };
  place('spike', 560, 215, [[0, 2], [2, 2]]);
  place('boomer', 600, 600, [[0, 3]]);
  place('frost', 330, 470, [[0, 2]]);
  place('hoot', 905, 330, [[0, 2]]);
  place('ember', 900, 600, [[1, 3]]);
  place('zap', 1240, 600, [[0, 3]]);
  place('buzz', 1240, 330, [[0, 3]]);
  g.placeHero('nova', 1180, 180);
  g.round = 28;
  g.startRound();
  g.speed = 2;
});
await page.waitForTimeout(6000);
await page.screenshot({ path: out + '-game.png' });
// select a tower to show the upgrade panel
const pos = await page.evaluate(() => { const app = window.__app; const r = app.renderer; const t = app.game.towers[0]; const s = r.worldToScreen(t.x, t.y - 10); return s; });
await page.mouse.click(pos.x, pos.y);
await page.waitForTimeout(500);
await page.screenshot({ path: out + '-panel.png' });
const stats = await page.evaluate(() => { const g = window.__app.game; return { round: g.round, cash: Math.floor(g.cash), lives: g.lives, enemies: g.enemies.length, pops: g.stats.pops }; });
console.log(JSON.stringify(stats));
if (logs.length) console.log(logs.join('\n'));
await browser.close();
