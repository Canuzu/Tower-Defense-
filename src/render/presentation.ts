import type { FxSink, SoundName } from '../game/fx';
import type { Enemy } from '../game/entities';
import type { Tower } from '../game/Tower';
import type { Renderer } from './Renderer';
import { audio } from '../audio/audio';
import { formatNum } from '../core/math';
import { haptic } from '../ui/haptics';
import { PK } from './particles';
import { t } from '../i18n';

/** Bridges simulation events to visuals, sound and haptics. */
export function makePresentation(r: Renderer): FxSink {
  let popBudget = 0;
  let lastPopFrame = 0;
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
      if (e.def.boss) {
        r.splat(e.x, e.y, e.def.color, e.radius, true);
        r.comic(e.x, e.y - e.radius, true);
        audio.play('bigpop', 1);
        return;
      }
      if (popBudget-- > 0) r.splat(e.x, e.y, e.def.color, e.radius);
      if (!r.reducedEffects && Math.random() < (e.def.hp > 1 ? 0.5 : 0.035)) r.comic(e.x, e.y - e.radius);
      audio.play('pop', 0.5, 1 + (5 - Math.min(5, e.def.tier)) * 0.06);
    },
    immune(x, y) {
      if (Math.random() < 0.3) r.floatText(x, y - 12, 'tink', '#cfd8e3', 10);
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
      r.floatText(x, y, '+$' + formatNum(Math.round(amount)), '#ffe066', amount >= 1000 ? 22 : 16);
      r.coins(x, y, Math.min(8, 2 + Math.floor(Math.log10(Math.max(1, amount)) * 2)));
    },
    leak(e: Enemy, lives: number) {
      if (lives > 0) {
        r.damageFlash = Math.min(0.6, 0.25 + lives / 200);
        r.shake(Math.min(10, 2 + lives / 20));
        audio.play('leak', 0.7);
        haptic('heavy');
      }
      void e;
    },
    bossDeath(e: Enemy) {
      r.confetti(e.x, e.y, 40);
      r.explosion(e.x, e.y, e.radius * 1.6, 'boom');
      r.floatText(e.x, e.y - e.radius, t('{name} POPPED!', { name: t(e.def.name).toUpperCase() }), '#ffffff', 22);
      haptic('heavy');
    },
    shake(p) {
      r.shake(p);
    },
    sound(name, vol, pitch) {
      audio.play(name, vol, pitch);
    },
    ability(t, id) {
      if (t) r.sparkles(t.x, t.y - 20, 14, '#ffe066', 30);
      haptic('medium');
      void id;
    },
    place(t: Tower) {
      r.smokePuff(t.x, t.y + 10, 8);
      r.sparkles(t.x, t.y - 10, 6, '#ffffff', 22);
      haptic('light');
    },
    upgrade(t: Tower) {
      r.sparkles(t.x, t.y - 20, 18, '#ffe066', 26);
      r.particles.spawn(PK.Spark, t.x, t.y - 20, { life: 0.4, size: 60, color: '#ffe066' });
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
