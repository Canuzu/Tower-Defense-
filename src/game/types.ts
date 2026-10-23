/** Shared simulation types. */

export type DamageType = 'sharp' | 'explosive' | 'cold' | 'energy' | 'fire' | 'normal';

export type TargetPriority = 'first' | 'last' | 'strong' | 'close';
export const TARGET_PRIORITIES: TargetPriority[] = ['first', 'last', 'strong', 'close'];

export type Difficulty = 'easy' | 'medium' | 'hard' | 'champion' | 'sandbox';

export interface DifficultyDef {
  id: Difficulty;
  name: string;
  desc: string;
  lives: number;
  cash: number;
  costMul: number;
  startRound: number;
  endRound: number;
  xpMul: number;
  color: string;
}

export const DIFFICULTIES: Record<Difficulty, DifficultyDef> = {
  easy: {
    id: 'easy',
    name: 'Easy',
    desc: '40 rounds · 200 lives · cheaper bandits',
    lives: 200,
    cash: 650,
    costMul: 0.85,
    startRound: 1,
    endRound: 40,
    xpMul: 1,
    color: '#5bd16a',
  },
  medium: {
    id: 'medium',
    name: 'Medium',
    desc: '60 rounds · 150 lives',
    lives: 150,
    cash: 650,
    costMul: 1,
    startRound: 1,
    endRound: 60,
    xpMul: 1.1,
    color: '#ffc93c',
  },
  hard: {
    id: 'hard',
    name: 'Hard',
    desc: '80 rounds · 100 lives · pricier bandits',
    lives: 100,
    cash: 650,
    costMul: 1.08,
    startRound: 1,
    endRound: 80,
    xpMul: 1.2,
    color: '#ff7a45',
  },
  champion: {
    id: 'champion',
    name: 'Champion',
    desc: 'Rounds 6–100 · ONE life · no mercy',
    lives: 1,
    cash: 650,
    costMul: 1.2,
    startRound: 6,
    endRound: 100,
    xpMul: 1.6,
    color: '#c45cff',
  },
  sandbox: {
    id: 'sandbox',
    name: 'Sandbox',
    desc: 'Infinite cash & lives · spawn anything',
    lives: 999999,
    cash: 9999999,
    costMul: 1,
    startRound: 1,
    endRound: 999,
    xpMul: 0,
    color: '#4cc9ff',
  },
};

export interface StatusApply {
  kind: 'slow' | 'freeze' | 'stun' | 'burn' | 'poison' | 'mark' | 'vuln' | 'decamo' | 'knockback' | 'shock';
  /** slow: speed multiplier (0.6 = 40% slower); mark: damage multiplier; vuln/shock: flat extra dmg; knockback: px */
  value?: number;
  duration?: number;
  /** damage per second for burn/poison */
  dps?: number;
  /** Multiplier applied to duration/value against boss-class gloops (0 = no effect). */
  boss?: number;
  /** Damage type used by DoT ticks. */
  dmgType?: DamageType;
  /** Freeze can affect white/zebra etc. when true */
  ignoreImmune?: boolean;
}
