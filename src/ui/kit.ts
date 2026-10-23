/**
 * Star Bandits UI kit: small DOM builders for the design-system classes documented at the top of
 * styles.css. Every painted icon goes through src/render/art.ts and falls back to an emoji (or the
 * procedural art) when a sprite is missing, so screens never show broken images.
 */
import { h } from './dom';
import { uiIconUrl, towerIconUrl, heroIconUrl, enemyIconUrl, mapImageUrl, mapArt } from '../render/art';
import { towerIcon, type ArtId } from '../render/towerArt';
import { mapThumbnail } from '../render/mapArt';
import { Path } from '../game/path';
import type { MapDef } from '../game/maps';
import type { GloopId } from '../game/gloops';
import { gloopIcon } from './icons';
import { getLang, t } from '../i18n';
import { TOWERS, TOWER_ORDER } from '../game/towers';
import { HEROES, HERO_ORDER } from '../game/heroes';
import { MAPS, MAP_BY_ID } from '../game/maps';
import { PERKS } from '../game/perks';
import { towerRoleCls } from './roles';
import { audio, type Sfx } from '../audio/audio';
import { haptic } from './haptics';

type Child = Node | string | null | undefined | false;
export type Color = 'green' | 'gold' | 'red' | 'blue' | 'purple' | 'dark';

// ------------------------------------------------------------------------------------------- art

/** Painted UI icon (`ui_<name>`) as <img class="ico">, or an emoji span when the sprite is missing. */
export function uiIcon(name: string, fallback: string, cls = ''): HTMLElement {
  const url = uiIconUrl(name);
  if (url) return h('img', { class: ('ico ' + cls).trim(), src: url, alt: '', draggable: 'false' });
  return h('span', { class: ('ico emoji ' + cls).trim(), 'aria-hidden': 'true' }, fallback);
}

export function img(src: string, cls = '', alt = ''): HTMLImageElement {
  return h('img', { class: cls || undefined, src, alt, draggable: 'false', decoding: 'async' }) as HTMLImageElement;
}

export const towerPortraitUrl = (id: string, tiers: readonly number[] = [0, 0, 0]) => towerIconUrl(id, tiers) ?? towerIcon(id as ArtId, [...tiers], 140);
export const heroPortraitUrl = (id: string, level = 1) => heroIconUrl(id, level) ?? towerIcon(id as ArtId, [level >= 14 ? 20 : level >= 7 ? 10 : 1], 160);
export const starPortraitUrl = (id: GloopId) => enemyIconUrl(id) ?? gloopIcon(id, 112);

const thumbs = new Map<string, string>();
const paintedThumbs = new Map<string, string>();
let thumbsStarted = false;

/**
 * The painted maps are 2400px wide; six of them decoding at once left the map cards empty for a
 * moment (and costs ~80 MB of decoded pixels on phones). This makes small WebP copies once, in idle
 * time after start-up; mapImageSrc() serves them as soon as they exist.
 */
export function prepareMapThumbs(maps: readonly MapDef[], width = 960) {
  if (thumbsStarted || typeof document === 'undefined') return;
  thumbsStarted = true;
  const idle = (fn: () => void) => ('requestIdleCallback' in window ? (window as any).requestIdleCallback(fn, { timeout: 1500 }) : setTimeout(fn, 200));
  const queue = [...maps];
  const next = () => {
    const m = queue.shift();
    if (!m) return;
    makeThumb(m.id, width)
      .catch(() => {})
      .then(() => idle(next));
  };
  idle(next);
}

async function makeThumb(id: string, width: number) {
  const s = mapArt(id);
  if (!s || paintedThumbs.has(id)) return;
  const w = Math.min(width, s.w);
  const hh = Math.round((w * s.h) / s.w);
  const c = document.createElement('canvas');
  c.width = w;
  c.height = hh;
  const ctx = c.getContext('2d');
  if (!ctx) return;
  let src: CanvasImageSource = s.img;
  if (typeof createImageBitmap === 'function') {
    try {
      src = await createImageBitmap(s.img, { resizeWidth: w, resizeHeight: hh, resizeQuality: 'high' });
    } catch {
      src = s.img;
    }
  }
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(src, 0, 0, w, hh);
  if (typeof ImageBitmap !== 'undefined' && src instanceof ImageBitmap) src.close();
  const blob = await new Promise<Blob | null>((r) => c.toBlob(r, 'image/webp', 0.88));
  if (blob) paintedThumbs.set(id, URL.createObjectURL(blob));
}

