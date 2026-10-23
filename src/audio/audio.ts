import type { SoundName } from '../game/fx';
import { SFX, LOAD_ORDER, SYNTH_STANDIN, type Sfx, type SfxDef } from './bank';
import { SAMPLE_FILES } from './sampleFiles';
import { Music } from './music';

export type { Sfx, UiSound } from './bank';
export { shatterSound } from './bank';

/**
 * Game audio. Sound effects are small CC0 samples (public/audio, see LICENSES.md) that load in the
 * background after the first tap; until a sample is there (or if it cannot load, e.g. the one-file
 * build) the WebAudio synthesizer below plays a stand-in. The music is generated live (music.ts).
 *
 * Mixing rules (bank.ts): every sound has a minimum gap and a voice cap, gameplay sounds share a
 * voice budget, one UI sound per tap (the most specific wins), one jingle at a time, and big
 * moments (boss, victory, level-up) duck the music and the other gameplay sounds for a moment.
 */

/** sounds without files of their own play another sound's samples */
const ALIAS: Partial<Record<Sfx, Sfx>> = { click: 'tap' };
/** gameplay voices at once (battery saver: fewer) */
const WORLD_VOICES = 22;
const WORLD_VOICES_LOW = 12;
/** star shatters of all sizes together */
const SHATTER_VOICES = 7;
const LOAD_WORKERS = 4;

interface Voice {
  name: Sfx;
  out: GainNode;
  src: AudioBufferSourceNode | null;
  start: number;
  end: number;
  prio: number;
}

interface SfxState {
  last: number;
  voices: number;
  variant: number;
}

interface Duck {
  level: number;
  end: number;
}

export class AudioEngine {
  ctx: AudioContext | null = null;
  private master!: GainNode;
  /** the master output (after the compressor), for metering */
  comp: DynamicsCompressorNode | null = null;
  /** effects volume */
  private sfx!: GainNode;
  /** gameplay sounds (ducked under jingles) */
  private world!: GainNode;
  /** music volume */
  private musicBus!: GainNode;
  /** music ducking */
  private musicDuck!: GainNode;
  private noiseBuf: AudioBuffer | null = null;
  private state = new Map<Sfx, SfxState>();
  private worldVoices = 0;
  private shatterVoices = 0;
  private buffers = new Map<Sfx, AudioBuffer[]>();
  private loadStarted = false;
  private ext: 'm4a' | 'ogg' = 'm4a';
  private uiVoice: Voice | null = null;
  private uiPending: { name: Sfx; vol: number; pitch: number; prio: number } | null = null;
  private jingleVoice: Voice | null = null;
  private duckM: Duck = { level: 1, end: 0 };
  private duckW: Duck = { level: 1, end: 0 };
  private lowPowerOn = false;
  /** a UI sound asked for while the context was still starting (the very first tap) */
  private queued: { name: Sfx; vol: number; pitch: number; at: number } | null = null;
  sfxVolume = 0.8;
  musicVolume = 0.45;
  muted = false;
  music: Music | null = null;
  /** samples decoded so far (number of sounds) */
  loaded = 0;
  /** set to an array to record every started sound as "name:sample" / "name:synth" (tests) */
  log: string[] | null = null;

  constructor() {
    for (const k of Object.keys(SFX) as Sfx[]) this.state.set(k, { last: -1, voices: 0, variant: -1 });
  }

