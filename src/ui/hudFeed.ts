/**
 * In-game messages (design plan A3): three channels, each with its own queue, so big moments never
 * pile up as loose text.
 *  - Stage: centre of the map, one ribbon at a time (at most 1.6 s). Boss > unlock > round /
 *    action > combo milestone; a higher one cuts the current one short, stale ones are dropped.
 *  - Progress: gold card top centre (achievements, XP, hero levels), 2.4 s; several of the same
 *    kind arriving together are bundled into one card with a count.
 *  - Tips: the cream toast, queued instead of replaced and placed where it covers no track.
 *    Long-lived tutorial steps are "sticky": other tips show over them and the step comes back.
 * Errors are not messages: they show at their source (hud.ts shakes the card / button).
 */
import { h } from './dom';
import { ribbon, uiIcon, reducedMotion, type RibbonColor } from './kit';

export type StageKind = 'boss' | 'unlock' | 'action' | 'round' | 'combo';

const PRIO: Record<StageKind, number> = { boss: 4, unlock: 3, action: 2, round: 2, combo: 1 };
/** how long a message may wait in the queue before it is no longer worth showing (ms) */
const TTL: Record<StageKind, number> = { boss: 6000, unlock: 9000, action: 500, round: 1500, combo: 600 };
/** on screen (ms), entrance and exit included */
const DUR: Record<StageKind, number> = { boss: 1600, unlock: 1600, action: 1100, round: 1250, combo: 1000 };
/** a newer message of these kinds replaces the current one instead of waiting behind it */
const REPLACES = new Set<StageKind>(['action', 'round', 'combo']);

export interface StageMsg {
  kind: StageKind;
  text: string;
  sub?: string | null;
  icon?: HTMLElement | null;
  color?: RibbonColor;
  /** a queued or showing message with the same key is updated in place (several level-ups) */
  key?: string;
}

interface StageItem extends StageMsg {
  at: number;
  el?: HTMLElement;
}

export class Stage {
  private cur: StageItem | null = null;
  private q: StageItem[] = [];
  private timer = 0;
  private dead = false;

  constructor(private root: HTMLElement) {}

  show(m: StageMsg) {
    if (this.dead) return;
    const now = performance.now();
    if (m.key) {
      if (this.cur && this.cur.key === m.key) {
        this.refresh(this.cur, m);
        return;
      }
      const queued = this.q.find((i) => i.key === m.key);
      if (queued) {
        Object.assign(queued, m);
        return;
      }
    }
    const it: StageItem = { ...m, at: now };
    const cur = this.cur;
    if (!cur) {
      this.display(it);
      return;
    }
    const p = PRIO[it.kind];
    const cp = PRIO[cur.kind];
    if (p > cp || (it.kind === cur.kind && REPLACES.has(it.kind))) {
      this.hide(true);
      this.display(it);
      return;
    }
    let i = this.q.length;
    while (i > 0 && PRIO[this.q[i - 1].kind] < p) i--;
    this.q.splice(i, 0, it);
    if (this.q.length > 4) this.q.length = 4;
  }

  /** the message currently on stage (tests, screenshots) */
  get current(): string | null {
    return this.cur ? this.cur.text : null;
  }

  destroy() {
    this.dead = true;
    clearTimeout(this.timer);
    this.cur?.el?.remove();
    this.cur = null;
    this.q = [];
  }

  private build(it: StageItem): HTMLElement {
    return h(
      'div',
      { class: `stage st-${it.kind}`, role: 'status' },
      ribbon(it.text, it.color ?? (it.kind === 'boss' ? 'red' : it.kind === 'unlock' ? 'gold' : 'purple'), it.icon ?? null, 'st-rb'),
      it.sub ? h('div', { class: 'st-sub' }, it.sub) : null,
    );
  }

  private display(it: StageItem) {
    this.cur = it;
    it.el = this.build(it);
    this.root.append(it.el);
    clearTimeout(this.timer);
    this.timer = window.setTimeout(() => this.next(), DUR[it.kind]);
  }

  private refresh(it: StageItem, m: StageMsg) {
    Object.assign(it, m);
    const old = it.el;
    it.el = this.build(it);
    it.el.classList.add('again');
    if (old) old.replaceWith(it.el);
    else this.root.append(it.el);
    clearTimeout(this.timer);
    this.timer = window.setTimeout(() => this.next(), DUR[it.kind]);
  }

