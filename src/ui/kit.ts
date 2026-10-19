/**
 * Star Bandits UI kit: small DOM builders for the design-system classes documented at the top of
 * styles.css. Every painted icon goes through src/render/art.ts and falls back to an emoji (or the
 * procedural art) when a sprite is missing, so screens never show broken images.
 */
import { h } from './dom';
import { uiIconUrl, towerIconUrl, heroIconUrl, enemyIconUrl, mapImageUrl } from '../render/art';
import { towerIcon, type ArtId } from '../render/towerArt';
import { mapThumbnail } from '../render/mapArt';
import { Path } from '../game/path';
import type { MapDef } from '../game/maps';
import type { GloopId } from '../game/gloops';
import { gloopIcon } from './icons';
import { getLang, t } from '../i18n';

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
/** Painted map background, or the procedural thumbnail while the painting is missing. */
export function mapImageSrc(m: MapDef): string {
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

export function reducedMotion(): boolean {
  return document.documentElement.classList.contains('reduce-motion') || matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/** Animated number count-up with a little bump at the end. */
export function countUp(el: HTMLElement, to: number, opts: { from?: number; dur?: number; delay?: number; format?: (n: number) => string } = {}) {
  const f = opts.format ?? fmt;
  const from = opts.from ?? 0;
  if (reducedMotion() || to === from) {
    el.textContent = f(to);
    return;
  }
  const dur = opts.dur ?? Math.min(1400, 500 + Math.log10(Math.abs(to - from) + 1) * 260);
  el.textContent = f(from);
  const begin = performance.now() + (opts.delay ?? 0);
  const step = (now: number) => {
    if (!el.isConnected && now - begin > 50) return;
    const k = Math.min(1, Math.max(0, (now - begin) / dur));
    const e = 1 - Math.pow(1 - k, 3);
    el.textContent = f(from + (to - from) * e);
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

/** Sets the stagger index (--i) on each element and adds the entrance class. */
export function stagger<T extends HTMLElement>(els: T[], cls = 'anim-rise', start = 0): T[] {
  els.forEach((el, i) => {
    el.classList.add(cls);
    el.style.setProperty('--i', String(start + i));
  });
  return els;
}

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

/** Round icon button with an outlined label under it (menu dock, settings). */
export function roundBtn(icon: HTMLElement, label: string, onClick: () => void, badge: string | null = null, cls = ''): HTMLButtonElement {
  const b = h('button', { class: ('rbtn ' + cls).trim(), type: 'button', 'aria-label': label }, h('span', { class: 'rbtn-face' }, icon), h('span', { class: 'rbtn-label' }, label), badge ? h('span', { class: 'badge' }, badge) : null) as HTMLButtonElement;
  b.addEventListener('click', onClick);
  return b;
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

/** Fades the top/bottom edge of a scroll area while more content hides there. */
export function watchScroll(el: HTMLElement) {
  const update = () => {
    const more = el.scrollHeight - el.clientHeight > 2;
    el.classList.toggle('more-top', more && el.scrollTop > 2);
    el.classList.toggle('more-bottom', more && el.scrollTop < el.scrollHeight - el.clientHeight - 2);
  };
  el.addEventListener('scroll', update, { passive: true });
  if (typeof ResizeObserver !== 'undefined') {
    const ro = new ResizeObserver(update);
    ro.observe(el);
    for (const c of el.children) ro.observe(c);
  }
  requestAnimationFrame(update);
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
