"""Builds the game's sound bank (public/audio + src/audio/sampleFiles.ts) from Kenney's CC0 packs.

The packs are not in the repository. Download them from kenney.nl (Interface Sounds, Impact Sounds,
Casino Audio, RPG Audio, Sci-fi Sounds, Music Jingles), unzip each into <kenney_root>/kenney_<name>/
and run (needs numpy and ffmpeg; the packs are data only, -I keeps Python from importing anything
from the working directory):

    python3 -I scripts/build_sound_bank.py <kenney_root> public/audio src/audio/sampleFiles.ts

Every source file is only decoded with ffmpeg. Each sound is layered / trimmed / tuned below, then
loudness-normalised (K-weighted short-term, -12.5 LUFS for effects, -14 for jingles), peak-limited,
silence-trimmed and encoded twice: AAC-LC .m4a (96 kbit/s mono, 112 kbit/s stereo) for iOS and
Safari, Ogg Vorbis (q4) for browsers without AAC. See src/audio/SOUNDS.md for what plays when.
"""
import json, math, os, subprocess, sys, tempfile
import numpy as np

SR = 44100
ROOT = sys.argv[1]
OUT = sys.argv[2]
TS_OUT = sys.argv[3]

IFS = 'kenney_interface-sounds/Audio/'
IMP = 'kenney_impact-sounds/Audio/'
CAS = 'kenney_casino-audio/Audio/'
RPG = 'kenney_rpg-audio/Audio/'
SCI = 'kenney_sci-fi-sounds/Audio/'
PIZ = 'kenney_music-jingles/Audio/Pizzicato jingles/jingles_PIZZI'
SAX = 'kenney_music-jingles/Audio/Sax jingles/jingles_SAX'
STL = 'kenney_music-jingles/Audio/Steel jingles/jingles_STEEL'
HIT = 'kenney_music-jingles/Audio/Hit jingles/jingles_HIT'

_cache = {}


def load(rel):
    """Decoded stereo float32 (n, 2) at 44.1 kHz."""
    if rel in _cache:
        return _cache[rel].copy()
    path = os.path.join(ROOT, rel if rel.endswith('.ogg') else rel + '.ogg')
    raw = subprocess.run(['ffmpeg', '-v', 'error', '-i', path, '-ac', '2', '-ar', str(SR), '-f', 'f32le', '-'],
                         capture_output=True, check=True).stdout
    x = np.frombuffer(raw, dtype=np.float32).reshape(-1, 2).astype(np.float64)
    _cache[rel] = x
    return x.copy()


# ------------------------------------------------------------------------------------------ dsp

def biquad(x, b, a):
    b0, b1, b2 = b[0] / a[0], b[1] / a[0], b[2] / a[0]
    a1, a2 = a[1] / a[0], a[2] / a[0]
    y = np.zeros_like(x)
    for c in range(x.shape[1]):
        xc = x[:, c]
        yc = y[:, c]
        x1 = x2 = y1 = y2 = 0.0
        for n in range(len(xc)):
            v = b0 * xc[n] + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2
            x2, x1 = x1, xc[n]
            y2, y1 = y1, v
            yc[n] = v
    return y


def _rbj(kind, f0, q=0.707, gain_db=0.0):
    w = 2 * math.pi * f0 / SR
    cw, sw = math.cos(w), math.sin(w)
    al = sw / (2 * q)
    if kind == 'lp':
        return [(1 - cw) / 2, 1 - cw, (1 - cw) / 2], [1 + al, -2 * cw, 1 - al]
    if kind == 'hp':
        return [(1 + cw) / 2, -(1 + cw), (1 + cw) / 2], [1 + al, -2 * cw, 1 - al]
    if kind == 'hs':
        A = 10 ** (gain_db / 40)
        s = 2 * math.sqrt(A) * al
        return ([A * ((A + 1) + (A - 1) * cw + s), -2 * A * ((A - 1) + (A + 1) * cw), A * ((A + 1) + (A - 1) * cw - s)],
                [(A + 1) - (A - 1) * cw + s, 2 * ((A - 1) - (A + 1) * cw), (A + 1) - (A - 1) * cw - s])
    raise ValueError(kind)


