// ---------------------------------------------------------------------------------------------
// Generative music
//
// Warm, small instruments instead of chiptune squares: a soft detuned pad, marimba plucks, a round
// bass, brushed percussion, a whistled lead (battle) and a bell (menu), all in D major and through
// one shared reverb (a ConvolverNode with a generated impulse). The menu has a calm theme; the
// battle track is three layers that cross-fade with the game's intensity (0 build phase, 1 round,
// 2 boss) and frenzy. Notes are scheduled ~0.2 s ahead from a 50 ms timer; a layer that is silent
// schedules nothing, so the cost follows what is heard.
// ---------------------------------------------------------------------------------------------

export type Track = 'menu' | 'game';

const NOTE = (n: number) => 440 * Math.pow(2, (n - 69) / 12);

interface Chord {
  /** bass root (MIDI) */
  root: number;
  /** pad voicing */
  pad: number[];
  /** arpeggio tones, low to high */
  arp: number[];
}

const D: Chord = { root: 38, pad: [57, 61, 64, 66], arp: [69, 73, 74, 78, 81] };
const Bm: Chord = { root: 47, pad: [57, 61, 62, 66], arp: [66, 69, 71, 74, 78] };
const G: Chord = { root: 43, pad: [57, 59, 62, 66], arp: [67, 71, 74, 78, 79] };
const A: Chord = { root: 45, pad: [55, 59, 62, 64], arp: [69, 71, 74, 76, 79] };
const Fsm: Chord = { root: 42, pad: [57, 61, 64, 66], arp: [66, 69, 73, 76, 78] };
const Em: Chord = { root: 40, pad: [55, 59, 62, 66], arp: [64, 67, 71, 74, 78] };

const BATTLE = [D, Bm, G, A, D, Fsm, G, A];
const MENU = [G, Fsm, Em, A, D, Bm, Em, A];

/** [step within 2 bars, semitones above D5, length in steps] */
type Phrase = [number, number, number][];
const WHISTLE: Phrase[] = [
  [[0, 7, 2], [2, 9, 2], [4, 7, 2], [6, 4, 4], [12, 2, 2], [14, 4, 2], [16, 0, 6], [24, 2, 2], [26, 4, 2], [28, 7, 4]],
  [[0, 12, 3], [3, 9, 1], [4, 7, 4], [8, 9, 2], [10, 7, 2], [12, 4, 4], [16, 2, 3], [19, 4, 1], [20, 7, 4], [24, 4, 2], [26, 2, 2], [28, 0, 4]],
  [[0, 4, 2], [2, 7, 2], [4, 9, 2], [6, 12, 6], [14, 9, 2], [16, 7, 4], [20, 4, 2], [22, 7, 2], [24, 9, 8]],
  [[0, 14, 2], [2, 12, 2], [4, 9, 4], [8, 7, 2], [10, 9, 2], [12, 12, 4], [16, 9, 4], [20, 7, 4], [24, 4, 4], [28, 2, 4]],
];
const BELL: Phrase[] = [
  [[0, 9, 4], [4, 7, 4], [8, 4, 8], [16, 2, 4], [20, 4, 4], [24, 7, 8]],
  [[0, 7, 6], [6, 4, 2], [8, 2, 8], [16, 4, 4], [20, 2, 4], [24, -3, 8]],
  [[0, 12, 4], [4, 9, 4], [8, 7, 8], [16, 9, 4], [20, 7, 4], [24, 4, 8]],
  [[0, 2, 4], [4, 4, 4], [8, 7, 4], [12, 9, 4], [16, 7, 12]],
];

// marimba patterns: index into the chord's arp tones, -1 rest (16ths)
const GROOVE = [
  [0, -1, -1, 2, -1, 1, -1, 3, -1, 2, -1, -1, 4, -1, 3, -1],
  [0, -1, 2, -1, -1, 3, -1, 2, 1, -1, -1, 4, -1, 3, 2, -1],
];
const MENU_ARP = [0, -1, -1, -1, 2, -1, -1, 1, 3, -1, -1, -1, 2, -1, 4, -1];

/** reverb send per layer */
const SEND = [0.55, 0.3, 0.38];

