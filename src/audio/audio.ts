import type { SoundName } from '../game/fx';

/**
 * Fully synthesized audio: every sound effect and the music are generated with WebAudio,
 * so the game ships without any audio files.
 */
export class AudioEngine {
  ctx: AudioContext | null = null;
  private master!: GainNode;
  private sfx!: GainNode;
  private musicBus!: GainNode;
  private noiseBuf: AudioBuffer | null = null;
  private last = new Map<string, number>();
  private voices = 0;
  sfxVolume = 0.8;
  musicVolume = 0.45;
  muted = false;
  music: Music | null = null;

  unlock() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    const AC = window.AudioContext || (window as any).webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    const comp = this.ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.ratio.value = 6;
    this.master = this.ctx.createGain();
    this.master.connect(comp);
    comp.connect(this.ctx.destination);
    this.sfx = this.ctx.createGain();
    this.sfx.connect(this.master);
    this.musicBus = this.ctx.createGain();
    this.musicBus.connect(this.master);
    this.applyVolumes();
    const len = this.ctx.sampleRate;
    this.noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this.music = new Music(this.ctx, this.musicBus);
  }

  applyVolumes() {
    if (!this.ctx) return;
    this.master.gain.value = this.muted ? 0 : 1;
    this.sfx.gain.value = this.sfxVolume * 0.6;
    this.musicBus.gain.value = this.musicVolume * 0.35;
  }

  private minGap(name: SoundName): number {
    switch (name) {
      case 'pop':
        return 0.028;
      case 'shoot':
      case 'buzz':
        return 0.05;
      case 'clank':
        return 0.12;
      case 'zap':
      case 'freeze':
      case 'bomb':
      case 'snipe':
      case 'magic':
        return 0.06;
      case 'cash':
        return 0.05;
      default:
        return 0.02;
    }
  }

  play(name: SoundName, vol = 1, pitch = 1) {
    const ctx = this.ctx;
    if (!ctx || this.muted || ctx.state !== 'running') return;
    const now = ctx.currentTime;
    const last = this.last.get(name) ?? -1;
    if (now - last < this.minGap(name)) return;
    if (this.voices > 28) return;
    this.last.set(name, now);
    const out = ctx.createGain();
    out.gain.value = vol;
    out.connect(this.sfx);
    this.voices++;
    const done = (t: number) => {
      setTimeout(() => {
        this.voices--;
        out.disconnect();
      }, t * 1000 + 50);
    };
    const r = (a: number, b: number) => a + Math.random() * (b - a);
    const p = pitch * r(0.94, 1.06);
    switch (name) {
      case 'pop': {
        this.tone(out, 'sine', 950 * p, 260 * p, 0.07, 0.55);
        this.noise(out, 0.03, 0.18, 3000, 'highpass');
        done(0.1);
        break;
      }
      case 'bigpop': {
        this.tone(out, 'triangle', 420 * p, 90 * p, 0.25, 0.7);
        this.noise(out, 0.2, 0.4, 900, 'lowpass');
        done(0.3);
        break;
      }
      case 'shoot':
        this.noise(out, 0.05, 0.22, 2600 * p, 'bandpass');
        this.tone(out, 'triangle', 700 * p, 380 * p, 0.04, 0.12);
        done(0.08);
        break;
      case 'bomb':
        this.tone(out, 'sine', 140 * p, 38, 0.32, 0.9);
        this.noise(out, 0.32, 0.55, 700, 'lowpass');
        done(0.4);
        break;
      case 'freeze':
        for (const f of [2093, 2637, 3136]) this.tone(out, 'sine', f * p, f * p * 1.02, 0.25, 0.12);
        this.noise(out, 0.2, 0.15, 5000, 'highpass');
        done(0.3);
        break;
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
        done(0.15);
        break;
      }
      case 'snipe':
        this.noise(out, 0.08, 0.6, 2500, 'highpass');
        this.tone(out, 'square', 1500 * p, 180, 0.06, 0.25);
        done(0.12);
        break;
      case 'magic':
        this.tone(out, 'sine', 620 * p, 1300 * p, 0.14, 0.3);
        this.tone(out, 'triangle', 930 * p, 1950 * p, 0.12, 0.12);
        done(0.16);
        break;
      case 'buzz':
        this.tone(out, 'square', 210 * p, 230 * p, 0.09, 0.08);
        done(0.1);
        break;
      case 'tongue':
        this.sweep(out, 'sine', [280 * p, 720 * p, 200 * p], 0.18, 0.5);
        done(0.2);
        break;
      case 'clank':
        this.tone(out, 'square', 1250 * p, 1200 * p, 0.07, 0.12);
        this.tone(out, 'square', 1730 * p, 1700 * p, 0.06, 0.08);
        done(0.1);
        break;
      case 'cash':
        this.note(out, 'square', 988 * p, now, 0.06, 0.12);
        this.note(out, 'square', 1319 * p, now + 0.06, 0.12, 0.12);
        done(0.2);
        break;
      case 'acorn':
        this.tone(out, 'triangle', 1400 * p, 1700 * p, 0.08, 0.25);
        done(0.1);
        break;
      case 'place':
        this.tone(out, 'sine', 220, 90, 0.16, 0.7);
        this.note(out, 'triangle', 523, now + 0.02, 0.12, 0.25);
        this.noise(out, 0.08, 0.2, 500, 'lowpass');
        done(0.2);
        break;
      case 'upgrade':
        [523, 659, 784, 1047].forEach((f, i) => this.note(out, 'triangle', f, now + i * 0.055, 0.14, 0.32));
        this.note(out, 'sine', 2093, now + 0.22, 0.25, 0.12);
        done(0.5);
        break;
      case 'sell':
        [784, 659, 523].forEach((f, i) => this.note(out, 'triangle', f, now + i * 0.05, 0.1, 0.25));
        done(0.3);
        break;
      case 'leak':
        this.tone(out, 'sawtooth', 180, 110, 0.28, 0.25);
        done(0.3);
        break;
      case 'roundStart':
        this.note(out, 'triangle', 392, now, 0.12, 0.3);
        this.note(out, 'triangle', 523, now + 0.12, 0.25, 0.35);
        this.noise(out, 0.1, 0.1, 6000, 'highpass');
        done(0.4);
        break;
      case 'roundEnd':
        [523, 659, 784].forEach((f, i) => this.note(out, 'square', f, now + i * 0.07, 0.12, 0.12));
        done(0.35);
        break;
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
        done(1.5);
        break;
      }
      case 'bossDie':
        this.tone(out, 'sine', 160, 30, 0.6, 1);
        this.noise(out, 0.7, 0.7, 1200, 'lowpass');
        [784, 988, 1175, 1568].forEach((f, i) => this.note(out, 'triangle', f, now + 0.1 + i * 0.06, 0.18, 0.2));
        done(0.8);
        break;
      case 'ability':
        this.noiseSweep(out, 0.5, 400, 6000, 0.35);
        [523, 659, 784].forEach((f) => this.note(out, 'sawtooth', f, now + 0.05, 0.4, 0.08));
        done(0.6);
        break;
      case 'frenzy':
        this.noiseSweep(out, 0.6, 300, 8000, 0.4);
        [392, 523, 659, 784, 1047].forEach((f, i) => this.note(out, 'square', f, now + i * 0.05, 0.25, 0.12));
        done(0.7);
        break;
      case 'levelup':
        [523, 659, 784, 1047, 1319].forEach((f, i) => this.note(out, 'triangle', f, now + i * 0.07, 0.2, 0.3));
        done(0.6);
        break;
      case 'victory':
        [523, 523, 523, 659, 784, 659, 784, 1047].forEach((f, i) => this.note(out, 'square', f, now + [0, 0.12, 0.24, 0.36, 0.6, 0.84, 0.96, 1.08][i], i === 7 ? 0.6 : 0.12, 0.16));
        done(1.8);
        break;
      case 'defeat':
        [392, 370, 349, 262].forEach((f, i) => this.note(out, 'triangle', f, now + i * 0.25, i === 3 ? 0.8 : 0.22, 0.3));
        done(1.6);
        break;
      case 'click':
        this.tone(out, 'sine', 1200, 900, 0.03, 0.2);
        done(0.05);
        break;
      case 'error':
        this.note(out, 'square', 180, now, 0.08, 0.15);
        this.note(out, 'square', 150, now + 0.1, 0.12, 0.15);
        done(0.25);
        break;
    }
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

