# Builds art/raw/mx_<map>.webp: the original painting (full res) with real outpainted terrain
# above and below (EXT world units each side), cross-faded into the original.
import sys, json
import numpy as np
from PIL import Image, ImageFilter
SRC, DL, OUT = sys.argv[1], sys.argv[2], sys.argv[3]
EXT_U = 260                # world units above and below (= renderer BLEED)
FADE = 56                  # px cross-fade inside the original
PICKS = json.loads(sys.argv[4])  # {map: {"top": [file, w, x, y], "bottom": [file, w, x, y]}}
for m, p in PICKS.items():
    o = Image.open(f'{SRC}/src_{m}.jpg').convert('RGB')
    OW, OH = o.size
    ext = round(EXT_U * OW / 1600)
    canvas = np.zeros((OH + 2 * ext, OW, 3), np.float32)
    have = np.zeros((OH + 2 * ext,), bool)
    canvas[ext:ext + OH] = np.asarray(o, np.float32)
    have[ext:ext + OH] = True
    for side in ('top', 'bottom'):
        f, w, x, y = p[side]
        e = Image.open(f'{DL}/{f}.png').convert('RGB')
        k = OW / w
        # outpaint scaled to the original's resolution, cropped to the original's columns
        es = e.resize((round(e.size[0] * k), round(e.size[1] * k)), Image.LANCZOS)
        X, Y = round(x * k), round(y * k)
        es = np.asarray(es, np.float32)[:, X:X + OW]
        if es.shape[1] < OW:
            es = np.pad(es, ((0, 0), (0, OW - es.shape[1]), (0, 0)), mode='edge')
        if side == 'top':
            avail = min(ext, Y)                       # real rows above the original
            rows = es[Y - avail:Y + FADE]             # incl. FADE rows overlapping the original
            canvas[ext - avail:ext] = rows[:avail]
            have[ext - avail:ext] = True
            a = np.linspace(1, 0, FADE)[:, None, None]
            canvas[ext:ext + FADE] = rows[avail:avail + FADE] * a + canvas[ext:ext + FADE] * (1 - a)
        else:
            Yb = Y + round(OH * w / OW * k) if False else Y + OH
            avail = min(ext, es.shape[0] - Yb)
            rows = es[Yb - FADE:Yb + avail]
            canvas[ext + OH:ext + OH + avail] = rows[FADE:FADE + avail]
            have[ext + OH:ext + OH + avail] = True
            a = np.linspace(0, 1, FADE)[:, None, None]
            canvas[ext + OH - FADE:ext + OH] = rows[:FADE] * a + canvas[ext + OH - FADE:ext + OH] * (1 - a)
    # rows still missing (extension shorter than EXT_U): mirror the nearest real rows, blurred
    idx = np.nonzero(have)[0]
    t0, b0 = idx.min(), idx.max()
    if t0 > 0:
        mir = canvas[t0:t0 + t0][::-1]
        canvas[:t0] = np.asarray(Image.fromarray(mir.astype(np.uint8)).filter(ImageFilter.GaussianBlur(10)), np.float32)
    if b0 < canvas.shape[0] - 1:
        n = canvas.shape[0] - 1 - b0
        mir = canvas[b0 + 1 - n:b0 + 1][::-1]
        canvas[b0 + 1:] = np.asarray(Image.fromarray(mir.astype(np.uint8)).filter(ImageFilter.GaussianBlur(10)), np.float32)
    img = Image.fromarray(np.clip(canvas, 0, 255).astype(np.uint8))
    img.save(f'{OUT}/mx_{m}.webp', 'WEBP', quality=95, method=6)
    print(m, img.size, 'ext px', ext, 'real top', ext - t0, 'real bottom', b0 - (ext + OH - 1))
