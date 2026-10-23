import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { DE } from '../src/i18n/de';
import { setLang, t } from '../src/i18n';
import { TOWERS } from '../src/game/towers';
import { HEROES } from '../src/game/heroes';
import { GLOOPS } from '../src/game/gloops';
import { PERKS } from '../src/game/perks';
import { ACHIEVEMENTS } from '../src/game/achievements';
import { SYNERGIES } from '../src/game/synergy';
import { ROUNDS } from '../src/game/rounds';
import { DIFFICULTIES } from '../src/game/types';
import { MAPS } from '../src/game/maps';
import type { TowerStats } from '../src/game/towerTypes';

/**
 * One language for the whole game (design plan A6): raccoons are "Banditen", stars get shattered
 * (no pop/bloon jargon), amounts carry the paw coin instead of a "$", and the frenzy meter has one
 * name that every text takes from a single entry.
 */

const SRC = join(__dirname, '../src');
const GERMAN_BANNED = /Turm|Türm|\bPops?\b|\$/;
const ENGLISH_BANNED = /\$|\b(pops?|popped|popping|bloons?)\b/i;

/** Every English text the game data can show (names, descriptions, ability texts, round banners). */
function dataStrings(): string[] {
  const out: string[] = [];
  const ability = (s: TowerStats) => s.abilities.forEach((a) => out.push(a.name, a.desc));
  for (const def of Object.values(TOWERS)) {
    out.push(def.name, def.species, def.role, def.desc, ...def.pathNames);
    def.paths.forEach((path) => {
      const s = def.base();
      for (const u of path) {
        out.push(u.name, u.desc);
        u.apply(s);
        ability(s);
      }
    });
  }
  for (const def of Object.values(HEROES)) {
    out.push(def.name, def.title, def.desc);
    const s = def.base();
    for (const lv of def.levels) {
      out.push(lv.desc);
      lv.apply(s);
      ability(s);
    }
  }
  for (const g of Object.values(GLOOPS)) out.push(g.name, g.desc);
  for (const p of PERKS) out.push(p.name, p.desc);
  for (const a of ACHIEVEMENTS) out.push(a.name, a.desc);
  for (const s of SYNERGIES) out.push(s.name, s.descA, s.descB);
  for (const r of ROUNDS) if (r.hint) out.push(r.hint);
  for (const d of Object.values(DIFFICULTIES)) out.push(d.name, d.desc);
  for (const m of MAPS) out.push(m.name, m.desc, m.tier);
  return [...new Set(out.filter(Boolean))];
}

function sources(dir: string): { file: string; text: string }[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = join(dir, e.name);
    if (e.isDirectory()) return e.name === 'i18n' || e.name === 'audio' ? [] : sources(p);
    return p.endsWith('.ts') ? [{ file: p.slice(SRC.length + 1), text: readFileSync(p, 'utf8') }] : [];
  });
}

/** Texts drawn into the world (floating words, comic bursts): literal arguments of fx.text() and the comic word lists. */
function worldTexts(): string[] {
  const out: string[] = [];
  for (const { text } of sources(SRC)) {
    for (const m of text.matchAll(/fx\.text\([^,]+,[^,]+,\s*'((?:[^'\\]|\\.)*)'\s*,/g)) out.push(m[1]);
    for (const m of text.matchAll(/const words = ([^;]+);/g)) for (const w of m[1].matchAll(/'((?:[^'\\]|\\.)*)'/g)) out.push(w[1]);
  }
  return out;
}

afterAll(() => setLang('en'));

describe('terminology (one language: Banditen, Splitter, Münze)', () => {
  it('German texts never say Turm/Türme, Pops or $', () => {
    const bad = Object.entries(DE).filter(([, v]) => GERMAN_BANNED.test(v));
    expect(bad).toEqual([]);
  });

  it('visible English texts have no "$" and no pop jargon', () => {
    const texts = [...Object.keys(DE), ...dataStrings(), ...worldTexts()];
    expect(texts.length).toBeGreaterThan(800);
    expect(texts.filter((s) => ENGLISH_BANNED.test(s))).toEqual([]);
    // the raccoons are bandits in English too
    expect(texts.filter((s) => /\btowers?\b/i.test(s))).toEqual([]);
  });

  it('no amount is built with a "$" in front (the paw coin carries the meaning)', () => {
    const bad: string[] = [];
    for (const { file, text } of sources(SRC)) {
      text.split('\n').forEach((line, i) => {
        if (/'\+?\$'\s*\+|`\+?\$\$\{|uiIcon\('coin',\s*'\$'/.test(line)) bad.push(`${file}:${i + 1}: ${line.trim()}`);
      });
    }
    expect(bad).toEqual([]);
  });

  it('every text from the game data and the world has a German translation', () => {
    const missing = [...dataStrings(), ...worldTexts()].filter((s) => /[a-z]/i.test(s) && !(s in DE));
    expect(missing).toEqual([]);
  });

  it('the frenzy meter has one name: every other text refers to it as {frenzy}', () => {
    const others = Object.entries(DE).filter(([k]) => k !== 'FRENZY');
    expect(others.filter(([k, v]) => /FRENZY/.test(k) || /RASEREI|TURBO/i.test(v)).map(([k]) => k)).toEqual([]);
    expect(dataStrings().filter((s) => /FRENZY/.test(s))).toEqual([]);
    setLang('de');
    expect(t('FRENZY')).toBe('RASEREI');
    expect(t('TAP: {frenzy}!')).toBe('TIPPEN: RASEREI!');
    expect(t('{frenzy} {n}s', { n: 7 })).toBe('RASEREI 7s');
    expect(t('Unleash {frenzy} 10 times.')).toContain('RASEREI');
    setLang('en');
    expect(t('TAP: {frenzy}!')).toBe('TAP: FRENZY!');
    expect(t('{frenzy} lasts 3 seconds longer.')).toBe('FRENZY lasts 3 seconds longer.');
  });
});