  unlock() {
    if (this.ctx) {
      // 'suspended', or iOS's 'interrupted' after a call or the app went to the background
      if (this.ctx.state !== 'running' && this.ctx.state !== 'closed') this.resume();
      return;
    }
    const AC = window.AudioContext || (window as any).webkitAudioContext;
    if (!AC) return;
    // a touch's pointerdown is not a user gesture yet (its pointerup is): a context made now would
    // start suspended (and the browser warns), so wait for the gesture where the browser can tell
    const ua = (navigator as any).userActivation as { isActive: boolean; hasBeenActive: boolean } | undefined;
    if (ua && !ua.isActive && !ua.hasBeenActive) return;
    const ctx: AudioContext = new AC();
    this.ctx = ctx;
    // glue + safety on the master: the samples are normalised to about -12 LUFS, the mix sits a bit
    // below that and peaks are caught here
    const comp = (this.comp = ctx.createDynamicsCompressor());
    comp.threshold.value = -14;
    comp.knee.value = 10;
    comp.ratio.value = 5;
    comp.attack.value = 0.003;
    comp.release.value = 0.25;
    this.master = ctx.createGain();
    this.master.connect(comp);
    comp.connect(ctx.destination);
    this.sfx = ctx.createGain();
    this.sfx.connect(this.master);
    this.world = ctx.createGain();
    this.world.connect(this.sfx);
    this.musicBus = ctx.createGain();
    this.musicBus.connect(this.master);
    this.musicDuck = ctx.createGain();
    this.musicDuck.connect(this.musicBus);
    const len = ctx.sampleRate;
    this.noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this.music = new Music(ctx, this.musicDuck);
    this.music.lowPower = this.lowPowerOn;
    this.applyVolumes();
    // older iOS only lets a context make sound after it played something inside a gesture
    try {
      const s = ctx.createBufferSource();
      s.buffer = ctx.createBuffer(1, 1, ctx.sampleRate);
      s.connect(ctx.destination);
      s.start(0);
    } catch {
      /* not needed elsewhere */
    }
    // still suspended (no gesture API, an odd browser): retry on the next gesture
    const retry = () => {
      if (!this.ctx || this.ctx.state === 'running' || this.ctx.state === 'closed') {
        for (const ev of ['pointerup', 'touchend', 'click', 'keydown']) window.removeEventListener(ev, retry, true);
        return;
      }
      this.resume();
    };
    for (const ev of ['pointerup', 'touchend', 'click', 'keydown']) window.addEventListener(ev, retry, true);
    this.loadSamples();
  }

  private resume() {
    const ctx = this.ctx;
    if (!ctx) return;
    ctx.resume().then(
      () => {
        const q = this.queued;
        this.queued = null;
        if (q && performance.now() - q.at < 400) this.play(q.name, q.vol, q.pitch);
      },
      () => {},
    );
  }

  /** Battery saver: fewer simultaneous sounds, a lighter music engine (no reverb, no partials). */
  set lowPower(on: boolean) {
    this.lowPowerOn = on;
    if (this.music) this.music.lowPower = on;
  }
  get lowPower() {
    return this.lowPowerOn;
  }

  applyVolumes() {
    if (!this.ctx) return;
    this.master.gain.value = this.muted ? 0 : 1;
    this.sfx.gain.value = this.sfxVolume * 1.25;
    this.musicBus.gain.value = this.musicVolume * 1.3;
    // silent music costs nothing: it stops scheduling notes
    if (this.music) this.music.enabled = !this.muted && this.musicVolume > 0.001;
  }

  /** Is a sound's sample decoded (false while it loads or when the synthesizer stands in)? */
  hasSample(name: Sfx) {
    return this.buffers.has(ALIAS[name] ?? name);
  }

  // ------------------------------------------------------------------------------------ playing

  play(name: Sfx, vol = 1, pitch = 1) {
    const ctx = this.ctx;
    if (!ctx || this.muted || this.sfxVolume <= 0) return;
    const def = SFX[name];
    if (!def) return;
    if (ctx.state !== 'running') {
      // the first tap: the context is starting, the tap's own sound plays as soon as it runs
      if (def.group === 'ui') this.queued = { name, vol, pitch, at: performance.now() };
      return;
    }
    if (def.group === 'ui') {
      // one sound per tap: requests from the same handler are merged, the most specific wins
      const p = def.prio ?? 1;
      const q = this.uiPending;
      if (q) {
        if (p >= q.prio) {
          q.name = name;
          q.vol = vol;
          q.pitch = pitch;
          q.prio = p;
        }
        return;
      }
      this.uiPending = { name, vol, pitch, prio: p };
      queueMicrotask(this.flushUi);
      return;
    }
    this.start(name, vol, pitch, def);
  }

