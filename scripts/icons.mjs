// Generates app icons + splash images into public/ (and resources/ for Capacitor assets).
import { chromium } from 'playwright-core';
import { mkdirSync } from 'node:fs';
mkdirSync('public/icons', { recursive: true });
mkdirSync('resources', { recursive: true });
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: 1100, height: 1100 } });
async function shot(url, path, w, h) {
  await page.setViewportSize({ width: w, height: h });
  await page.goto(url);
  await page.waitForFunction(() => window.__ready === true);
  await page.waitForTimeout(150);
  await page.locator('#c').screenshot({ path, omitBackground: false });
}
for (const s of [1024, 512, 192, 180, 167, 152, 120, 96, 64]) {
  await shot(`http://localhost:5173/icon.html?s=${s}`, s === 1024 ? 'resources/icon.png' : `public/icons/icon-${s}.png`, s, s);
}
await shot('http://localhost:5173/icon.html?s=512', 'public/icons/icon-512.png', 512, 512);
await shot('http://localhost:5173/icon.html?m=splash&w=2732&h=2732', 'resources/splash.png', 2732, 2732);
await browser.close();
console.log('icons written');