// ---------------------------------------------------------------------------------------------
// Procedural music
// ---------------------------------------------------------------------------------------------

type Track = 'menu' | 'game';

const NOTE = (n: number) => 440 * Math.pow(2, (n - 69) / 12);

/** Chord progressions as MIDI roots + quality */
const PROGRESSIONS: Record<Track, [number, 'maj' | 'min'][]> = {
  menu: [
    [60, 'maj'],
    [57, 'min'],
    [53, 'maj'],
    [55, 'maj'],
  ],
  game: [
    [53, 'maj'],
    [55, 'maj'],
    [52, 'min'],
    [57, 'min'],
    [53, 'maj'],
    [55, 'maj'],
    [60, 'maj'],
    [55, 'maj'],
  ],
};

const MELODY: Record<Track, number[]> = {
  // semitones above C5 (C major pentatonic), -1 = rest; 16 steps per bar
  menu: [0, -1, 2, -1, 4, -1, 2, 4, 7, -1, 4, -1, 2, -1, -1, -1, 9, -1, 7, -1, 4, -1, 7, 9, 12, -1, 9, -1, 7, -1, -1, -1],
  game: [7, -1, 9, 7, 4, -1, 2, -1, 4, 7, -1, 9, 12, -1, 9, -1, 7, -1, 4, -1, 2, 4, 2, 0, 2, -1, 4, -1, 7, -1, -1, -1],
};

