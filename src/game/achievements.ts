import type { Profile } from '../save/storage';
import type { Game } from './Game';
import { MAPS } from './maps';

export interface AchievementDef {
  id: string;
  name: string;
  desc: string;
  icon: string;
  xp: number;
  /** progress 0..1 (for display) */
  progress: (p: Profile, g: Game | null) => number;
}

const ratio = (v: number, goal: number) => Math.min(1, v / goal);
const live = (g: Game | null, fn: (g: Game) => boolean) => (g && fn(g) ? 1 : 0);

export const ACHIEVEMENTS: AchievementDef[] = [
  { id: 'firstwin', name: 'First Victory', desc: 'Win a game on any map.', icon: '🏆', xp: 200, progress: (p) => ratio(p.stats.wins, 1) },
  { id: 'pop1k', name: 'Stardust Rookie', desc: 'Shatter 1,000 stars.', icon: '💫', xp: 100, progress: (p) => ratio(p.stats.pops, 1000) },
  { id: 'pop25k', name: 'Stardust Pro', desc: 'Shatter 25,000 stars.', icon: '💥', xp: 300, progress: (p) => ratio(p.stats.pops, 25000) },
  { id: 'pop500k', name: 'Stardust Legend', desc: 'Shatter 500,000 stars.', icon: '🌋', xp: 1000, progress: (p) => ratio(p.stats.pops, 500000) },
  { id: 'boss1', name: 'Sky Smasher', desc: 'Take down a boss.', icon: '☄️', xp: 150, progress: (p) => ratio(p.stats.bossesPopped, 1) },
  { id: 'boss100', name: 'Boss Hunter', desc: 'Take down 100 bosses.', icon: '🎯', xp: 600, progress: (p) => ratio(p.stats.bossesPopped, 100) },
  { id: 'gold1', name: 'Lucky Catch', desc: 'Shatter a Lucky Star.', icon: '🌠', xp: 150, progress: (p) => ratio(p.stats.golden ?? 0, 1) },
  { id: 'gold15', name: 'Treasure Hunter', desc: 'Shatter 15 Lucky Stars.', icon: '👑', xp: 500, progress: (p) => ratio(p.stats.golden ?? 0, 15) },
  { id: 'tier5', name: 'Legendary', desc: 'Buy any tier 5 upgrade.', icon: '⭐', xp: 300, progress: (p) => ratio((p.stats.tier5 ?? []).length, 1) },
  { id: 'tier5x5', name: 'Hall of Fame', desc: 'Buy tier 5 upgrades on 5 different bandits.', icon: '🌟', xp: 800, progress: (p) => ratio((p.stats.tier5 ?? []).length, 5) },
  { id: 'bond3', name: 'Best Friends', desc: 'Have 3 bonds active at once.', icon: '🤝', xp: 150, progress: (p, g) => Math.max(ratio(p.stats.maxBonds ?? 0, 3), live(g, (x) => bondCount(x) >= 3)) },
  { id: 'bond8', name: 'Power Network', desc: 'Have 8 bonds active at once.', icon: '🔗', xp: 400, progress: (p, g) => Math.max(ratio(p.stats.maxBonds ?? 0, 8), live(g, (x) => bondCount(x) >= 8)) },
  { id: 'hard', name: 'Hardcore', desc: 'Win a game on Hard.', icon: '🔥', xp: 500, progress: (p) => (Object.values(p.medals).some((m) => m.hard) ? 1 : 0) },
  { id: 'champ', name: 'Champion', desc: 'Win a game in Champion mode.', icon: '💎', xp: 1500, progress: (p) => (Object.values(p.medals).some((m) => m.champion) ? 1 : 0) },
  { id: 'explorer', name: 'Explorer', desc: 'Win on every map.', icon: '🗺️', xp: 1000, progress: (p) => ratio(MAPS.filter((m) => Object.values(p.medals[m.id] ?? {}).some(Boolean)).length, MAPS.length) },
  { id: 'combo500', name: 'Combo Master', desc: 'Reach a 500x combo.', icon: '🎰', xp: 300, progress: (p) => ratio(p.stats.bestCombo ?? 0, 500) },
  { id: 'frenzy10', name: 'Frenzied', desc: 'Unleash {frenzy} 10 times.', icon: '😤', xp: 200, progress: (p) => ratio(p.stats.frenzies ?? 0, 10) },
  { id: 'hero20', name: 'Living Legend', desc: 'Get a hero to level 20.', icon: '🦸', xp: 500, progress: (p, g) => Math.max(ratio(p.stats.heroMax ?? 1, 20), live(g, (x) => (x.hero?.heroLevel ?? 0) >= 20)) },
  { id: 'round120', name: 'Endless', desc: 'Reach round 120 in freeplay.', icon: '♾️', xp: 1500, progress: (p) => ratio(p.stats.bestRound, 120) },
  { id: 'flawless', name: 'Flawless', desc: 'Win a game without losing a single life.', icon: '🛡️', xp: 600, progress: (p) => ratio(p.stats.flawless ?? 0, 1) },
  { id: 'tycoon', name: 'Tycoon', desc: 'Hold 50,000 coins at once (not in Sandbox).', icon: '💰', xp: 300, progress: (p, g) => Math.max(ratio(p.stats.maxCash ?? 0, 50000), live(g, (x) => !x.sandbox && x.cash >= 50000)) },
  { id: 'daily1', name: 'Daily Duty', desc: 'Complete a daily challenge.', icon: '📅', xp: 200, progress: (p) => ratio(p.stats.dailies ?? 0, 1) },
  { id: 'daily7', name: 'Dedicated', desc: 'Complete 7 daily challenges.', icon: '🗓️', xp: 800, progress: (p) => ratio(p.stats.dailies ?? 0, 7) },
];

export function bondCount(g: Game): number {
  let n = 0;
  for (const t of g.towers) n += t.bonds.length;
  return n / 2;
}

/** Returns achievements that are complete but not yet recorded in the profile. */
export function newlyUnlocked(p: Profile, g: Game | null): AchievementDef[] {
  const out: AchievementDef[] = [];
  for (const a of ACHIEVEMENTS) {
    if (p.achievements?.[a.id]) continue;
    if (a.progress(p, g) >= 1) out.push(a);
  }
  return out;
}