def lp(x, f):
    return biquad(x, *_rbj('lp', f))


def hp(x, f):
    return biquad(x, *_rbj('hp', f))


def seg(x, start=0.0, end=None, fout=0.02):
    a = int(start * SR)
    b = len(x) if end is None else min(len(x), int(end * SR))
    y = x[a:b].copy()
    n = min(len(y), int(fout * SR))
    if n > 1 and end is not None:
        y[-n:] *= np.linspace(1, 0, n)[:, None] ** 2
    return y


def peak_at(x):
    return int(np.argmax(np.max(np.abs(x), axis=1)))


def around_peak(x, pre, post, fout=0.04):
    p = peak_at(x) / SR
    return seg(x, max(0, p - pre), p + post, fout)


def gain(x, db):
    return x * (10 ** (db / 20))


def shift(x, semis):
    """Pitch (and speed) change by resampling: a semitone down is ~6 % longer."""
    if semis == 0:
        return x
    r = 2 ** (semis / 12)
    n = int(len(x) / r)
    t = np.arange(n) * r
    i = np.minimum(t.astype(int), len(x) - 2)
    f = (t - i)[:, None]
    return x[i] * (1 - f) + x[i + 1] * f


def mix(*layers):
    """layers: (signal, gain_db, offset_s)"""
    n = max(int(o * SR) + len(s) for s, g, o in layers)
    out = np.zeros((n, 2))
    for s, g, o in layers:
        a = int(o * SR)
        out[a:a + len(s)] += gain(s, g)
    return out


# D major pentatonic: the shards of a star ring in the game's key
PENTA = [2, 4, 6, 9, 11]


def sparkle(dur, n, lo, hi, dec=(0.012, 0.05), seed=1, stereo=0.0, spread=0.3):
    """Tiny crystal shards: short sine pings on D-major-pentatonic notes with a glassy overtone."""
    rng = np.random.default_rng(seed)
    out = np.zeros((int(dur * SR) + int(0.25 * SR), 2))
    notes = [m for m in range(60, 130) if m % 12 in PENTA and lo <= 440 * 2 ** ((m - 69) / 12) <= hi]
    for k in range(n):
        t0 = min(dur * 0.85, rng.exponential(dur * spread))
        f = 440 * 2 ** ((rng.choice(notes) - 69) / 12) * (1 + rng.uniform(-0.004, 0.004))
        d = rng.uniform(*dec)
        amp = rng.uniform(0.35, 1.0) * math.exp(-t0 / (dur * 0.6))
        L = int(min(0.25, d * 7) * SR)
        t = np.arange(L) / SR
        env = np.exp(-t / d) * (1 - np.exp(-t / 0.0006))
        ph = rng.uniform(0, 2 * math.pi)
        v = np.sin(2 * math.pi * f * t + ph) + 0.35 * np.exp(-t / (d * 0.4)) * np.sin(2 * math.pi * f * 2.76 * t)
        v *= env * amp
        pan = rng.uniform(-stereo, stereo)
        a = int(t0 * SR)
        out[a:a + L, 0] += v * math.sqrt(0.5 * (1 - pan))
        out[a:a + L, 1] += v * math.sqrt(0.5 * (1 + pan))
    return out


def crackle(dur, seed=1, f=3000, density=260):
    """Noisy grit of breaking crystal: sparse clicks through a high-pass."""
    rng = np.random.default_rng(seed)
    n = int(dur * SR)
    x = np.zeros(n)
    k = int(density * dur)
    pos = (rng.exponential(dur * 0.3, k) * SR).astype(int)
    pos = pos[pos < n - 40]
    for p in pos:
        L = rng.integers(8, 40)
        x[p:p + L] += rng.uniform(-1, 1, L) * np.exp(-np.arange(L) / (L / 3)) * math.exp(-p / (n * 0.35))
    x = np.stack([x, x], axis=1)
    return hp(x, f)


