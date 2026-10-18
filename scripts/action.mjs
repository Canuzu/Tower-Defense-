// Mid-round action screenshot. Usage: node scripts/action.mjs <round> <out.png> [w] [h] [map] [waitMs]
import { chromium } from 'playwright-core';
const [round = '45', out = 'screens/action.png', w = '1280', hgt = '720', map = 'meadow', wait = '4000'] = process.argv.slice(2);
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: +w, height: +hgt }, deviceScaleFactor: 1 });
const logs = [];
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') logs.push(m.type() + ': ' + m.text()); });
page.on('pageerror', (e) => logs.push('PAGEERROR: ' + e.message + '\n' + e.stack));
await page.goto('http://localhost:5173/?dev=1');
await page.waitForTimeout(1000);
await page.evaluate(([map]) => {
  const app = window.__app;
  app.profile.tutorialDone = true;
  app.startGame(map, 'hard', 'nova');
}, [map]);
await page.waitForTimeout(500);
const info = await page.evaluate(([round]) => {
  const app = window.__app;
  const g = app.game;
  g.cash = 400000;
  const ids = ['spike', 'boomer', 'frost', 'hoot', 'ember', 'zap', 'buzz', 'dojo', 'acorn'];
  const tiers = [[2, 0, 4], [4, 2, 0], [3, 0, 2], [0, 2, 4], [4, 0, 2], [3, 2, 0], [2, 0, 4], [4, 0, 2], [2, 0, 3]];
  let n = 0;
  outer: for (let y = 60; y < 880; y += 52) {
    for (let x = 40; x < 1560; x += 52) {
      const d = Math.min(...g.paths.map((p) => p.distanceTo(x, y)));
      if (d > 50 && d < 95 && g.canPlace(26, x, y) && Math.random() < 0.5) {
        const i = n % ids.length;
        const t = g.placeTower(ids[i], x, y);
        if (t) {
          tiers[i].forEach((c, p) => { for (let k = 0; k < c; k++) g.upgrade(t, p); });
          n++;
        }
        if (n >= 22) break outer;
      }
    }
  }
  g.placeHero('nova', 800, 470);
  const hero = g.hero; if (hero) hero.addHeroXp(60000);
  g.round = +round;
  g.startRound();
  return { towers: g.towers.length };
}, [round]);
await page.waitForTimeout(+wait);
await page.screenshot({ path: out });
const stats = await page.evaluate(() => { const g = window.__app.game; return { round: g.round, lives: g.lives, enemies: g.enemies.length, proj: g.projectiles.length, pops: g.stats.pops, particles: window.__app.renderer.particles.list.length }; });
console.log(JSON.stringify({ ...info, ...stats }));
if (logs.length) console.log(logs.slice(0, 20).join('\n'));
await browser.close();