export class Music {
  track: Track = 'menu';
  intensity = 0;
  frenzy = false;
  playing = false;
  private lowPowerOn = false;
  private timer: number | null = null;
  private step = 0;
  private nextTime = 0;
  private out: GainNode;
  private layers: GainNode[] = [];
  private sends: GainNode[] = [];
  private verb: ConvolverNode;
  private verbOut: GainNode;
  private targets = [0, 0, 0];
  private levels = [0, 0, 0];
  private lastTick = 0;
  private noise: AudioBuffer;
  private loop = 0;

  constructor(
    private ctx: BaseAudioContext,
    bus: AudioNode,
  ) {
    this.out = ctx.createGain();
    this.out.gain.value = 1;
    this.out.connect(bus);
    this.verb = ctx.createConvolver();
    this.verb.buffer = makeImpulse(ctx, 2.0, 0.5);
    this.verbOut = ctx.createGain();
    this.verbOut.gain.value = 0.9;
    this.verb.connect(this.verbOut).connect(this.out);
    for (let i = 0; i < 3; i++) {
      const g = ctx.createGain();
      g.gain.value = 0;
      g.connect(this.out);
      const s = ctx.createGain();
      s.gain.value = SEND[i];
      g.connect(s).connect(this.verb);
      this.layers.push(g);
      this.sends.push(s);
    }
    const len = ctx.sampleRate;
    this.noise = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  }

  /** Battery saver: one oscillator per note, no overtone partials, no reverb. */
  set lowPower(on: boolean) {
    if (on === this.lowPowerOn) return;
    this.lowPowerOn = on;
    for (const s of this.sends) {
      if (on) s.disconnect();
      else s.connect(this.verb);
    }
  }
  get lowPower() {
    return this.lowPowerOn;
  }

  start(track: Track) {
    if (this.playing && this.track === track) return;
    const switching = this.playing && this.track !== track;
    this.track = track;
    this.step = 0;
    this.loop = 0;
    this.nextTime = this.ctx.currentTime + (switching ? 0.35 : 0.1);
    this.playing = true;
    if (switching) {
      // the old track's layers fade before the new one comes in
      const now = this.ctx.currentTime;
      for (let i = 0; i < 3; i++) {
        this.layers[i].gain.cancelScheduledValues(now);
        this.layers[i].gain.setTargetAtTime(0, now, 0.12);
        this.levels[i] = 0;
        this.targets[i] = -1;
      }
    }
    if (this.timer === null && typeof window !== 'undefined') this.timer = window.setInterval(() => this.schedule(), 50);
  }

  stop() {
    this.playing = false;
    if (this.timer !== null) {
      clearInterval(this.timer);
      this.timer = null;
    }
    const now = this.ctx.currentTime;
    for (let i = 0; i < 3; i++) {
      this.layers[i].gain.cancelScheduledValues(now);
      this.layers[i].gain.setTargetAtTime(0, now, 0.25);
      this.levels[i] = 0;
      this.targets[i] = -1;
    }
  }

  /** Schedules the next `seconds` right away (tests and offline renders; the timer does this live). */
  prime(seconds: number) {
    this.schedule(seconds);
  }

  private get bpm() {
    return this.track === 'menu' ? 80 : 100;
  }

  private layerTargets(): [number, number, number] {
    if (this.track === 'menu') return [1, 0.9, 0.75];
    if (this.frenzy) return [1, 1, 1];
    if (this.intensity >= 2) return [1, 1, 0.85];
    if (this.intensity >= 1) return [1, 1, 0];
    return [0.9, 0.22, 0];
  }

  private schedule(ahead = 0.2) {
    if (!this.playing) return;
    const ctx = this.ctx;
    const now = ctx.currentTime;
    // the layers cross-fade towards what the game asks for (time constant 0.6 s)
    const tg = this.layerTargets();
    const dt = Math.max(0, now - this.lastTick);
    this.lastTick = now;
    const k = 1 - Math.exp(-dt / 0.6);
    for (let i = 0; i < 3; i++) {
      if (tg[i] !== this.targets[i]) {
        this.targets[i] = tg[i];
        this.layers[i].gain.cancelScheduledValues(now);
        this.layers[i].gain.setTargetAtTime(tg[i], now, 0.6);
      }
      this.levels[i] += (tg[i] - this.levels[i]) * k;
    }
    // after a stall (tab in the background, a long frame) pick up from now instead of catching up
    if (this.nextTime < now - 0.1) this.nextTime = now + 0.05;
    const spb = 60 / this.bpm / 4;
    while (this.nextTime < now + ahead) {
      this.playStep(this.step, this.nextTime, spb);
      this.nextTime += spb;
      this.step++;
    }
  }