  private hide(cut: boolean) {
    const el = this.cur?.el;
    this.cur = null;
    clearTimeout(this.timer);
    if (!el) return;
    if (reducedMotion()) {
      el.remove();
      return;
    }
    el.classList.add(cut ? 'cut' : 'out');
    setTimeout(() => el.remove(), cut ? 130 : 230);
  }

  private next() {
    if (this.dead) return;
    this.hide(false);
    const now = performance.now();
    while (this.q.length) {
      const it = this.q.shift()!;
      if (now - it.at <= TTL[it.kind]) {
        this.display(it);
        return;
      }
    }
  }
}

// -------------------------------------------------------------------------------------------------

export interface ProgressMsg {
  /** messages with the same key arriving together are bundled */
  key: string;
  icon: HTMLElement;
  kicker: string;
  /** kicker for a bundle of n */
  kickerMany?: (n: number) => string;
  title: string;
  /** XP or similar (shown as "+300" with the XP icon), summed when bundled */
  amount?: number;
  /** formats the amount (German separators) */
  fmt?: (n: number) => string;
}

interface ProgressItem extends ProgressMsg {
  n: number;
  titles: string[];
  el?: HTMLElement;
  shownAt: number;
}

const CARD_MS = 2400;
/** a bundle keeps growing for this long after the card appeared */
const BUNDLE_MS = 1600;

export class ProgressFeed {
  private cur: ProgressItem | null = null;
  private q: ProgressItem[] = [];
  private timer = 0;
  private dead = false;

  constructor(private root: HTMLElement) {}

  push(m: ProgressMsg) {
    if (this.dead) return;
    const now = performance.now();
    const same = this.cur && this.cur.key === m.key && now - this.cur.shownAt < BUNDLE_MS ? this.cur : this.q.find((i) => i.key === m.key);
    if (same) {
      same.n++;
      same.titles.push(m.title);
      same.amount = (same.amount ?? 0) + (m.amount ?? 0);
      if (same === this.cur) {
        this.render(same, true);
        clearTimeout(this.timer);
        this.timer = window.setTimeout(() => this.next(), CARD_MS);
      }
      return;
    }
    const it: ProgressItem = { ...m, n: 1, titles: [m.title], shownAt: 0 };
    if (!this.cur) this.display(it);
    else if (this.q.length < 3) this.q.push(it);
  }

  get visible(): boolean {
    return !!this.cur;
  }

  /** bottom edge (css px) of the card on screen, 0 when none */
  get bottom(): number {
    return this.cur?.el ? this.cur.el.getBoundingClientRect().bottom : 0;
  }

  destroy() {
    this.dead = true;
    clearTimeout(this.timer);
    this.cur?.el?.remove();
    this.cur = null;
    this.q = [];
  }

  private render(it: ProgressItem, bump: boolean) {
    const fmt = it.fmt ?? String;
    const many = it.n > 1;
    const icon = it.icon.cloneNode(true) as HTMLElement;
    const el = h(
      'div',
      { class: 'pcard' + (bump ? ' again' : ''), role: 'status' },
      h('div', { class: 'pc-ico' }, icon, many ? h('b', { class: 'pc-n' }, String(it.n)) : null),
      h('div', { class: 'pc-text' }, h('small', null, many && it.kickerMany ? it.kickerMany(it.n) : it.kicker), h('b', null, it.titles.join(', '))),
      it.amount ? h('div', { class: 'pc-amt' }, uiIcon('xp', '⭐'), h('span', null, '+' + fmt(it.amount))) : null,
    );
    if (it.el) it.el.replaceWith(el);
    else this.root.append(el);
    it.el = el;
  }

  private display(it: ProgressItem) {
    this.cur = it;
    it.shownAt = performance.now();
    // the stage moves down a little while the card is up (styles.css .hud.pc-on)
    this.root.classList.add('pc-on');
    this.render(it, false);
    clearTimeout(this.timer);
    this.timer = window.setTimeout(() => this.next(), CARD_MS);
  }

