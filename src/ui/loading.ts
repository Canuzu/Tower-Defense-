/** Boot loading screen: logo, glossy progress bar fed by loadSprites(onProgress), fades into the menu. */
import { h } from './dom';
import { twinkles } from './kit';
import { uiIconUrlEager } from '../render/art';
import { loadProfile } from '../save/storage';
import { setLang, t } from '../i18n';

const TIPS = ['Waking up the raccoons…', 'Polishing the stars…', 'Sharpening the tin shards…', 'Counting the stash…'];

export interface Loader {
  progress(p: number): void;
  done(): void;
}

export function showLoader(root: HTMLElement): Loader {
  try {
    setLang(loadProfile().settings.lang ?? 'auto');
  } catch {
    /* defaults */
  }
  const started = performance.now();
  const fill = h('div', { class: 'ld-fill' });
  const pct = h('div', { class: 'ld-pct t-num' }, '0%');
  const tip = h('div', { class: 'ld-tip' }, t(TIPS[0]));
  const logoUrl = uiIconUrlEager('logo');
  const logo = logoUrl ? (h('img', { class: 'ld-logo', src: logoUrl, alt: 'Star Bandits', draggable: 'false' }) as HTMLImageElement) : h('div', { class: 'ld-logo ld-wordmark t-title' }, 'STAR BANDITS');
  if (logo instanceof HTMLImageElement) {
    const show = () => logo.classList.add('ready');
    if (logo.complete && logo.naturalWidth) show();
    else {
      logo.addEventListener('load', show);
      logo.addEventListener('error', () => logo.replaceWith(h('div', { class: 'ld-logo ld-wordmark t-title ready' }, 'STAR BANDITS')));
    }
  } else logo.classList.add('ready');
  const el = h(
    'div',
    { class: 'loader', role: 'progressbar', 'aria-valuemin': '0', 'aria-valuemax': '100', 'aria-label': 'Loading' },
    h('div', { class: 'ld-glow' }),
    twinkles(26, 11, 18),
    h('div', { class: 'ld-center' }, logo, h('div', { class: 'ld-bar' }, fill, h('div', { class: 'ld-shine' })), h('div', { class: 'ld-row' }, tip, pct)),
  );
  root.append(el);
  let shown = 0;
  let tipIdx = 0;
  return {
    progress(p: number) {
      const v = Math.max(shown, Math.min(1, p));
      shown = v;
      fill.style.width = `${(v * 100).toFixed(1)}%`;
      pct.textContent = `${Math.round(v * 100)}%`;
      el.setAttribute('aria-valuenow', String(Math.round(v * 100)));
      const ti = Math.min(TIPS.length - 1, Math.floor(v * TIPS.length));
      if (ti !== tipIdx) {
        tipIdx = ti;
        tip.textContent = t(TIPS[ti]);
      }
    },
    done() {
      this.progress(1);
      // keep the logo on screen long enough to register, then fade into the menu
      const wait = Math.max(250, 900 - (performance.now() - started));
      setTimeout(() => {
        el.classList.add('out');
        setTimeout(() => el.remove(), 700);
      }, wait);
    },
  };
}
