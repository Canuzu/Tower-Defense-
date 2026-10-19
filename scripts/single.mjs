// Builds a single self-contained HTML file of the game (for sharing/playing in a browser).
// Usage: node scripts/single.mjs <out.html>
import { execSync } from 'node:child_process';
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
const out = process.argv[2] ?? 'star-bandits.html';
execSync('npx vite build', { stdio: 'inherit', env: { ...process.env, SINGLE: '1' } });
const dir = 'dist-single';
const html = readFileSync(join(dir, 'index.html'), 'utf8');
const assets = readdirSync(join(dir, 'assets'));
const js = assets.filter((f) => f.endsWith('.js')).map((f) => readFileSync(join(dir, 'assets', f), 'utf8'));
const css = assets.filter((f) => f.endsWith('.css')).map((f) => readFileSync(join(dir, 'assets', f), 'utf8'));
if (js.length !== 1) throw new Error('expected exactly one JS chunk, got ' + js.length);
const title = (html.match(/<title>(.*?)<\/title>/) ?? [])[1] ?? 'Star Bandits';
const page = [
  `<title>${title}</title>`,
  '<meta name="theme-color" content="#2b1a4b">',
  `<style>:root{color-scheme:dark}${css.join('\n')}</style>`,
  '<div id="app"></div>',
  `<script type="module">${js[0].replace(/<\/script/gi, '<\\/script')}</script>`,
].join('\n');
writeFileSync(out, page);
console.log(`wrote ${out} (${(page.length / 1024).toFixed(0)} KB)`);