  private flushUi = () => {
    const q = this.uiPending;
    this.uiPending = null;
    if (!q || !this.ctx) return;
    const now = this.ctx.currentTime;
    const cur = this.uiVoice;
    // the same tap asked again from a later handler (pointerdown, then click): only a more specific sound replaces it
    if (cur && now - cur.start < 0.09) {
      if (q.prio <= cur.prio) return;
      this.fadeOut(cur);
    }
    const v = this.start(q.name, q.vol, q.pitch, SFX[q.name]);
    if (v) this.uiVoice = v;
  };

  private start(name: Sfx, vol: number, pitch: number, def: SfxDef): Voice | null {
    const ctx = this.ctx!;
    const now = ctx.currentTime;
    const st = this.state.get(name)!;
    if (now - st.last < def.gap || st.voices >= def.cap) return null;
    const world = def.group === 'world';
    const shatter = name === 'pop' || name === 'popMid' || name === 'popBig';
    if (world && this.worldVoices >= (this.lowPowerOn ? WORLD_VOICES_LOW : WORLD_VOICES)) return null;
    if (shatter && this.shatterVoices >= (this.lowPowerOn ? 4 : SHATTER_VOICES)) return null;
    const prio = def.prio ?? 0;
    if (def.group === 'jingle') {
      const j = this.jingleVoice;
      if (j && j.end > now) {
        if (prio < j.prio) return null;
        this.fadeOut(j);
      }
    }
    const bus = world ? this.world : this.sfx;
    const bufs = this.buffers.get(ALIAS[name] ?? name);
    let v: Voice | null = null;
    if (bufs) {
      const n = bufs.length;
      const vi = n === 1 ? 0 : (st.variant + 1 + Math.floor(Math.random() * (n - 1))) % n;
      st.variant = vi;
      const buf = bufs[vi];
      const rate = Math.max(0.25, pitch * (1 + (Math.random() * 2 - 1) * def.jitter));
      const src = ctx.createBufferSource();
      src.buffer = buf;
      src.playbackRate.value = rate;
      const out = ctx.createGain();
      out.gain.value = vol * def.gain;
      src.connect(out).connect(bus);
      src.start(now);
      v = { name, out, src, start: now, end: now + buf.duration / rate, prio };
      const voice = v;
      src.onended = () => {
        out.disconnect();
        this.release(voice, world, shatter);
      };
      if (this.log) this.log.push(name + ':sample');
    } else {
      const stand = SYNTH_STANDIN[name];
      const out = ctx.createGain();
      out.gain.value = vol * (stand ? stand[2] : 1);
      out.connect(bus);
      const dur = this.synth(stand ? stand[0] : (name as SoundName), out, pitch * (stand ? stand[1] : 1));
      v = { name, out, src: null, start: now, end: now + dur, prio };
      const voice = v;
      setTimeout(() => {
        out.disconnect();
        this.release(voice, world, shatter);
      }, dur * 1000 + 80);
      if (this.log) this.log.push(name + ':synth');
    }
    st.last = now;
    st.voices++;
    if (world) this.worldVoices++;
    if (shatter) this.shatterVoices++;
    if (def.group === 'jingle') this.jingleVoice = v;
    const len = v.end - now;
    if (def.duck !== undefined && def.duck < 1) this.duck(this.musicDuck, this.duckM, def.duck, now, len);
    if (def.duckWorld !== undefined && def.duckWorld < 1) this.duck(this.world, this.duckW, def.duckWorld, now, len);
    return v;
  }

