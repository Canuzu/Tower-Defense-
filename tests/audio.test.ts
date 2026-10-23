import { describe, expect, it } from 'vitest';
import { existsSync, readdirSync, statSync } from 'fs';
import { join } from 'path';
import { SFX, LOAD_ORDER, SYNTH_STANDIN, shatterSound, type Sfx } from '../src/audio/bank';
import { SAMPLE_FILES } from '../src/audio/sampleFiles';

const DIR = join(__dirname, '..', 'public', 'audio');

describe('sound bank', () => {
  it('every sample set has a mix entry and loads after the first tap', () => {
    for (const name of Object.keys(SAMPLE_FILES)) {
      expect(SFX[name as Sfx], name).toBeDefined();
      expect(LOAD_ORDER, name).toContain(name);
    }
  });

  it('ships every variant as AAC (.m4a) and Ogg Vorbis, inside the size budget', () => {
    let bytes = 0;
    for (const [name, durs] of Object.entries(SAMPLE_FILES)) {
      expect(durs.length, name).toBeGreaterThan(0);
      durs.forEach((d, i) => {
        expect(d, `${name}_${i} length`).toBeGreaterThan(0.05);
        expect(d, `${name}_${i} length`).toBeLessThan(2.5);
        for (const ext of ['m4a', 'ogg']) {
          const f = join(DIR, `${name}_${i}.${ext}`);
          expect(existsSync(f), f).toBe(true);
          bytes += statSync(f).size;
        }
      });
    }
    // nothing in the folder that the bank does not know about
    const known = new Set(Object.entries(SAMPLE_FILES).flatMap(([n, d]) => d.flatMap((_, i) => [`${n}_${i}.m4a`, `${n}_${i}.ogg`])));
    for (const f of readdirSync(DIR)) if (/\.(m4a|ogg)$/.test(f)) expect(known.has(f), f).toBe(true);
    expect(bytes).toBeLessThan(3 * 1024 * 1024);
  });

  it('every sound without samples still has a synthesizer voice', () => {
    const synth = new Set(['pop', 'bigpop', 'shoot', 'bomb', 'freeze', 'zap', 'snipe', 'magic', 'buzz', 'tongue', 'clank', 'cash', 'acorn', 'place', 'upgrade', 'sell', 'leak', 'roundStart', 'roundEnd', 'boss', 'bossDie', 'ability', 'frenzy', 'levelup', 'victory', 'defeat', 'click', 'error']);
    for (const name of Object.keys(SFX) as Sfx[]) {
      if (synth.has(name)) continue;
      expect(SYNTH_STANDIN[name], name).toBeDefined();
    }
  });

  it('mix rules stay sane: caps, gaps, pitch jitter of the shatters', () => {
    for (const [name, d] of Object.entries(SFX)) {
      expect(d.cap, name).toBeGreaterThanOrEqual(1);
      expect(d.gap, name).toBeGreaterThan(0);
      expect(d.gain, name).toBeLessThanOrEqual(1);
      if (d.group === 'ui' || d.group === 'jingle') expect(d.prio, name).toBeDefined();
    }
    for (const s of ['pop', 'popMid', 'popBig', 'bigpop'] as Sfx[]) {
      expect(SFX[s].jitter).toBeCloseTo(0.04);
      expect(SAMPLE_FILES[s]).toHaveLength(3);
    }
  });

  it('picks the shatter by star size', () => {
    expect(shatterSound(1)).toBe('pop');
    expect(shatterSound(3)).toBe('pop');
    expect(shatterSound(4)).toBe('popMid');
    expect(shatterSound(6)).toBe('popMid');
    expect(shatterSound(7)).toBe('popBig');
    expect(shatterSound(9)).toBe('popBig');
    expect(shatterSound(10, true)).toBe('bigpop');
  });
});