# --------------------------------------------------------------------------------- loudness / limit

def kweight(x):
    y = biquad(x, *_rbj('hs', 1500, 0.707, 4.0))
    return biquad(y, *_rbj('hp', 60, 0.5))


def loudness(x, win):
    k = kweight(x)
    e = np.mean(k ** 2, axis=1)
    w = max(1, int(win * SR))
    if len(e) <= w:
        return 10 * math.log10(max(1e-12, e.mean()))
    c = np.cumsum(np.concatenate([[0], e]))
    m = (c[w:] - c[:-w]) / w
    return 10 * math.log10(max(1e-12, m.max()))


def limit(x, thr=0.89):
    a = np.max(np.abs(x), axis=1)
    g = np.minimum(1.0, thr / np.maximum(a, 1e-9))
    L = int(0.003 * SR)
    gp = np.concatenate([g, np.ones(L)])
    gm = g.copy()
    for k in range(1, L + 1):
        gm = np.minimum(gm, gp[k:k + len(g)])
    c = 1 - math.exp(-1 / (0.06 * SR))
    y = np.empty_like(gm)
    prev = 1.0
    for n in range(len(gm)):
        prev = min(gm[n], prev + (1 - prev) * c)
        y[n] = prev
    out = x * y[:, None]
    return np.clip(out, -0.97, 0.97), float(20 * math.log10(max(1e-9, y.min())))