  private next() {
    if (this.dead) return;
    const el = this.cur?.el;
    this.cur = null;
    if (!this.q.length) this.root.classList.remove('pc-on');
    if (el) {
      if (reducedMotion()) el.remove();
      else {
        el.classList.add('out');
        setTimeout(() => el.remove(), 260);
      }
    }
    const it = this.q.shift();
    if (it) this.timer = window.setTimeout(() => this.display(it), reducedMotion() ? 0 : 160);
  }
}

// -------------------------------------------------------------------------------------------------

export interface Tip {
  text: string;
  ms: number;
  icon?: string;
  cls?: string;
  /** shown before the other queued tips (round complete) */
  front?: boolean;
  /** sticky tips (tutorial steps) with the same tag replace each other */
  tag?: string;
}

/** a tip this long or longer stays until replaced (tutorial steps) */
const STICKY_MS = 60_000;

export class Tips {
  private cur: (Tip & { el: HTMLElement; left: number }) | null = null;
  private q: Tip[] = [];
  private sticky: Tip | null = null;
  private dead = false;

  /** `place(w, h)` returns the top-left (css px) for a toast of that size */
  constructor(
    private root: HTMLElement,
    private place: (w: number, h: number) => [number, number],
  ) {}

  show(t: Tip) {
    if (this.dead) return;
    if (t.ms >= STICKY_MS) {
      this.sticky = t;
      // a sticky step replaces the previous step right away; other tips keep their turn
      if (!this.cur || this.cur.ms >= STICKY_MS) this.display(t);
      return;
    }
    if (this.cur && this.cur.text === t.text) {
      this.cur.left = Math.max(this.cur.left, t.ms / 1000);
      return;
    }
    if (this.q.some((x) => x.text === t.text)) return;
    // a tip waiting behind a sticky tutorial step shows over it now (the step comes back after)
    if (!this.cur || this.cur.ms >= STICKY_MS) {
      this.display(t);
      return;
    }
    if (t.front) this.q.unshift(t);
    else this.q.push(t);
    // keep the queue short: the oldest plain tips go first
    while (this.q.length > 4) {
      const i = this.q.findIndex((x) => !x.front);
      this.q.splice(i >= 0 ? i : this.q.length - 1, 1);
    }
  }

  /** drop the sticky tutorial step (the tutorial moved on) */
  clearSticky() {
    this.sticky = null;
    if (this.cur && this.cur.ms >= STICKY_MS) this.hideCur();
    if (!this.cur) this.advance();
  }

  /** current text (tests) */
  get text(): string | null {
    return this.cur ? this.cur.text : null;
  }

  /** advance timers; `dt` in seconds */
  tick(dt: number) {
    const c = this.cur;
    if (!c || c.ms >= STICKY_MS) return;
    if ((c.left -= dt) > 0) return;
    this.hideCur();
    this.advance();
  }

  /** re-place the current tip (panel opened / closed, resize) */
  relayout() {
    const c = this.cur;
    if (!c) return;
    const [x, y] = this.place(c.el.offsetWidth, c.el.offsetHeight);
    c.el.style.left = `${Math.round(x)}px`;
    c.el.style.top = `${Math.round(y)}px`;
  }

  destroy() {
    this.dead = true;
    this.cur?.el.remove();
    this.cur = null;
    this.q = [];
    this.sticky = null;
  }

  private advance() {
    const n = this.q.shift() ?? this.sticky;
    if (n) this.display(n);
  }

  private hideCur() {
    const c = this.cur;
    if (!c) return;
    this.cur = null;
    const el = c.el;
    if (reducedMotion()) el.remove();
    else {
      el.classList.add('out');
      setTimeout(() => el.remove(), 220);
    }
  }

  private display(t: Tip) {
    if (this.cur) {
      // a sticky step gives way without the exit animation (it comes back in place)
      const el = this.cur.el;
      this.cur = null;
      el.remove();
    }
    const el = h('div', { class: 'toast' + (t.icon ? ' has-ico' : '') + (t.cls ? ' ' + t.cls : ''), role: 'status' }, t.icon ? uiIcon(t.icon, '', 't-ico') : null, h('span', null, t.text));
    el.style.visibility = 'hidden';
    this.root.append(el);
    const [x, y] = this.place(el.offsetWidth, el.offsetHeight);
    el.style.left = `${Math.round(x)}px`;
    el.style.top = `${Math.round(y)}px`;
    el.style.visibility = '';
    this.cur = { ...t, el, left: t.ms / 1000 };
  }
}

