import type { FxSink, SoundName } from '../game/fx';
import type { Enemy } from '../game/entities';
import type { Tower } from '../game/Tower';
import type { Renderer } from './Renderer';
import { audio } from '../audio/audio';
import { formatNum } from '../core/math';
import { haptic } from '../ui/haptics';
import { t, getLang } from '../i18n';

/** formatNum with German separators in German (1.500, 9,7M). */
function localNum(n: number): string {
  const s = formatNum(n);
  return getLang() === 'de' ? s.replace(/[.,]/g, (c) => (c === ',' ? '.' : ',')) : s;
}

/** Bridges simulation events to visuals, sound and haptics. */
export function makePresentation(r: Renderer): FxSink {
  let popBudget = 0;
  let lastPopFrame = 0;
  // Recent shatter spots. An overkill pops a star and all its children (or a boss and every boss
  // inside it) in one frame at the same place; only the first pop of such a cascade gets the full
  // burst, the rest add a couple of shards, so the result stays a crisp shatter instead of a cloud.
  const RN = 12;
  const rx = new Float64Array(RN);
  const ry = new Float64Array(RN);
  const rr = new Float64Array(RN);
  const rt = new Float64Array(RN).fill(-1e9);
  const rn = new Uint16Array(RN);
  let ri = 0;
  let lastMerged = 0;
  const mergeWindow = 140;
  const cascade = (x: number, y: number, rad: number, now: number): number => {
    for (let i = 0; i < RN; i++) {
      if (now - rt[i] > mergeWindow) continue;
      const R = rr[i] > 26 ? rr[i] : 26;
      const dx = x - rx[i];
      const dy = y - ry[i];
      if (dx * dx + dy * dy < R * R) return ++rn[i];
    }
    rx[ri] = x;
    ry[ri] = y;
    rr[ri] = rad;
    rt[ri] = now;
    rn[ri] = 0;
    ri = (ri + 1) % RN;
    return 0;
  };
  // comic words and "tink"s are fun once in a while, noise when a crowd pops
  let nextComic = 0;
  let nextTink = 0;
  const fireSound = (t: Tower): SoundName | null => {
    switch (t.typeId) {
      case 'spike':
      case 'buzz':
        return 'shoot';
      case 'boomer':
        return 'bomb';
      case 'frost':
        return 'freeze';
      case 'hoot':
        return 'snipe';
      case 'ember':
      case 'nova':
        return 'magic';
      case 'zap':
        return 'zap';
      case 'grizz':
        return 'bomb';
      default:
        return null;
    }
  };
  return {
    pop(e: Enemy) {
      // limit visual pops per frame for huge crowds
      const now = performance.now();
      if (now - lastPopFrame > 16) {
        lastPopFrame = now;
        popBudget = r.reducedEffects ? 8 : 24;
      }
      const m = (lastMerged = cascade(e.x, e.y, e.radius, now));
      if (e.def.boss) {
        r.shatter(e, m);
        if (m === 0) audio.play('bigpop', 1);
        return;
      }
      if (m > 2 && m % 6 !== 0) return;
      if (popBudget-- > 0) r.shatter(e, m);
      if (m === 0 && !r.reducedEffects && now > nextComic && Math.random() < (e.def.hp > 1 ? 0.5 : 0.05)) {
        nextComic = now + 450;
        r.comic(e.x, e.y - e.radius);
      }
      audio.play('pop', 0.5, 1 + (5 - Math.min(5, e.def.tier)) * 0.06);
    },
    immune(x, y) {
      const now = performance.now();
      if (now > nextTink && Math.random() < 0.3) {
        nextTink = now + 350;
        r.floatText(x, y - 12, t('tink'), '#cfd8e3', 10);
      }
    },
    explosion(x, y, radius, visual) {
      r.explosion(x, y, radius, visual);
      if (visual === 'nuke') audio.play('bomb', 1, 0.6);
      else if (visual === 'boom') audio.play('bomb', 0.55);
      else if (visual === 'frost') audio.play('freeze', 0.4);
    },
    pulse(x, y, radius, visual) {
      r.pulse(x, y, radius, visual);
    },
    fire(t: Tower) {
      const s = fireSound(t);
      if (s) audio.play(s, 0.32);
    },
    beam(kind, pts, color, width) {
      r.addBeam(kind, pts, color, width);
      if (kind === 'tracer') audio.play('snipe', 0.3);
    },
    text(x, y, str, color, size) {
      r.floatText(x, y, t(str), color, size);
    },
    cash(x, y, amount) {
      r.floatText(x, y, '+$' + localNum(Math.round(amount)), '#ffe066', amount >= 1000 ? 22 : 16);
      r.coins(x, y, Math.min(8, 2 + Math.floor(Math.log10(Math.max(1, amount)) * 2)));
    },
    leak(e: Enemy, lives: number) {
      r.leak(e, lives);
      if (lives > 0) {
        r.shake(Math.min(10, 2 + lives / 20));
        audio.play('leak', 0.7);
        haptic(lives >= 10 ? 'heavy' : 'medium');
      }
    },
    bossDeath(e: Enemy) {
      // one headline per cascade: the outermost boss names itself, the bosses inside it stay quiet
      if (lastMerged > 0) return;
      const text = t('{name} SHATTERED!', { name: t(e.def.name).toUpperCase() });
      // in a game the HUD's centre stage shows it (one message at a time); the menu demo has no HUD
      if (r.onHeadline) r.onHeadline(text);
      else r.floatText(e.x, e.y - e.radius, text, '#ffffff', 22);
      haptic('heavy');
    },
    shake(p) {
      r.shake(p);
    },
    sound(name, vol, pitch) {
      audio.play(name, vol, pitch);
    },
    ability(t, id) {
      if (t) r.sparkles(t.x, t.y - 30, 14, '#ffe066', 30);
      if (t && id === 'supplyDrop') {
        // the crate lands in front of the Hoarder, kept inside the playfield
        const x = Math.min(1560, Math.max(40, t.x + (t.x > 800 ? -46 : 46)));
        const y = Math.min(880, t.y + 34);
        r.dropCrate(x, y);
      }
      haptic('medium');
    },
    place(t: Tower) {
      r.placeFx(t);
      haptic('light');
    },
    upgrade(t: Tower) {
      r.upgradeFx(t);
      haptic('medium');
    },
    sell(t: Tower) {
      r.smokePuff(t.x, t.y, 12);
      audio.play('sell', 0.8);
      haptic('light');
    },
    freezeHit(e: Enemy) {
      if (Math.random() < 0.4) r.sparkles(e.x, e.y, 1, '#e8fbff', 8);
    },
  };
}