def trim_silence(x, thr_db=-56):
    a = np.max(np.abs(x), axis=1)
    thr = a.max() * 10 ** (thr_db / 20)
    idx = np.where(a > thr)[0]
    s = max(0, idx[0] - int(0.002 * SR))
    e = min(len(x), idx[-1] + int(0.01 * SR))
    y = x[s:e].copy()
    n = min(len(y) // 4, int(0.015 * SR))
    if n > 1:
        y[-n:] *= np.linspace(1, 0, n)[:, None]
    m = min(len(y), int(0.0015 * SR))
    y[:m] *= np.linspace(0, 1, m)[:, None]
    return y


# ------------------------------------------------------------------------------------------ recipes

def glass_small(i):
    src = ['impactGlass_light_000', 'impactGlass_light_002', 'impactGlass_light_004'][i]
    body = hp(seg(load(IMP + src), 0, 0.2, 0.06), 260)
    return mix((body, 0, 0), (sparkle(0.12, 7, 3500, 9800, (0.01, 0.035), seed=10 + i), -7, 0.003),
               (crackle(0.05, seed=20 + i, f=4000, density=400), -20, 0.0))


def glass_mid(i):
    src = ['impactGlass_medium_000', 'impactGlass_medium_001', 'impactGlass_medium_003'][i]
    plate = ['impactPlate_light_000', 'impactPlate_light_002', 'impactPlate_light_003'][i]
    body = hp(seg(load(IMP + src), 0, 0.34, 0.14), 180)
    grit = hp(seg(load(IMP + plate), 0, 0.22, 0.12), 1800)
    return mix((body, 0, 0), (grit, -11, 0.002), (sparkle(0.22, 12, 2800, 9400, (0.014, 0.05), seed=30 + i), -6, 0.006),
               (crackle(0.1, seed=40 + i, f=3500, density=320), -17, 0.0))


def glass_big(i):
    src = ['impactGlass_heavy_000', 'impactGlass_heavy_002', 'impactGlass_heavy_003'][i]
    top = ['impactGlass_light_001', 'impactGlass_light_003', 'impactGlass_light_000'][i]
    plate = ['impactPlate_medium_000', 'impactPlate_medium_001', 'impactPlate_medium_003'][i]
    body = hp(seg(load(IMP + src), 0, 0.3, 0.12), 90)
    grit = hp(seg(load(IMP + plate), 0, 0.3, 0.15), 1100)
    return mix((body, 0, 0), (hp(load(IMP + top), 300), -6, 0.012), (grit, -8, 0.0),
               (sparkle(0.32, 18, 2300, 9000, (0.018, 0.075), seed=50 + i), -5, 0.01),
               (crackle(0.16, seed=60 + i, f=3000, density=300), -15, 0.0))


def glass_boss(i):
    src = ['impactGlass_heavy_001', 'impactGlass_heavy_004', 'impactGlass_heavy_000'][i]
    mid = ['impactGlass_medium_002', 'impactGlass_medium_004', 'impactGlass_medium_000'][i]
    plate = ['impactPlate_heavy_000', 'impactPlate_heavy_002', 'impactPlate_heavy_004'][i]
    body = hp(load(IMP + src), 50)
    grit = hp(load(IMP + plate), 700)
    thump = lp(seg(load(SCI + 'lowFrequency_explosion_001'), 0, 0.65, 0.3), 400)
    ring = seg(load(IFS + 'glass_004'), 0, 0.6, 0.25)
    return mix((body, 0, 0), (thump, -5, 0), (grit, -5, 0.0), (hp(seg(load(IMP + mid), 0, 0.4, 0.15), 200), -5, 0.035),
               (sparkle(0.75, 34, 2000, 9400, (0.025, 0.11), seed=70 + i, stereo=0.8, spread=0.35), -3, 0.02),
               (crackle(0.3, seed=80 + i, f=2600, density=260), -13, 0.0), (ring, -12, 0.06))


def zap(i):
    rng = np.random.default_rng(90 + i)
    order = rng.permutation(4)
    parts = []
    t = 0.0
    for k in order:
        parts.append((load(IFS + 'glitch_00%d' % (k + 1)), rng.uniform(-6, 0), t))
        t += rng.uniform(0.018, 0.04)
    hiss = hp(seg(load(SCI + 'laserSmall_001'), 0, 0.12, 0.06), 1200)
    return mix(*parts, (hiss, -12, 0.0), (crackle(0.12, seed=95 + i, f=2500, density=500), -12, 0.0))


R = []  # (name, [variant arrays], stereo, window)


def add(name, variants, stereo=False, win=0.05):
    R.append((name, variants, stereo, win))


def build_recipes():
    add('pop', [glass_small(i) for i in range(3)])
    add('popMid', [glass_mid(i) for i in range(3)])
    add('popBig', [glass_big(i) for i in range(3)])
    add('bigpop', [glass_boss(i) for i in range(3)], stereo=True, win=0.1)
    add('shoot', [hp(around_peak(load(CAS + 'card-slide-%d' % k), 0.03, 0.16, 0.08), 380) for k in (1, 2, 3)])
    add('lob', [mix((load(IMP + 'impactSoft_medium_%03d' % k), -2, 0), (hp(around_peak(load(CAS + 'card-shove-1'), 0.05, 0.12, 0.06), 500), -9, 0))
                for k in (0, 2)])
    add('bomb', [mix((seg(load(SCI + 'explosionCrunch_%03d' % c), 0, 0.55, 0.32), 0, 0), (load(IMP + 'impactPunch_heavy_%03d' % p), -1, 0),
                     (lp(seg(load(SCI + 'lowFrequency_explosion_001'), 0, 0.5, 0.25), 500), -8, 0))
                 for c, p in ((0, 0), (2, 1), (3, 2))], win=0.1)
    add('freeze', [mix((seg(load(IFS + 'glass_004'), 0, 0.5, 0.2), 0, 0), (hp(load(IMP + 'footstep_snow_%03d' % k), 2500), -5, 0),
                       (sparkle(0.26, 10, 4000, 10000, (0.012, 0.05), seed=100 + k, stereo=0.0), -9, 0.01)) for k in (0, 1)])
    add('zap', [zap(i) for i in range(3)])
    add('snipe', [mix((hp(around_peak(load(RPG + s), 0.01, 0.22, 0.1), 800), 0, 0), (load(IMP + 'impactGeneric_light_000'), -5, 0.0))
                  for s in ('knifeSlice', 'knifeSlice2')])
    add('magic', [mix((load(IFS + 'maximize_009'), 0, 0), (sparkle(0.3, 10, 3000, 9000, (0.015, 0.06), seed=110), -7, 0.05)),
                  mix((lp(load(IFS + 'maximize_001'), 7000), -2, 0), (sparkle(0.3, 10, 3000, 9000, (0.015, 0.06), seed=111), -7, 0.05))])
    add('tongue', [seg(load(SCI + 'slime_000'), 0, 0.32, 0.12)])
    add('clank', [load(IMP + 'impactMetal_light_%03d' % k) for k in (1, 2, 4)])
    add('cash', [load(CAS + 'chips-stack-1'), load(CAS + 'chips-collide-1'), load(CAS + 'chips-collide-3')])
    add('acorn', [load(IMP + 'impactWood_light_%03d' % k) for k in (0, 2, 4)])
    add('place', [mix((load(IMP + 'impactWood_medium_%03d' % w), 0, 0), (load(IMP + 'impactSoft_medium_%03d' % s), -3, 0)) for w, s in ((0, 1), (2, 3))])
    add('upgrade', [mix((load(IFS + 'confirmation_001'), 0, 0), (sparkle(0.35, 12, 3000, 9000, (0.015, 0.06), seed=120, stereo=0.0), -9, 0.14))], win=0.1)
    add('sell', [seg(load(RPG + 'handleCoins'), 0, 0.6, 0.25)], win=0.1)
    add('leak', [mix((load(IMP + 'impactPunch_medium_%03d' % k), 0, 0), (load(IFS + 'bong_001'), -6, 0.0)) for k in (0, 1)])
    # jingles (stereo, tuned to the music's D)
    add('roundStart', [shift(load(PIZ + '16'), -1)], stereo=True, win=0.3)
    add('roundEnd', [load(PIZ + '10')], stereo=True, win=0.3)
    add('boss', [mix((load(PIZ + '03'), 0, 0), (load(HIT + '03'), -3, 0), (lp(seg(load(SCI + 'lowFrequency_explosion_000'), 0, 1.2, 0.5), 300), -8, 0))],
        stereo=True, win=0.3)
    add('bossDie', [shift(mix((load(HIT + '00'), 0, 0), (load(SAX + '00'), -2, 0), (load(STL + '00'), -6, 0)), -1)], stereo=True, win=0.3)
    add('ability', [mix((lp(load(IFS + 'maximize_005'), 9000), 0, 0), (load(HIT + '16'), -6, 0.02))], win=0.1)
    add('frenzy', [shift(mix((load(SAX + '16'), 0, 0), (load(HIT + '16'), -3, 0), (lp(load(IFS + 'open_004'), 8000), -7, 0)), -1)], stereo=True, win=0.3)
    add('levelup', [mix((load(STL + '02'), 0, 0), (load(PIZ + '02'), -8, 0))], stereo=True, win=0.3)
    add('victory', [mix((load(SAX + '10'), 0, 0), (load(PIZ + '10'), -4, 0), (load(STL + '10'), -6, 0), (load(HIT + '10'), -7, 0))], stereo=True, win=0.3)
    add('defeat', [mix((load(SAX + '07'), 0, 0), (load(PIZ + '07'), -10, 0))], stereo=True, win=0.3)
    # UI
    add('error', [lp(load(IFS + 'question_002'), 5000)], win=0.1)
    add('tap', [load(IFS + 'drop_002'), load(IFS + 'drop_003')])
    add('open', [lp(load(IFS + 'open_002'), 6000)], win=0.1)
    add('close', [lp(load(IFS + 'close_002'), 6000)], win=0.1)
    add('tab', [load(IFS + 'toggle_001'), load(IFS + 'toggle_002')])
    add('locked', [mix((load(RPG + 'metalLatch'), 0, 0), (load(IFS + 'question_004'), -7, 0.05))], win=0.1)
    add('start', [mix((load(IFS + 'confirmation_003'), 0, 0), (lp(load(IFS + 'open_001'), 6000), -9, 0))], win=0.1)
    add('transition', [hp(load(RPG + 'cloth2'), 250)], win=0.1)
    add('coin', [load(CAS + 'chip-lay-1'), load(CAS + 'chips-collide-4')])
    add('xpTick', [load(IFS + 'pluck_001')])
    add('medal', [mix((load(IMP + 'impactMetal_light_000'), 0, 0), (seg(load(IFS + 'glass_004'), 0, 0.6, 0.25), -6, 0.02),
                      (sparkle(0.5, 16, 2600, 9400, (0.02, 0.08), seed=130, stereo=0.7), -6, 0.03))], stereo=True, win=0.1)
    add('reward', [mix((shift(load(STL + '16'), -1), 0, 0), (sparkle(0.6, 16, 2600, 9400, (0.02, 0.08), seed=140, stereo=0.7), -9, 0.05))],
        stereo=True, win=0.3)
    add('unlock', [mix((load(STL + '04'), 0, 0), (seg(load(IFS + 'glass_004'), 0, 0.6, 0.25), -10, 0.0))], stereo=True, win=0.3)
    add('ready', [load(PIZ + '04')], stereo=True, win=0.3)


# ------------------------------------------------------------------------------------------ export

def write_wav(path, x):
    pcm = (np.clip(x, -1, 1) * 32767).astype('<i2')
    ch = x.shape[1]
    import struct
    with open(path, 'wb') as f:
        data = pcm.tobytes()
        f.write(b'RIFF' + struct.pack('<I', 36 + len(data)) + b'WAVEfmt ' + struct.pack('<IHHIIHH', 16, 1, ch, SR, SR * ch * 2, ch * 2, 16))
        f.write(b'data' + struct.pack('<I', len(data)) + data)


def encode(wav, base, stereo):
    br = '112k' if stereo else '96k'
    subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', wav, '-c:a', 'aac', '-b:a', br, '-movflags', '+faststart', base + '.m4a'], check=True)
    subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', wav, '-c:a', 'libvorbis', '-q:a', '4', base + '.ogg'], check=True)


def main():
    build_recipes()
    os.makedirs(OUT, exist_ok=True)
    tmp = tempfile.mkdtemp()
    table = {}
    report = []
    for name, variants, stereo, win in R:
        durs = []
        for v, x in enumerate(variants):
            if not stereo:
                m = x.mean(axis=1, keepdims=True)
                x = np.concatenate([m, m], axis=1)
            x = trim_silence(x)
            target = -14.0 if win >= 0.3 else -12.5
            l = loudness(x, win)
            x = gain(x, target - l)
            x, red = limit(x)
            if red < -6:
                x = gain(x, -(-6 - red) * 0.5)
            out = x if stereo else x[:, :1]
            base = os.path.join(OUT, '%s_%d' % (name, v))
            wav = os.path.join(tmp, '%s_%d.wav' % (name, v))
            write_wav(wav, out)
            encode(wav, base, stereo)
            durs.append(round(len(x) / SR, 3))
            report.append('%-11s v%d %5.2fs loud %6.1f -> %5.1f  limiter %5.1f dB  %s' % (name, v, len(x) / SR, l, target, red, 'stereo' if stereo else 'mono'))
        table[name] = durs
    with open(TS_OUT, 'w') as f:
        f.write('// Generated by the sound-bank build (see public/audio/LICENSES.md). Do not edit by hand.\n')
        f.write('/** Sample variants per sound: their durations in seconds (files public/audio/<name>_<i>.m4a|ogg). */\n')
        f.write('export const SAMPLE_FILES: Record<string, readonly number[]> = {\n')
        for name, durs in table.items():
            f.write('  %s: [%s],\n' % (name, ', '.join('%g' % d for d in durs)))
        f.write('};\n')
    print('\n'.join(report))


main()