  private release(v: Voice, world: boolean, shatter: boolean) {
    const st = this.state.get(v.name);
    if (st) st.voices = Math.max(0, st.voices - 1);
    if (world) this.worldVoices = Math.max(0, this.worldVoices - 1);
    if (shatter) this.shatterVoices = Math.max(0, this.shatterVoices - 1);
    if (this.uiVoice === v) this.uiVoice = null;
    if (this.jingleVoice === v) this.jingleVoice = null;
  }

  private fadeOut(v: Voice) {
    const now = this.ctx!.currentTime;
    v.out.gain.cancelScheduledValues(now);
    v.out.gain.setTargetAtTime(0, now, 0.015);
    v.end = now;
    if (v.src) {
      try {
        v.src.stop(now + 0.08);
      } catch {
        /* already stopped */
      }
    }
  }

  /** Lowers a bus to `level` for `len` seconds (overlapping ducks keep the deepest level and the latest end). */
  private duck(g: GainNode, d: Duck, level: number, now: number, len: number) {
    const active = d.end > now;
    d.level = active ? Math.min(d.level, level) : level;
    d.end = Math.max(active ? d.end : 0, now + len * 0.85);
    const p = g.gain;
    p.cancelScheduledValues(now);
    p.setTargetAtTime(d.level, now, 0.04);
    p.setTargetAtTime(1, d.end, 0.35);
  }

  // ------------------------------------------------------------------------------------ loading

  /** Fetches and decodes the samples in the background, what a player hears first comes first. */
  private loadSamples() {
    if (this.loadStarted || !this.ctx) return;
    this.loadStarted = true;
    if (typeof fetch === 'undefined' || location.protocol === 'file:') return;
    this.ext = pickExt();
    const queue = LOAD_ORDER.filter((n) => SAMPLE_FILES[n]?.length);
    let i = 0;
    const worker = (): Promise<void> => {
      const name = queue[i++];
      if (!name) return Promise.resolve();
      return this.loadSound(name).then(worker, worker);
    };
    // after the tap that started audio has been handled; the first sound probes whether the files
    // are there at all (the one-file build has none: the synthesizer plays everything)
    setTimeout(() => {
      this.loadSound(queue[i++]).then(
        () => {
          if (!this.loaded) return;
          for (let k = 0; k < LOAD_WORKERS; k++) worker();
        },
        () => {},
      );
    }, 30);
  }

  private async loadSound(name: Sfx) {
    const n = SAMPLE_FILES[name]?.length ?? 0;
    const bufs: AudioBuffer[] = [];
    for (let v = 0; v < n; v++) {
      const b = await this.loadFile(`${name}_${v}`);
      if (b) bufs.push(b);
      else if (!bufs.length && this.loaded === 0) break;
    }
    if (bufs.length) {
      this.buffers.set(name, bufs);
      this.loaded++;
    }
  }

  private async loadFile(base: string): Promise<AudioBuffer | null> {
    const exts: ('m4a' | 'ogg')[] = this.ext === 'ogg' ? ['ogg', 'm4a'] : ['m4a', 'ogg'];
    for (const ext of exts) {
      try {
        const r = await fetch(`${BASE}audio/${base}.${ext}`);
        if (!r.ok) continue;
        const buf = await decode(this.ctx!, await r.arrayBuffer());
        // the other format works here: use it from now on
        this.ext = ext;
        return buf;
      } catch {
        /* try the other format */
      }
    }
    return null;
  }

  // ------------------------------------------------------------------------------- synthesizer