  private on(i: number) {
    return this.targets[i] > 0.01 || this.levels[i] > 0.02;
  }

  private playStep(step: number, t: number, spb: number) {
    const s = step % 16;
    const bar = Math.floor(step / 16);
    if (s === 0 && bar % 8 === 0 && bar > 0) this.loop++;
    // a light swing on the off 16ths
    const ts = s % 2 === 1 ? t + spb * 0.12 : t;
    if (this.track === 'menu') this.menuStep(s, bar, t, ts, spb);
    else this.battleStep(s, bar, t, ts, spb);
  }

  private battleStep(s: number, bar: number, t: number, ts: number, spb: number) {
    const c = BATTLE[bar % BATTLE.length];
    const [L0, L1, L2] = this.layers;
    const bright = this.frenzy ? 2400 : this.intensity >= 2 ? 1700 : this.intensity >= 1 ? 1250 : 900;
    // L0: pad, bass, a soft shaker and a couple of marimba notes (the build phase)
    if (this.on(0)) {
      if (s === 0) this.pad(t, c.pad, spb * 16, 0.034, bright, L0);
      if (s === 0) this.bass(t, c.root, spb * 8, 0.24, L0);
      if (s === 8) this.bass(t, c.root, spb * 6, 0.18, L0);
      if (s % 4 === 2) this.shaker(ts, 0.032, L0);
      if (s === 0 || s === 10) this.marimba(t, c.arp[s === 0 ? 1 : 3], 0.09, L0);
    }
    // L1: the groove (kick, clap, marimba ostinato, bass pickups)
    if (this.on(1)) {
      const pat = GROOVE[(bar >> 1) % 2];
      const i = pat[s];
      if (i >= 0) this.marimba(ts, c.arp[i], s % 4 === 0 ? 0.15 : 0.11, L1);
      if (s === 0 || s === 8) this.kick(t, 0.42, L1);
      if (s === 10 && bar % 2 === 1) this.kick(t, 0.22, L1);
      if (s === 4 || s === 12) this.clap(t, 0.13, L1);
      if (s % 2 === 0 && s % 4 !== 2) this.shaker(t, 0.018, L1);
      if (s === 6) this.bass(t, c.root, spb * 2, 0.16, L1);
      if (s === 14) this.bass(t, c.root + 7, spb * 2, 0.14, L1);
    }
    // L2: boss / frenzy: the whistled tune, 16th hats, toms into the loop and a pumping octave
    if (this.on(2)) {
      const ph = WHISTLE[(bar >> 1) % WHISTLE.length];
      const local = (bar % 2) * 16 + s;
      for (const [st, n, len] of ph) if (st === local) this.whistle(t, 74 + n, spb * len, 0.075, L2);
      if (s % 2 === 1) this.shaker(ts, 0.022, L2);
      if (s === 3 || s === 11) this.bass(ts, c.root + 12, spb * 1.5, 0.1, L2);
      if (s === 7 || s === 15) this.tok(ts, 0.06, L2);
      if (bar % 8 === 7 && s >= 12) this.tom(t, [50, 47, 45, 43][s - 12], 0.18, L2);
      if (this.frenzy && s % 4 === 2) this.marimba(ts, c.arp[4] + 12, 0.06, L2);
    }
  }

  private menuStep(s: number, bar: number, t: number, ts: number, spb: number) {
    const c = MENU[bar % MENU.length];
    const [L0, L1, L2] = this.layers;
    if (this.on(0)) {
      if (s === 0) this.pad(t, c.pad, spb * 16, 0.032, 850, L0);
      if (s === 0) this.bass(t, c.root, spb * 12, 0.2, L0);
      if (s % 4 === 2) this.shaker(ts, 0.02, L0);
    }
    if (this.on(1)) {
      const i = MENU_ARP[s];
      // a few notes drop out on each pass, so the loop breathes
      if (i >= 0 && (s % 8 === 0 || Math.random() < 0.8)) this.marimba(ts, c.arp[i], s % 8 === 0 ? 0.12 : 0.085, L1);
      if (s === 12 && bar % 2 === 1) this.tok(t, 0.04, L1);
    }
    if (this.on(2)) {
      // the bell sings on alternate loops, first half and second half switching
      const ph = BELL[(bar >> 1) % BELL.length];
      const local = (bar % 2) * 16 + s;
      if ((this.loop + (bar >> 2)) % 2 === 0) for (const [st, n, len] of ph) if (st === local && Math.random() < 0.9) this.bell(t, 74 + n, spb * len, 0.05, L2);
    }
  }