/** Painted map background (small copy when ready), or the procedural thumbnail while the painting is missing. */
export function mapImageSrc(m: MapDef): string {
  const small = paintedThumbs.get(m.id);
  if (small) return small;
  const url = mapImageUrl(m.id);
  if (url) return url;
  let th = thumbs.get(m.id);
  if (!th) {
    th = mapThumbnail(m, m.paths.map((p) => new Path(p)), 480);
    thumbs.set(m.id, th);
  }
  return th;
}

/** Medal sprite per difficulty (bronze, silver, gold, champion). */
export const MEDAL: Record<string, string> = { easy: 'medal1', medium: 'medal2', hard: 'medal3', champion: 'medal4' };
export const MEDAL_EMOJI: Record<string, string> = { easy: '🥉', medium: '🥈', hard: '🥇', champion: '🏅', sandbox: '🧪' };

// ------------------------------------------------------------------------------------------- numbers

export function fmt(n: number): string {
  return Math.floor(n).toLocaleString(getLang() === 'de' ? 'de-DE' : 'en-US');
}

/** Number with the language's decimal separator ("1,1" in German); `max` allows more digits when needed. */
export function dec(n: number, digits: number, max = digits): string {
  return n.toLocaleString(getLang() === 'de' ? 'de-DE' : 'en-US', { minimumFractionDigits: digits, maximumFractionDigits: max });
}