  /** Synthesized stand-in for a sound; returns its length in seconds. */
  private synth(name: SoundName, out: GainNode, pitch: number): number {
    const ctx = this.ctx!;
    const now = ctx.currentTime;
    const r = (a: number, b: number) => a + Math.random() * (b - a);
    const p = pitch * r(0.94, 1.06);
    switch (name) {
      case 'pop':
        this.tone(out, 'sine', 950 * p, 260 * p, 0.07, 0.55);
        this.noise(out, 0.03, 0.18, 3000, 'highpass');
        return 0.1;
      case 'bigpop':
        this.tone(out, 'triangle', 420 * p, 90 * p, 0.25, 0.7);
        this.noise(out, 0.2, 0.4, 900, 'lowpass');
        return 0.3;
      case 'shoot':
        this.noise(out, 0.05, 0.22, 2600 * p, 'bandpass');
        this.tone(out, 'triangle', 700 * p, 380 * p, 0.04, 0.12);
        return 0.08;
      case 'bomb':
        this.tone(out, 'sine', 140 * p, 38, 0.32, 0.9);
        this.noise(out, 0.32, 0.55, 700, 'lowpass');
        return 0.4;
      case 'freeze':
        for (const f of [2093, 2637, 3136]) this.tone(out, 'sine', f * p, f * p * 1.02, 0.25, 0.12);
        this.noise(out, 0.2, 0.15, 5000, 'highpass');
        return 0.3;
      case 'zap': {
        const o = ctx.createOscillator();
        o.type = 'sawtooth';
        const g = ctx.createGain();
        const f = ctx.createBiquadFilter();
        f.type = 'bandpass';
        f.frequency.value = 1600;
        o.frequency.setValueAtTime(900 * p, now);
        for (let i = 1; i < 6; i++) o.frequency.setValueAtTime(r(400, 1800) * p, now + i * 0.018);
        g.gain.setValueAtTime(0.35, now);
        g.gain.exponentialRampToValueAtTime(0.001, now + 0.13);
        o.connect(f).connect(g).connect(out);
        o.start(now);
        o.stop(now + 0.14);
        return 0.15;
      }
      case 'snipe':
        this.noise(out, 0.08, 0.6, 2500, 'highpass');
        this.tone(out, 'square', 1500 * p, 180, 0.06, 0.25);
        return 0.12;
      case 'magic':
        this.tone(out, 'sine', 620 * p, 1300 * p, 0.14, 0.3);
        this.tone(out, 'triangle', 930 * p, 1950 * p, 0.12, 0.12);
        return 0.16;
      case 'buzz': {
        // a soft wing buzz: a low-passed saw with a fast flutter
        const o = ctx.createOscillator();
        o.type = 'sawtooth';
        o.frequency.value = 190 * p;
        const lfo = ctx.createOscillator();
        lfo.frequency.value = 38;
        const lg = ctx.createGain();
        lg.gain.value = 18;
        lfo.connect(lg).connect(o.frequency);
        const f = ctx.createBiquadFilter();
        f.type = 'lowpass';
        f.frequency.value = 900;
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.0001, now);
        g.gain.linearRampToValueAtTime(0.12, now + 0.02);
        g.gain.exponentialRampToValueAtTime(0.001, now + 0.14);
        o.connect(f).connect(g).connect(out);
        o.start(now);
        lfo.start(now);
        o.stop(now + 0.15);
        lfo.stop(now + 0.15);
        return 0.16;
      }
      case 'tongue':
        this.sweep(out, 'sine', [280 * p, 720 * p, 200 * p], 0.18, 0.5);
        return 0.2;
      case 'clank':
        this.tone(out, 'square', 1250 * p, 1200 * p, 0.07, 0.12);
        this.tone(out, 'square', 1730 * p, 1700 * p, 0.06, 0.08);
        return 0.1;
      case 'cash':
        this.note(out, 'square', 988 * p, now, 0.06, 0.12);
        this.note(out, 'square', 1319 * p, now + 0.06, 0.12, 0.12);
        return 0.2;
      case 'acorn':
        this.tone(out, 'triangle', 1400 * p, 1700 * p, 0.08, 0.25);
        return 0.1;
      case 'place':
        this.tone(out, 'sine', 220, 90, 0.16, 0.7);
        this.note(out, 'triangle', 523, now + 0.02, 0.12, 0.25);
        this.noise(out, 0.08, 0.2, 500, 'lowpass');
        return 0.2;
      case 'upgrade':
        [523, 659, 784, 1047].forEach((f, i) => this.note(out, 'triangle', f * p, now + i * 0.055, 0.14, 0.32));
        this.note(out, 'sine', 2093 * p, now + 0.22, 0.25, 0.12);
        return 0.5;
      case 'sell':
        [784, 659, 523].forEach((f, i) => this.note(out, 'triangle', f, now + i * 0.05, 0.1, 0.25));
        return 0.3;
      case 'leak':
        this.tone(out, 'sawtooth', 180, 110, 0.28, 0.25);
        return 0.3;
      case 'roundStart':
        this.note(out, 'triangle', 392 * p, now, 0.12, 0.3);
        this.note(out, 'triangle', 523 * p, now + 0.12, 0.25, 0.35);
        this.noise(out, 0.1, 0.1, 6000, 'highpass');
        return 0.4;
      case 'roundEnd':
        [523, 659, 784].forEach((f, i) => this.note(out, 'square', f, now + i * 0.07, 0.12, 0.12));
        return 0.35;
      case 'boss': {
        const o1 = ctx.createOscillator();
        const o2 = ctx.createOscillator();
        o1.type = o2.type = 'sawtooth';
        o1.frequency.value = 73;
        o2.frequency.value = 75.5;
        const f = ctx.createBiquadFilter();
        f.type = 'lowpass';
        f.frequency.setValueAtTime(200, now);
        f.frequency.linearRampToValueAtTime(900, now + 0.6);
        f.frequency.linearRampToValueAtTime(150, now + 1.3);
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.0001, now);
        g.gain.linearRampToValueAtTime(0.5, now + 0.15);
        g.gain.exponentialRampToValueAtTime(0.001, now + 1.4);
        o1.connect(f);
        o2.connect(f);
        f.connect(g).connect(out);
        o1.start(now);
        o2.start(now);
        o1.stop(now + 1.45);
        o2.stop(now + 1.45);
        return 1.5;
      }
      case 'bossDie':
        this.tone(out, 'sine', 160, 30, 0.6, 1);
        this.noise(out, 0.7, 0.7, 1200, 'lowpass');
        [784, 988, 1175, 1568].forEach((f, i) => this.note(out, 'triangle', f, now + 0.1 + i * 0.06, 0.18, 0.2));
        return 0.8;
      case 'ability':
        this.noiseSweep(out, 0.5, 400, 6000, 0.35);
        [523, 659, 784].forEach((f) => this.note(out, 'sawtooth', f, now + 0.05, 0.4, 0.08));
        return 0.6;
      case 'frenzy':
        this.noiseSweep(out, 0.6, 300, 8000, 0.4);
        [392, 523, 659, 784, 1047].forEach((f, i) => this.note(out, 'square', f, now + i * 0.05, 0.25, 0.12));
        return 0.7;
      case 'levelup':
        [523, 659, 784, 1047, 1319].forEach((f, i) => this.note(out, 'triangle', f * p, now + i * 0.07, 0.2, 0.3));
        return 0.6;
      case 'victory':
        [523, 523, 523, 659, 784, 659, 784, 1047].forEach((f, i) => this.note(out, 'square', f, now + [0, 0.12, 0.24, 0.36, 0.6, 0.84, 0.96, 1.08][i], i === 7 ? 0.6 : 0.12, 0.16));
        return 1.8;
      case 'defeat':
        [392, 370, 349, 262].forEach((f, i) => this.note(out, 'triangle', f, now + i * 0.25, i === 3 ? 0.8 : 0.22, 0.3));
        return 1.6;
      case 'click':
        this.tone(out, 'sine', 1200 * p, 900 * p, 0.03, 0.2);
        return 0.05;
      case 'error':
        this.note(out, 'square', 180 * p, now, 0.08, 0.15);
        this.note(out, 'square', 150 * p, now + 0.1, 0.12, 0.15);
        return 0.25;
    }
    return 0.05;
  }

  private tone(out: AudioNode, type: OscillatorType, f0: number, f1: number, dur: number, vol: number) {
    const ctx = this.ctx!;
    const now = ctx.currentTime;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(Math.max(20, f0), now);
    o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), now + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + dur);
    o.connect(g).connect(out);
    o.start(now);
    o.stop(now + dur + 0.02);
  }

  private sweep(out: AudioNode, type: OscillatorType, fs: number[], dur: number, vol: number) {
    const ctx = this.ctx!;
    const now = ctx.currentTime;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(fs[0], now);
    fs.slice(1).forEach((f, i) => o.frequency.linearRampToValueAtTime(f, now + (dur * (i + 1)) / (fs.length - 1)));
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + dur);
    o.connect(g).connect(out);
    o.start(now);
    o.stop(now + dur + 0.02);
  }

  private note(out: AudioNode, type: OscillatorType, f: number, at: number, dur: number, vol: number) {
    const ctx = this.ctx!;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.value = f;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, at);
    g.gain.linearRampToValueAtTime(vol, at + 0.008);
    g.gain.exponentialRampToValueAtTime(0.001, at + dur);
    o.connect(g).connect(out);
    o.start(at);
    o.stop(at + dur + 0.02);
  }

  private noise(out: AudioNode, dur: number, vol: number, freq: number, type: BiquadFilterType) {
    const ctx = this.ctx!;
    const now = ctx.currentTime;
    const s = ctx.createBufferSource();
    s.buffer = this.noiseBuf;
    s.playbackRate.value = 0.8 + Math.random() * 0.4;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + dur);
    s.connect(f).connect(g).connect(out);
    s.start(now, Math.random() * 0.5);
    s.stop(now + dur + 0.02);
  }

  private noiseSweep(out: AudioNode, dur: number, f0: number, f1: number, vol: number) {
    const ctx = this.ctx!;
    const now = ctx.currentTime;
    const s = ctx.createBufferSource();
    s.buffer = this.noiseBuf;
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.Q.value = 2;
    f.frequency.setValueAtTime(f0, now);
    f.frequency.exponentialRampToValueAtTime(f1, now + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, now);
    g.gain.linearRampToValueAtTime(vol, now + dur * 0.6);
    g.gain.exponentialRampToValueAtTime(0.001, now + dur);
    s.connect(f).connect(g).connect(out);
    s.start(now);
    s.stop(now + dur + 0.02);
  }
}