class Music {
  private timer: number | null = null;
  private step = 0;
  private nextTime = 0;
  track: Track = 'menu';
  intensity = 0;
  frenzy = false;
  private out: GainNode;
  private noise: AudioBuffer;
  playing = false;

  constructor(
    private ctx: AudioContext,
    bus: GainNode,
  ) {
    this.out = ctx.createGain();
    this.out.gain.value = 1;
    this.out.connect(bus);
    const len = ctx.sampleRate * 0.5;
    this.noise = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  }

  start(track: Track) {
    if (this.playing && this.track === track) return;
    this.track = track;
    this.step = 0;
    this.nextTime = this.ctx.currentTime + 0.1;
    this.playing = true;
    if (this.timer === null) this.timer = window.setInterval(() => this.schedule(), 50);
  }

  stop() {
    this.playing = false;
    if (this.timer !== null) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  private get bpm() {
    return this.track === 'menu' ? 104 : this.frenzy ? 132 : 116;
  }

  private schedule() {
    if (!this.playing) return;
    const spb = 60 / this.bpm / 4; // 16th notes
    while (this.nextTime < this.ctx.currentTime + 0.15) {
      this.playStep(this.step, this.nextTime, spb);
      this.nextTime += spb;
      this.step++;
    }
  }

  private playStep(step: number, t: number, spb: number) {
    const prog = PROGRESSIONS[this.track];
    const bar = Math.floor(step / 16) % prog.length;
    const s = step % 16;
    const [root, q] = prog[bar];
    const third = q === 'maj' ? 4 : 3;
    const lvl = this.track === 'menu' ? 1 : this.intensity;
    // bass on 8ths
    if (s % 2 === 0) {
      const n = s % 8 === 6 ? root + 7 : root;
      this.voice('triangle', NOTE(n - 24), t, spb * 1.8, 0.32);
    }
    // pad chord on bar start
    if (s === 0) {
      for (const iv of [0, third, 7]) this.voice('sine', NOTE(root + iv), t, spb * 15, 0.07, 0.4);
    }
    // arpeggio pluck
    if (s % 2 === 1 || this.frenzy) {
      const arp = [0, third, 7, 12][(s >> 1) % 4];
      this.voice('square', NOTE(root + arp + 12), t, spb * 0.8, this.frenzy ? 0.05 : 0.035);
    }
    if (lvl >= 1) {
      // drums
      if (s % 4 === 0) this.kick(t);
      if (s % 8 === 4) this.snare(t);
      if (s % 2 === 0 || this.frenzy) this.hat(t, s % 4 === 2 ? 0.06 : 0.035);
    }
    if (lvl >= 2 || this.track === 'menu') {
      const mel = MELODY[this.track];
      const m = mel[(step % mel.length)];
      if (m >= 0) this.voice('triangle', NOTE(72 + m), t, spb * 1.6, 0.09, 0.01, true);
    }
  }

  private voice(type: OscillatorType, f: number, t: number, dur: number, vol: number, attack = 0.005, vib = false) {
    const o = this.ctx.createOscillator();
    o.type = type;
    o.frequency.value = f;
    if (vib) {
      const lfo = this.ctx.createOscillator();
      const lg = this.ctx.createGain();
      lfo.frequency.value = 5.5;
      lg.gain.value = f * 0.006;
      lfo.connect(lg).connect(o.frequency);
      lfo.start(t);
      lfo.stop(t + dur + 0.05);
    }
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vol, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
    o.connect(g).connect(this.out);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  private kick(t: number) {
    const o = this.ctx.createOscillator();
    o.frequency.setValueAtTime(140, t);
    o.frequency.exponentialRampToValueAtTime(45, t + 0.12);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.5, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.18);
    o.connect(g).connect(this.out);
    o.start(t);
    o.stop(t + 0.2);
  }

  private snare(t: number) {
    const s = this.ctx.createBufferSource();
    s.buffer = this.noise;
    const f = this.ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = 1800;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.22, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.14);
    s.connect(f).connect(g).connect(this.out);
    s.start(t);
    s.stop(t + 0.15);
  }

  private hat(t: number, vol: number) {
    const s = this.ctx.createBufferSource();
    s.buffer = this.noise;
    const f = this.ctx.createBiquadFilter();
    f.type = 'highpass';
    f.frequency.value = 7000;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.04);
    s.connect(f).connect(g).connect(this.out);
    s.start(t, Math.random() * 0.3);
    s.stop(t + 0.05);
  }
}

export const audio = new AudioEngine();
