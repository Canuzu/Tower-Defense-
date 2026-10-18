// Usage: node scripts/shot.mjs <url> <out.png> [width] [height] [waitMs]
import { chromium } from 'playwright-core';
const [url, out, w = '1800', h = '1400', wait = '800'] = process.argv.slice(2);
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: +w, height: +h } });
const logs = [];
page.on('console', (m) => logs.push(m.type() + ': ' + m.text()));
page.on('pageerror', (e) => logs.push('PAGEERROR: ' + e.message));
await page.goto(url);
await page.waitForTimeout(+wait);
await page.screenshot({ path: out });
if (logs.length) console.log(logs.join('\n'));
await browser.close();