const BASE: string = (import.meta.env?.BASE_URL as string | undefined) || './';

/** AAC (iOS, Safari, Chrome, Edge) where it plays, Ogg Vorbis otherwise (Chromium without AAC, some Firefox builds). */
function pickExt(): 'm4a' | 'ogg' {
  try {
    const a = document.createElement('audio');
    const aac = a.canPlayType('audio/mp4; codecs="mp4a.40.2"');
    const ogg = a.canPlayType('audio/ogg; codecs="vorbis"');
    if (aac === 'probably') return 'm4a';
    if (ogg === 'probably') return 'ogg';
    return aac ? 'm4a' : ogg ? 'ogg' : 'm4a';
  } catch {
    return 'm4a';
  }
}

/** decodeAudioData in its callback form (older Safari has no promise version). */
function decode(ctx: BaseAudioContext, data: ArrayBuffer): Promise<AudioBuffer> {
  return new Promise((res, rej) => {
    const p = ctx.decodeAudioData(data, res, rej);
    if (p && typeof (p as Promise<AudioBuffer>).then === 'function') (p as Promise<AudioBuffer>).then(res, rej);
  });
}

export const audio = new AudioEngine();

// dev builds: the console and the QA scripts reach the engine as window.__audio
if (import.meta.env?.DEV && typeof window !== 'undefined') (window as any).__audio = audio;
