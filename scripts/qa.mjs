// Real-input QA pass: tutorial, drag & drop placement, upgrades, selling, game over.
import { chromium } from 'playwright-core';
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const logs = [];
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') logs.push(m.type() + ': ' + m.text()); });
page.on('pageerror', (e) => logs.push('PAGEERROR: ' + e.message + '\n' + e.stack));
await page.goto('http://localhost:5173/');
await page.evaluate(() => localStorage.clear());
await page.reload();
await page.waitForTimeout(1000);
await page.locator('.btn.big').click();
await page.locator('.mapcard').first().click();
await page.locator('.diff-tile').nth(1).click(); // medium
await page.locator('.setup-actions .btn.green').click();
await page.waitForTimeout(700);
await page.screenshot({ path: 'screens/qa-1-tutorial.png' });
// drag the hedgehog card onto the map
const card = page.locator('.card[data-id="spike"]');
const box = await card.boundingBox();
const target = await page.evaluate(() => window.__app.renderer.worldToScreen(560, 225));
await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
await page.mouse.down();
await page.mouse.move(700, 300, { steps: 6 });
await page.mouse.move(target.x, target.y, { steps: 8 });
await page.screenshot({ path: 'screens/qa-2-drag.png' });
await page.mouse.up();
await page.waitForTimeout(400);
let st = await page.evaluate(() => ({ towers: window.__app.game.towers.length, cash: window.__app.game.cash }));
console.log('after drag place', JSON.stringify(st));
await page.screenshot({ path: 'screens/qa-3-placed.png' });
// click-to-place a second spike (tap card then click on map)
await card.click();
const t2 = await page.evaluate(() => window.__app.renderer.worldToScreen(330, 470));
await page.mouse.move(t2.x, t2.y, { steps: 4 });
await page.mouse.click(t2.x, t2.y);
await page.waitForTimeout(300);
st = await page.evaluate(() => ({ towers: window.__app.game.towers.length, cash: window.__app.game.cash }));
console.log('after click place', JSON.stringify(st));
// start round via play button
await page.locator('.play').click({ force: true });
await page.waitForTimeout(300);
await page.locator('.play').click({ force: true }); // speed 2x
await page.locator('.play').click({ force: true }); // speed 3x
await page.waitForTimeout(2500);
await page.screenshot({ path: 'screens/qa-4-round.png' });
// wait for round end
await page.waitForFunction(() => !window.__app.game.roundActive, null, { timeout: 60000 });
await page.waitForTimeout(400);
await page.screenshot({ path: 'screens/qa-5-roundend.png' });
// select tower & upgrade by clicking buy buttons
const tpos = await page.evaluate(() => { const t = window.__app.game.towers[0]; return window.__app.renderer.worldToScreen(t.x, t.y - 15); });
await page.mouse.click(tpos.x, tpos.y);
await page.waitForTimeout(300);
const buys = page.locator('.upanel .buy');
console.log('buy buttons', await buys.count());
await buys.nth(0).click({ force: true });
await page.waitForTimeout(300);
await page.screenshot({ path: 'screens/qa-6-upgrade.png' });
st = await page.evaluate(() => ({ tiers: window.__app.game.towers[0].tiers, cash: Math.floor(window.__app.game.cash), tut: window.__app.profile.tutorialDone }));
console.log('after upgrade', JSON.stringify(st));
// keyboard: Escape deselect, pause menu
await page.keyboard.press('Escape');
await page.keyboard.press('Escape');
await page.waitForTimeout(300);
await page.screenshot({ path: 'screens/qa-7-pause.png' });
await page.keyboard.press('Escape');
// force a game over
await page.evaluate(() => { const g = window.__app.game; g.lives = 1; g.round = 30; g.startRound(); g.speed = 3; });
await page.waitForFunction(() => window.__app.game.over, null, { timeout: 90000 });
await page.waitForTimeout(1500);
await page.screenshot({ path: 'screens/qa-8-gameover.png' });
// retry round
const retry = page.locator('.modal .btn.gold');
console.log('retry visible', await retry.count());
await retry.click({ force: true });
await page.waitForTimeout(500);
st = await page.evaluate(() => ({ round: window.__app.game.round, lives: window.__app.game.lives, towers: window.__app.game.towers.length, over: window.__app.game.over }));
console.log('after retry', JSON.stringify(st));
// victory flow
await page.evaluate(() => { const g = window.__app.game; g.round = 60; g.cash = 1e6; g.startRound(); for (const e of g.enemies) e.alive = false; });
await page.evaluate(() => { const g = window.__app.game; g.spawnQueue = []; });
await page.waitForTimeout(2500);
await page.screenshot({ path: 'screens/qa-9-victory.png' });
console.log(JSON.stringify(await page.evaluate(() => ({ won: window.__app.game.won, medals: window.__app.profile.medals }))));
if (logs.length) console.log(logs.slice(0, 20).join('\n'));
await browser.close();