  // ----------------------------------------------------------------------------------- voices

  private pad(t: number, notes: number[], dur: number, vol: number, cutoff: number, dest: AudioNode) {
    const ctx = this.ctx;
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.Q.value = 0.5;
    f.frequency.setValueAtTime(cutoff * 0.7, t);
    f.frequency.linearRampToValueAtTime(cutoff, t + dur * 0.5);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.7);
    g.gain.setTargetAtTime(vol * 0.7, t + 0.7, 0.9);
    g.gain.setTargetAtTime(0.0001, t + dur, 0.45);
    f.connect(g).connect(dest);
    const end = t + dur + 2.2;
    for (const n of notes) {
      const fr = NOTE(n);
      if (this.lowPowerOn) {
        const o = ctx.createOscillator();
        o.type = 'triangle';
        o.frequency.value = fr;
        o.connect(f);
        o.start(t);
        o.stop(end);
        continue;
      }
      for (const det of [-7, 7]) {
        const o = ctx.createOscillator();
        o.type = 'sawtooth';
        o.frequency.value = fr;
        o.detune.value = det;
        o.connect(f);
        o.start(t);
        o.stop(end);
      }
    }
  }

  /** Marimba: a sine with a short, bright 4th partial (the mallet). */
  private marimba(t: number, n: number, vol: number, dest: AudioNode) {
    const ctx = this.ctx;
    const fr = NOTE(n);
    const o = ctx.createOscillator();
    o.frequency.value = fr;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.75);
    o.connect(g).connect(dest);
    o.start(t);
    o.stop(t + 0.8);
    if (this.lowPowerOn) return;
    const o2 = ctx.createOscillator();
    o2.frequency.value = fr * 3.93;
    const g2 = ctx.createGain();
    g2.gain.setValueAtTime(vol * 0.28, t);
    g2.gain.exponentialRampToValueAtTime(0.0001, t + 0.07);
    o2.connect(g2).connect(dest);
    o2.start(t);
    o2.stop(t + 0.09);
  }

  /** Round bass: a triangle and a sine an octave down through a low-pass. */
  private bass(t: number, n: number, len: number, vol: number, dest: AudioNode) {
    const ctx = this.ctx;
    const fr = NOTE(n);
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 650;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.012);
    g.gain.setTargetAtTime(vol * 0.6, t + 0.05, 0.25);
    g.gain.setTargetAtTime(0.0001, t + len, 0.06);
    f.connect(g).connect(dest);
    const o = ctx.createOscillator();
    o.type = 'triangle';
    o.frequency.value = fr;
    o.connect(f);
    o.start(t);
    o.stop(t + len + 0.4);
    if (this.lowPowerOn) return;
    const sub = ctx.createOscillator();
    sub.frequency.value = fr / 2;
    sub.connect(f);
    sub.start(t);
    sub.stop(t + len + 0.4);
  }

  /** Whistled lead: a sine that slides into the note, vibrato once it is held. */
  private whistle(t: number, n: number, len: number, vol: number, dest: AudioNode) {
    const ctx = this.ctx;
    const fr = NOTE(n);
    const o = ctx.createOscillator();
    o.frequency.setValueAtTime(fr * 0.97, t);
    o.frequency.exponentialRampToValueAtTime(fr, t + 0.05);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.035);
    g.gain.setTargetAtTime(vol * 0.8, t + 0.08, 0.2);
    g.gain.setTargetAtTime(0.0001, t + Math.max(0.06, len - 0.04), 0.05);
    o.connect(g).connect(dest);
    const end = t + len + 0.35;
    o.start(t);
    o.stop(end);
    if (this.lowPowerOn || len < 0.25) return;
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 5.4;
    const lg = ctx.createGain();
    lg.gain.setValueAtTime(0, t);
    lg.gain.linearRampToValueAtTime(fr * 0.007, t + 0.25);
    lfo.connect(lg).connect(o.frequency);
    lfo.start(t);
    lfo.stop(end);
  }

  /** Soft FM bell for the menu theme. */
  private bell(t: number, n: number, len: number, vol: number, dest: AudioNode) {
    const ctx = this.ctx;
    const fr = NOTE(n);
    const o = ctx.createOscillator();
    o.frequency.value = fr;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, t + Math.max(1.2, len + 0.6));
    o.connect(g).connect(dest);
    const end = t + Math.max(1.25, len + 0.65);
    o.start(t);
    o.stop(end);
    if (this.lowPowerOn) return;
    const m = ctx.createOscillator();
    m.frequency.value = fr * 3.5;
    const mg = ctx.createGain();
    mg.gain.setValueAtTime(fr * 1.3, t);
    mg.gain.exponentialRampToValueAtTime(fr * 0.05, t + 0.5);
    m.connect(mg).connect(o.frequency);
    m.start(t);
    m.stop(end);
  }

  private kick(t: number, vol: number, dest: AudioNode) {
    const ctx = this.ctx;
    const o = ctx.createOscillator();
    o.frequency.setValueAtTime(120, t);
    o.frequency.exponentialRampToValueAtTime(46, t + 0.13);
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.3);
    o.connect(g).connect(dest);
    o.start(t);
    o.stop(t + 0.32);
  }

  private noiseHit(t: number, type: BiquadFilterType, freq: number, q: number, vol: number, attack: number, decay: number, dest: AudioNode) {
    const ctx = this.ctx;
    const s = ctx.createBufferSource();
    s.buffer = this.noise;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
    s.connect(f).connect(g).connect(dest);
    s.start(t, Math.random() * 0.8);
    s.stop(t + attack + decay + 0.02);
  }

  /** Brushed clap: band-passed noise with a soft body. */
  private clap(t: number, vol: number, dest: AudioNode) {
    this.noiseHit(t, 'bandpass', 1500, 0.8, vol, 0.003, 0.16, dest);
  }

  private shaker(t: number, vol: number, dest: AudioNode) {
    this.noiseHit(t, 'highpass', 6500, 0.7, vol, 0.008, 0.06, dest);
  }

  /** Woodblock "tok". */
  private tok(t: number, vol: number, dest: AudioNode) {
    const ctx = this.ctx;
    const o = ctx.createOscillator();
    o.frequency.value = 1650;
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.045);
    o.connect(g).connect(dest);
    o.start(t);
    o.stop(t + 0.05);
  }

  private tom(t: number, n: number, vol: number, dest: AudioNode) {
    const ctx = this.ctx;
    const fr = NOTE(n);
    const o = ctx.createOscillator();
    o.frequency.setValueAtTime(fr * 1.6, t);
    o.frequency.exponentialRampToValueAtTime(fr, t + 0.06);
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.28);
    o.connect(g).connect(dest);
    o.start(t);
    o.stop(t + 0.3);
  }
}

/** Stereo room: pre-delay, a few early reflections and a tail that darkens as it decays. */
function makeImpulse(ctx: BaseAudioContext, dur: number, decay: number): AudioBuffer {
  const sr = ctx.sampleRate;
  const n = Math.floor(sr * dur);
  const ir = ctx.createBuffer(2, n, sr);
  const pre = Math.floor(0.012 * sr);
  for (let ch = 0; ch < 2; ch++) {
    const d = ir.getChannelData(ch);
    let lp = 0;
    for (let i = pre; i < n; i++) {
      const t = i / sr;
      const k = Math.min(0.93, 0.2 + t * 0.55);
      lp += (1 - k) * (Math.random() * 2 - 1 - lp);
      d[i] = lp * Math.exp(-t / decay);
    }
    const taps: [number, number][] = [
      [0.013, 0.45],
      [0.021, 0.3],
      [0.034, 0.26],
      [0.047, 0.18],
      [0.061, 0.12],
    ];
    for (const [s, a] of taps) {
      const i = Math.floor((s + ch * 0.0023) * sr);
      if (i < n) d[i] += a * (ch ? -1 : 1);
    }
  }
  return ir;
}