export function reducedMotion(): boolean {
  return document.documentElement.classList.contains('reduce-motion') || matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/** Animated number count-up with a little bump at the end. */
export function countUp(el: HTMLElement, to: number, opts: { from?: number; dur?: number; delay?: number; format?: (n: number) => string; tick?: Sfx } = {}) {
  const f = opts.format ?? fmt;
  const from = opts.from ?? 0;
  if (reducedMotion() || to === from) {
    el.textContent = f(to);
    return;
  }
  const dur = opts.dur ?? Math.min(1400, 500 + Math.log10(Math.abs(to - from) + 1) * 260);
  el.textContent = f(from);
  const begin = performance.now() + (opts.delay ?? 0);
  let tickAt = 0;
  const step = (now: number) => {
    if (!el.isConnected && now - begin > 50) return;
    const k = Math.min(1, Math.max(0, (now - begin) / dur));
    const e = 1 - Math.pow(1 - k, 3);
    el.textContent = f(from + (to - from) * e);
    // `tick`: a rolling sound while the number counts (coins, XP)
    if (opts.tick && k > 0 && k < 1 && now - tickAt > 80) {
      tickAt = now;
      audio.play(opts.tick, 0.7, 1 + e * 0.35);
    }
    if (k < 1) requestAnimationFrame(step);
    else bump(el);
  };
  requestAnimationFrame(step);
}

export function bump(el: HTMLElement) {
  el.classList.remove('bump');
  void el.offsetWidth;
  el.classList.add('bump');
}

export interface StaggerOpts {
  /** highest index: a long list cascades faster instead of taking longer to arrive */
  last?: number;
  /** drop the class once its animation has played, so a later display change (a layout switch on
   * resize, a hidden path shown again) does not replay the entrance */
  once?: boolean;
}

/** Sets the stagger index (--i) on each element and adds the entrance class. */
export function stagger<T extends HTMLElement>(els: T[], cls = 'anim-rise', start = 0, o: StaggerOpts = {}): T[] {
  const last = o.last ?? Infinity;
  const step = els.length > 1 && start + els.length - 1 > last ? Math.max(0, last - start) / (els.length - 1) : 1;
  const name = cls.replace('anim-', 'ui-');
  els.forEach((el, i) => {
    el.classList.add(cls);
    el.style.setProperty('--i', String(Math.round((start + i * step) * 100) / 100));
    if (!o.once) return;
    const played = (e: AnimationEvent) => {
      if (e.target !== el || e.animationName !== name) return;
      el.removeEventListener('animationend', played);
      el.classList.remove(cls);
    };
    el.addEventListener('animationend', played);
  });
  return els;
}

/** Cascade of the long lists on full-screen pages: the last item starts after ~0.3 s, plays once. */
export const PAGE_STAGGER: StaggerOpts = { last: 6, once: true };

// ------------------------------------------------------------------------------------------- components

export interface BtnOpts {
  size?: 'small' | 'big';
  icon?: HTMLElement | null;
  sub?: string;
  cls?: string;
  title?: string;
  badge?: string | null;
  disabled?: boolean;
}

/** Candy button. `label` may be text or nodes; `sub` adds a smaller second line. */
export function btn(label: string | Node, color: Color, onClick: (e: MouseEvent) => void, o: BtnOpts = {}): HTMLButtonElement {
  const cls = ['btn', color, o.size, o.cls].filter(Boolean).join(' ');
  const text = o.sub ? h('span', { class: 'stack' }, label, h('span', { class: 'sub' }, o.sub)) : typeof label === 'string' ? h('span', null, label) : label;
  const b = h('button', { class: cls, title: o.title ?? null, type: 'button' }, o.icon ?? null, text, o.badge ? h('span', { class: 'badge' }, o.badge) : null) as HTMLButtonElement;
  if (o.disabled) b.disabled = true;
  b.addEventListener('click', onClick);
  return b;
}

/**
 * Round icon button with an outlined label under it (menu dock, settings). `badge`: a string is
 * the red count badge (something to claim or spend); an element (newPill(), a dot, a countdown)
 * is placed as it is.
 */
export function roundBtn(icon: HTMLElement, label: string, onClick: () => void, badge: string | HTMLElement | null = null, cls = ''): HTMLButtonElement {
  const badgeEl = typeof badge === 'string' ? h('span', { class: 'badge' }, badge) : badge;
  const b = h('button', { class: ('rbtn ' + cls).trim(), type: 'button', 'aria-label': label }, h('span', { class: 'rbtn-face' }, icon), h('span', { class: 'rbtn-label' }, label), badgeEl) as HTMLButtonElement;
  b.addEventListener('click', onClick);
  return b;
}

/** Gold "NEW" pill for content the player has not looked at yet (bandits, heroes, maps). */
export function newPill(cls = ''): HTMLElement {
  return h('span', { class: ('pill-new ' + cls).trim() }, t('NEW'));
}

export function closeBtn(onClick: () => void): HTMLButtonElement {
  const b = h('button', { class: 'xbtn', type: 'button', title: t('Close'), 'aria-label': t('Close') }, uiIcon('close', '✕')) as HTMLButtonElement;
  b.addEventListener('click', onClick);
  return b;
}

/** Back arrow button for screen top bars. */
export function backBtn(onClick: () => void): HTMLButtonElement {
  const svg = '<svg viewBox="0 0 24 24" width="60%" height="60%" aria-hidden="true"><path d="M15.5 3.5 7 12l8.5 8.5" fill="none" stroke="#120a2b" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"/><path d="M15.5 3.5 7 12l8.5 8.5" fill="none" stroke="#fff" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  const b = h('button', { class: 'btn icon dark back', type: 'button', title: t('Back'), 'aria-label': t('Back'), html: svg }) as HTMLButtonElement;
  b.addEventListener('click', onClick);
  return b;
}

/** Outlined circular-arrow glyph (restart), drawn like the painted icons. */
export function restartIcon(): HTMLElement {
  const path = 'M19 12a7 7 0 1 1-2.05-4.95M19 4.5V8h-3.5';
  return h('span', {
    class: 'ico svg-ico',
    'aria-hidden': 'true',
    html: `<svg viewBox="0 0 24 24" width="100%" height="100%"><path d="${path}" fill="none" stroke="#120a2b" stroke-width="6.5" stroke-linecap="round" stroke-linejoin="round"/><path d="${path}" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  });
}

export type RibbonColor ='gold' | 'red' | 'green' | 'blue' | 'purple';

export function ribbon(text: string, color: RibbonColor = 'purple', icon: HTMLElement | null = null, cls = ''): HTMLElement {
  return h('div', { class: `ribbon ${color} ${cls}`.trim() }, h('span', { class: 'rb-tail l' }), h('span', { class: 'rb-tail r' }), h('div', { class: 'rb-body' }, icon, h('span', null, text)));
}

export interface ModalOpts {
  title: string;
  color?: RibbonColor;
  icon?: HTMLElement | null;
  size?: 'narrow' | 'wide' | 'xwide';
  cls?: string;
  onClose?: (() => void) | null;
  /** extra elements under the ribbon (tabs, summary) */
  head?: Child[];
}

/** Standard modal shell: ribbon title, optional close button, scrolling body and a button footer. */
export function modal(o: ModalOpts, body: Child[], foot: Child[] = []): HTMLElement {
  const head = h('div', { class: 'modal-head' }, ribbon(o.title, o.color ?? 'purple', o.icon ?? null, 'anim-drop'), ...(o.head ?? []), o.onClose ? closeBtn(o.onClose) : null);
  const bodyEl = h('div', { class: 'modal-body' }, ...body);
  watchScroll(bodyEl);
  const footEl = foot.some(Boolean) ? h('div', { class: 'modal-foot' }, ...foot) : null;
  return h('div', { class: ['modal', o.size, o.cls].filter(Boolean).join(' '), role: 'dialog', 'aria-label': o.title }, head, bodyEl, footEl);
}

export interface PageOpts {
  title: string;
  icon?: HTMLElement | null;
  /** accent colour (header glow, title light, background tint) */
  accent?: string;
  cls?: string;
  /** round back button (top-left); Escape / Android back run the same through the host */
  onBack: () => void;
  /** centre of the header bar (tabs) */
  tabs?: HTMLElement | null;
  /** right side of the header bar (currency, XP, level, a page action) */
  right?: Child[];
}

/**
 * Full-screen menu page: painted background, a header bar (round back button, icon + title, tabs,
 * currency on the right) and a body that fills the rest of the screen (scrolls on its own). Hosted in
 * `.modal-wrap.page-wrap` (App / HUD modal hosts); see the PAGES block in styles.css.
 */
export function page(o: PageOpts, body: Child[]): HTMLElement {
  const back = backBtn(o.onBack);
  back.classList.add('page-back');
  const title = h('div', { class: 'page-title' }, o.icon ?? null, h('h1', { class: 't-title' }, o.title));
  const right = h('div', { class: 'page-right' }, ...(o.right ?? []));
  const head = h('header', { class: 'page-head' }, back, title, o.tabs ? h('div', { class: 'page-tabs' }, o.tabs) : h('div', { class: 'page-gap' }), right);
  const bodyEl = h('div', { class: 'page-body' }, ...body);
  watchScroll(bodyEl);
  const art = uiIconUrl('keyart');
  const bg = h('div', { class: 'page-bg', 'aria-hidden': 'true' }, art ? img(art, 'page-bg-img') : null, h('div', { class: 'page-bg-tint' }));
  const el = h('div', { class: ['page', o.cls].filter(Boolean).join(' '), role: 'dialog', 'aria-modal': 'true', 'aria-label': o.title, style: o.accent ? `--pa:${o.accent}` : undefined }, bg, head, bodyEl);
  // narrow screens: the title keeps only its icon when the tabs / right side need the room
  const fit = () => {
    if (!head.clientWidth) return;
    el.classList.remove('tight');
    if (head.scrollWidth > head.clientWidth + 1) el.classList.add('tight');
  };
  let width = -1;
  if (typeof ResizeObserver !== 'undefined')
    new ResizeObserver(() => {
      if (head.clientWidth === width) return;
      width = head.clientWidth;
      requestAnimationFrame(fit);
    }).observe(head);
  document.fonts?.ready.then(() => requestAnimationFrame(fit));
  return el;
}

/** Plays a page's exit (fade + slight lift) and then runs `done` (right away with reduced motion). */
export function leavePage(wrap: Element, done: () => void) {
  if (reducedMotion() || !wrap.classList.contains('page-wrap')) {
    done();
    return;
  }
  let ran = false;
  const finish = () => {
    if (ran) return;
    ran = true;
    done();
  };
  wrap.classList.add('leaving');
  wrap.addEventListener('animationend', (e) => e.target === wrap.firstElementChild && finish());
  setTimeout(finish, 320);
}

/**
 * Fades the top/bottom edge of a scroll area while more content hides there. Only the area's own
 * padding being scrolled away (a few px of overflow) is not "more content", so it gets no fade.
 */
export function watchScroll(el: HTMLElement) {
  const update = () => {
    const cs = getComputedStyle(el);
    const rest = el.scrollHeight - el.clientHeight - el.scrollTop;
    el.classList.toggle('more-top', el.scrollTop > Math.max(2, parseFloat(cs.paddingTop) || 0));
    el.classList.toggle('more-bottom', rest > Math.max(2, parseFloat(cs.paddingBottom) || 0));
  };
  el.addEventListener('scroll', update, { passive: true });
  if (typeof ResizeObserver !== 'undefined') {
    const ro = new ResizeObserver(update);
    ro.observe(el);
    for (const c of el.children) ro.observe(c);
  }
  requestAnimationFrame(update);
}

/**
 * Keeps a one-line title (a single long word, a long name) inside its box: the font shrinks down to
 * `min` of its size. When even that is too wide the title wraps at full size (at its soft hyphens),
 * or keeps its CSS ellipsis at `min` when `wrap` is off. Refits when the box resizes.
 */
export function fitText(el: HTMLElement, min = 0.78, wrap = true) {
  const fit = () => {
    el.style.fontSize = '';
    el.style.whiteSpace = 'nowrap';
    const w = el.clientWidth;
    if (w && el.scrollWidth > w + 0.5) {
      const size = parseFloat(getComputedStyle(el).fontSize);
      el.style.fontSize = `${(size * Math.max(min, (w / el.scrollWidth) * 0.97)).toFixed(2)}px`;
    }
    if (wrap && w && el.scrollWidth > el.clientWidth + 0.5) {
      el.style.fontSize = '';
      el.style.whiteSpace = 'normal';
    }
  };
  // the parent's width sets the title's box; refit a frame later (not inside the observer callback)
  const box = el.parentElement ?? el;
  let width = -1;
  if (typeof ResizeObserver !== 'undefined')
    new ResizeObserver(() => {
      if (box.clientWidth === width) return;
      width = box.clientWidth;
      requestAnimationFrame(fit);
    }).observe(box);
  else requestAnimationFrame(fit);
  document.fonts?.ready.then(() => requestAnimationFrame(fit));
  return el;
}

/** Glossy progress bar; frac 0..1. */
export function bar(frac: number, color: '' | 'gold' | 'green' | 'red' = '', label?: string, height?: number): HTMLElement {
  const p = Math.max(0, Math.min(1, frac));
  const el = h('div', { class: ('bar ' + color + (p <= 0 ? ' zero' : '')).trim(), style: height ? `--bar-h:calc(${height}px * var(--k, 1))` : undefined }, h('i', { style: `--p:${(p * 100).toFixed(1)}%` }), label ? h('span', null, label) : null);
  return el;
}

export function chip(icon: HTMLElement | null, text: string | Node, cls = ''): HTMLElement {
  return h('span', { class: ('chip ' + cls).trim() }, icon, text);
}

export function socket(content: HTMLElement | string, size = 48, cls = ''): HTMLElement {
  return h('span', { class: ('socket ' + cls).trim(), style: `--s:${size}px` }, content);
}

/** Field of twinkling 4-point stars (deterministic layout). */
export function twinkles(n: number, seed = 7, maxSize = 16): HTMLElement {
  const box = h('div', { class: 'twinkles', 'aria-hidden': 'true' });
  let s = seed;
  const rnd = () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646;
  for (let i = 0; i < n; i++) {
    const sz = 6 + rnd() * (maxSize - 6);
    box.append(h('i', { style: `left:${(rnd() * 100).toFixed(1)}%;top:${(rnd() * 100).toFixed(1)}%;--sz:${sz.toFixed(0)}px;--dur:${(2.2 + rnd() * 3).toFixed(2)}s;--delay:${(rnd() * 4).toFixed(2)}s` }));
  }
  return box;
}

const CONFETTI = ['#ffcf3f', '#ff5a7a', '#5bdc5a', '#3fb2ff', '#b07bff', '#fff6e0', '#ff9f43'];

/** DOM confetti burst over `host` (works while the game canvas is paused). */
export function confetti(host: HTMLElement, n = 70) {
  if (reducedMotion() || document.documentElement.classList.contains('reduce-fx')) return;
  const box = h('div', { class: 'confetti', 'aria-hidden': 'true' });
  for (let i = 0; i < n; i++) {
    const w = 7 + Math.random() * 7;
    box.append(
      h('i', {
        style: `--x:${(Math.random() * 100).toFixed(1)}%;--c:${CONFETTI[i % CONFETTI.length]};--w:${w.toFixed(0)}px;--h:${(w * (1.2 + Math.random())).toFixed(0)}px;--dx:${((Math.random() - 0.5) * 220).toFixed(0)}px;--rot:${((Math.random() - 0.5) * 1440).toFixed(0)}deg;--t:${(2.2 + Math.random() * 1.6).toFixed(2)}s;--delay:${(Math.random() * 0.6).toFixed(2)}s`,
      }),
    );
  }
  host.append(box);
  setTimeout(() => box.remove(), 4600);
}

// ------------------------------------------------------------------------------------------- overlays

/**
 * Overlays that sit above pages and modals (level-up reveal, confirm dialogs). Escape and the
 * Android back button (App.back -> dismissTopOverlay) close the topmost one before anything else.
 */
const overlays: (() => void)[] = [];
let overlayKeys = false;

function pushOverlay(dismiss: () => void) {
  overlays.push(dismiss);
  if (overlayKeys) return;
  overlayKeys = true;
  // capture phase: the page / HUD behind must not see the key as well
  window.addEventListener(
    'keydown',
    (e) => {
      if (e.key !== 'Escape' || !overlays.length) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      dismissTopOverlay();
    },
    true,
  );
}

function dropOverlay(dismiss: () => void) {
  const i = overlays.lastIndexOf(dismiss);
  if (i >= 0) overlays.splice(i, 1);
}

/** Closes the topmost overlay (reveal, confirm); false when none is open. */
export function dismissTopOverlay(): boolean {
  const top = overlays[overlays.length - 1];
  if (!top) return false;
  top();
  return true;
}

/** Fades an overlay out (right away with reduced motion), then removes it. */
function fadeOut(el: HTMLElement, done?: () => void) {
  if (reducedMotion()) {
    el.remove();
    done?.();
    return;
  }
  el.classList.add('closing');
  setTimeout(() => {
    el.remove();
    done?.();
  }, 200);
}

export interface ConfirmOpts {
  title: string;
  text: string;
  ok: string;
  okColor?: Color;
  okIcon?: HTMLElement | null;
  cancel?: string;
  icon?: HTMLElement | null;
  onOk: () => void;
  onCancel?: () => void;
}

/**
 * Small confirm dialog over `host` (a page, the modal layer): dims it and asks. Cancel, the
 * backdrop, Escape and Android back keep things as they are.
 */
export function confirmBox(host: HTMLElement, o: ConfirmOpts): () => void {
  let done = false;
  const finish = (ok: boolean) => {
    if (done) return;
    done = true;
    dropOverlay(cancel);
    audio.play(ok ? 'tap' : 'close');
    fadeOut(wrap);
    if (ok) o.onOk();
    else o.onCancel?.();
  };
  const cancel = () => finish(false);
  const okBtn = btn(o.ok, o.okColor ?? 'red', () => finish(true), { icon: o.okIcon ?? null });
  const box = h(
    'div',
    { class: 'confirm panel anim-pop', role: 'alertdialog', 'aria-modal': 'true', 'aria-label': o.title },
    o.icon ? h('div', { class: 'confirm-ico' }, o.icon) : null,
    h('b', { class: 'confirm-title t-outline' }, o.title),
    h('p', { class: 'confirm-text' }, o.text),
    h('div', { class: 'confirm-actions' }, btn(o.cancel ?? t('Cancel'), 'dark', cancel), okBtn),
  );
  const wrap = h('div', { class: 'confirm-wrap' }, box);
  wrap.addEventListener('pointerdown', (e) => e.target === wrap && cancel());
  host.append(wrap);
  pushOverlay(cancel);
  requestAnimationFrame(() => okBtn.focus({ preventScroll: true }));
  return cancel;
}

/**
 * Snackbar with an undo button at the bottom of `host` for `ms` (a slim bar runs down the time).
 * Returns a function that removes it early.
 */
export function undoBar(host: HTMLElement, text: string, onUndo: () => void, ms = 5000): () => void {
  host.querySelector(':scope > .undo-bar')?.remove();
  let gone = false;
  const close = () => {
    if (gone) return;
    gone = true;
    clearTimeout(timer);
    fadeOut(el);
  };
  const undo = btn(t('Undo'), 'gold', () => {
    if (gone) return;
    close();
    audio.play('click');
    onUndo();
  }, { size: 'small', icon: restartIcon() });
  const el = h('div', { class: 'undo-bar', role: 'status', style: `--ms:${ms}ms` }, h('span', { class: 'undo-text' }, text), undo, h('i', { class: 'undo-time', 'aria-hidden': 'true' }));
  host.append(el);
  const timer = setTimeout(close, ms);
  return close;
}

// ------------------------------------------------------------------------------------------- level rewards

/** Player level that opens each map. */
export const MAP_LEVEL: Record<string, number> = { meadow: 1, caverns: 2, fjord: 3, forge: 4, candy: 5, rivers: 6 };

export type RewardKind = 'bandit' | 'hero' | 'map' | 'wisdom';

export interface LevelReward {
  kind: RewardKind;
  /** tower, hero or map id ('' for wisdom points) */
  id: string;
  /** player level that brings it */
  level: number;
  /** wisdom points */
  n?: number;
}

/**
 * Everything the levels after `fromLv` up to `toLv` bring: bandits (TOWERS[id].unlock), heroes,
 * maps (MAP_LEVEL), then the wisdom points (one per level, as long as there are perks left to
 * spend them on). Also used by the in-game level-up banner.
 */
export function levelRewards(fromLv: number, toLv: number): LevelReward[] {
  const inRange = (lv: number) => lv > fromLv && lv <= toLv;
  const out: LevelReward[] = [];
  for (const id of TOWER_ORDER) if (inRange(TOWERS[id].unlock)) out.push({ kind: 'bandit', id, level: TOWERS[id].unlock });
  for (const id of HERO_ORDER) if (inRange(HEROES[id].unlock)) out.push({ kind: 'hero', id, level: HEROES[id].unlock });
  for (const m of MAPS) if (inRange(MAP_LEVEL[m.id] ?? 1)) out.push({ kind: 'map', id: m.id, level: MAP_LEVEL[m.id] ?? 1 });
  const cap = PERKS.length + 1;
  const n = Math.min(toLv, cap) - Math.min(fromLv, cap);
  if (n > 0) out.push({ kind: 'wisdom', id: '', level: toLv, n });
  return out;
}

/** Display name of a reward ("Mystic", "Crystal Mine", "+2 points"). */
export function rewardName(r: LevelReward): string {
  if (r.kind === 'bandit') return t(TOWERS[r.id as keyof typeof TOWERS].name);
  if (r.kind === 'hero') return t(HEROES[r.id as keyof typeof HEROES].name);
  if (r.kind === 'map') return t(MAP_BY_ID[r.id].name);
  return r.n === 1 ? t('+1 point') : t('+{n} points', { n: r.n ?? 1 });
}

/** Painted art of a reward: raccoon / hero portrait on its role disc, map painting, lantern. */
export function rewardArt(r: LevelReward, cls = ''): HTMLElement {
  if (r.kind === 'bandit') return h('span', { class: `rw-art portrait role-disc ${towerRoleCls(r.id as keyof typeof TOWERS)} ${cls}`.trim() }, img(towerPortraitUrl(r.id), '', ''));
  if (r.kind === 'hero') return h('span', { class: `rw-art portrait role-disc role-hero ${cls}`.trim() }, img(heroPortraitUrl(r.id, 1), '', ''));
  if (r.kind === 'map') return h('span', { class: `rw-art rw-map ${cls}`.trim() }, img(mapImageSrc(MAP_BY_ID[r.id]), '', ''));
  return h('span', { class: `rw-art rw-wisdom ${cls}`.trim() }, uiIcon('lantern', '🧠'));
}

const KIND_LABEL: Record<RewardKind, [string, string]> = {
  bandit: ['New bandit', 'New bandits'],
  hero: ['New hero', 'New heroes'],
  map: ['New map', 'New maps'],
  wisdom: ['Wisdom', 'Wisdom'],
};

export interface RewardCardOpts {
  /** pill in the corner: NEW (just unlocked) or the level it unlocks at (preview) */
  pill?: 'new' | 'level' | null;
  onClick?: () => void;
}

/** One reward card (several items of a kind share one card: stacked art, names joined). */
export function rewardCard(items: LevelReward[], o: RewardCardOpts = {}): HTMLElement {
  const r = items[0];
  const many = items.length > 1;
  const art = many ? h('span', { class: 'rw-stack', style: `--n:${Math.min(items.length, 4)}` }, ...items.slice(0, 4).map((x) => rewardArt(x))) : rewardArt(r);
  const names = items.map(rewardName);
  const pill = o.pill === 'new' ? newPill() : o.pill === 'level' ? h('span', { class: 'rw-lv' }, t('Lv {n}', { n: r.level })) : null;
  const kids = [pill, h('span', { class: 'rw-art-box' }, art), h('small', { class: 'rw-kind' }, t(KIND_LABEL[r.kind][many ? 1 : 0])), h('b', { class: 'rw-name' }, names.join(' + '))];
  const cls = `rw-card tile kind-${r.kind}` + (many ? ' many' : '');
  if (!o.onClick) return h('div', { class: cls }, ...kids);
  const b = h('button', { class: cls, type: 'button', 'aria-label': `${t(KIND_LABEL[r.kind][many ? 1 : 0])}: ${names.join(', ')}` }, ...kids);
  b.addEventListener('click', o.onClick);
  return b;
}

/**
 * Reward cards for a set of rewards: one card per bandit and hero (bandits share a card when there
 * would be more than five), all maps on one card, the wisdom points on one.
 */
export function rewardCards(list: LevelReward[], o: { pill?: RewardCardOpts['pill']; onPick?: (r: LevelReward) => void; canPick?: (r: LevelReward) => boolean } = {}): HTMLElement[] {
  const of = (k: RewardKind) => list.filter((r) => r.kind === k);
  const bandits = of('bandit');
  const heroes = of('hero');
  const maps = of('map');
  const wisdom = of('wisdom');
  const groups: LevelReward[][] = [];
  const total = bandits.length + heroes.length + (maps.length ? 1 : 0) + (wisdom.length ? 1 : 0);
  if (total > 5 && bandits.length > 1) groups.push(bandits);
  else for (const b of bandits) groups.push([b]);
  for (const x of heroes) groups.push([x]);
  if (maps.length) groups.push(maps);
  if (wisdom.length) groups.push(wisdom);
  const pick = o.onPick;
  return groups.map((g) => rewardCard(g, { pill: o.pill, onClick: pick && (o.canPick?.(g[0]) ?? true) ? () => pick(g[0]) : undefined }));
}

export interface RevealOpts {
  /** "Great!", Escape, Android back: the reveal is gone */
  onClose?: () => void;
  /** "To the bandits" (only shown when a bandit or hero is among the rewards); the reveal closes first */
  onBandits?: (r: LevelReward) => void;
}

/**
 * Level-up reveal: the XP star over spinning rays, "LEVEL 3!", a card for everything the new
 * levels bring (NEW pill), "To the bandits" and "Great!". Several levels at once make one reveal.
 * Added to `host` (above pages and the HUD); null when the levels bring nothing to show.
 */
export function rewardReveal(host: HTMLElement, fromLv: number, toLv: number, o: RevealOpts = {}): HTMLElement | null {
  const list = levelRewards(fromLv, toLv);
  if (toLv <= fromLv || !list.length) return null;
  const firstBandit = list.find((r) => r.kind === 'bandit' || r.kind === 'hero') ?? null;
  let done = false;
  const close = (then?: () => void) => {
    if (done) return;
    done = true;
    dropOverlay(dismiss);
    fadeOut(wrap);
    o.onClose?.();
    then?.();
  };
  const dismiss = () => {
    audio.play('close');
    close();
  };
  const toBandits = (r: LevelReward) => {
    audio.play('click');
    close(() => o.onBandits?.(r));
  };
  // a bandit or hero card is a way into the Bandit menu (maps and wisdom are plain cards)
  const cards = rewardCards(list, { pill: 'new', onPick: o.onBandits ? toBandits : undefined, canPick: (r) => r.kind === 'bandit' || r.kind === 'hero' });
  cards.forEach((c, i) => {
    c.classList.add('anim-pop');
    c.style.setProperty('--d', `${520 + i * 110}ms`);
  });
  const star = h('div', { class: 'rv-star' }, h('div', { class: 'rays' }), uiIcon('xp', '⭐'), h('b', { class: 't-num' }, String(toLv)));
  const great = btn(t('Great!'), 'green', dismiss, { cls: 'rv-ok glint' });
  const actions = h('div', { class: 'rv-actions' }, firstBandit && o.onBandits ? btn(t('To the bandits'), 'blue', () => toBandits(firstBandit), { icon: uiIcon('mask', '🦝') }) : null, great);
  const box = h(
    'div',
    { class: 'reveal', role: 'dialog', 'aria-modal': 'true', 'aria-label': t('LEVEL {n}!', { n: toLv }) },
    star,
    h('h2', { class: 'rv-title t-title' }, t('LEVEL {n}!', { n: toLv })),
    h('p', { class: 'rv-sub' }, t('You unlocked new rewards')),
    h('div', { class: 'rv-cards', style: `--cards:${cards.length}` }, ...cards),
    actions,
  );
  const wrap = h('div', { class: 'reveal-wrap' }, twinkles(18, 11, 16), box);
  wrap.addEventListener('pointerdown', (e) => e.target === wrap && dismiss());
  host.append(wrap);
  pushOverlay(dismiss);
  audio.play('levelup');
  haptic('heavy');
  setTimeout(() => wrap.isConnected && confetti(wrap, 60), 380);
  requestAnimationFrame(() => great.focus({ preventScroll: true }));
  return wrap;
}
