import type { Enemy } from './entities';
import type { Tower } from './Tower';
import type { BoomVisual } from './towerTypes';

export type SoundName =
  | 'pop'
  | 'bigpop'
  | 'shoot'
  | 'bomb'
  | 'freeze'
  | 'zap'
  | 'snipe'
  | 'magic'
  | 'buzz'
  | 'tongue'
  | 'clank'
  | 'cash'
  | 'place'
  | 'upgrade'
  | 'sell'
  | 'leak'
  | 'roundStart'
  | 'roundEnd'
  | 'boss'
  | 'bossDie'
  | 'ability'
  | 'frenzy'
  | 'levelup'
  | 'victory'
  | 'defeat'
  | 'click'
  | 'error'
  | 'acorn';

export type BeamKind = 'tracer' | 'lightning' | 'tongue' | 'strike' | 'orbital' | 'ricochet';

/** Presentation hooks the simulation calls. Everything is optional-safe (no-op by default). */
export interface FxSink {
  pop(e: Enemy): void;
  immune(x: number, y: number): void;
  explosion(x: number, y: number, radius: number, visual: BoomVisual): void;
  pulse(x: number, y: number, radius: number, visual: 'frost' | 'slam' | 'shock' | 'nova' | 'quake'): void;
  fire(t: Tower, angle: number): void;
  beam(kind: BeamKind, pts: number[], color: string, width: number): void;
  /** `coin`: the text is a cash amount (drawn with the paw coin, never a "$"). */
  text(x: number, y: number, str: string, color: string, size?: number, coin?: boolean): void;
  cash(x: number, y: number, amount: number): void;
  leak(e: Enemy, lives: number): void;
  bossDeath(e: Enemy): void;
  shake(power: number): void;
  sound(name: SoundName, vol?: number, pitch?: number): void;
  ability(t: Tower | null, id: string): void;
  place(t: Tower): void;
  upgrade(t: Tower): void;
  sell(t: Tower): void;
  freezeHit(e: Enemy): void;
}

const noop = () => {};
export const NULL_FX: FxSink = {
  pop: noop,
  immune: noop,
  explosion: noop,
  pulse: noop,
  fire: noop,
  beam: noop,
  text: noop,
  cash: noop,
  leak: noop,
  bossDeath: noop,
  shake: noop,
  sound: noop,
  ability: noop,
  place: noop,
  upgrade: noop,
  sell: noop,
  freezeHit: noop,
};
