#!/usr/bin/env python3
"""
Turns raw generated artwork (art/raw/<id>.webp|png) into game-ready sprites.

The rules live in RULES below (matched by id prefix, first match wins), so every raw file is
processed without a hand-written manifest. art/manifest.json may override single ids:
  [{"id": "e_moab", "size": 512, "anchor": [0.7, 0.5], "body": 0.55}, ...]

For every sprite:
  - trims fully transparent margins
  - cleans faint semi-transparent haze far away from the object (AI "glow fog")
  - scales so the longest side matches `size`
  - writes public/sprites/<id>.webp
  - records into src/assets/sprites.json: file, w, h, ax, ay (anchor 0..1) and
      foot  (towers/heroes: spool platform width / image width, used to scale the sprite)
      body  (enemies: body diameter / max(w, h), used to scale the sprite)

Usage: python3 scripts/process_art.py [--force] [id ...]
Unchanged sprites (same raw file, same rule, same script) are skipped; --force reprocesses everything.
"""
import hashlib, json, os, sys
from concurrent.futures import ProcessPoolExecutor
import numpy as np
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MANIFEST = os.path.join(ROOT, 'art', 'manifest.json')
RAW = os.path.join(ROOT, 'art', 'raw')
OUT = os.path.join(ROOT, 'public', 'sprites')
INDEX = os.path.join(ROOT, 'src', 'assets', 'sprites.json')
# build cache (gitignored via node_modules): raw-file stamp + rule + script hash per id
CACHE = os.path.join(ROOT, 'node_modules', '.cache', 'process_art.json')

BOSS = {'e_moab': 512, 'e_bfb': 560, 'e_zomg': 640, 'e_ddt': 512, 'e_bad': 768}
RULES = [
    ('sheet_', None),  # source sheets for cut.py, not sprites
    ('m_', {'size': 2400, 'trim': False, 'anchor': [0, 0], 'quality': 84, 'clean': False}),
    ('t_', {'size': 320, 'anchor': 'spool'}),
    ('h_', {'size': 360, 'anchor': 'spool'}),
    # bosses that are not star-shaped (comets, moon, ringed planet): anchor + body from the largest
    # inscribed circle of the opaque mask, i.e. the comet head / moon / planet ball without tail or ring
    ('e_moab', {'anchor': 'inscribed'}),
    ('e_ddt', {'anchor': 'inscribed'}),
    ('e_bfb', {'anchor': 'inscribed'}),
    ('e_zomg', {'anchor': 'inscribed'}),
    # crowned star: centre = inscribed circle centre (ignores the crown); body = outer star diameter
    ('e_bad', {'anchor': 'inscribed', 'bodyScale': 1.8}),
    ('e_ceramic', {'size': 200, 'anchor': [0.5, 0.5]}),
    ('e_', {'size': 168, 'anchor': [0.5, 0.5]}),
    ('p_', {'size': 128, 'anchor': [0.5, 0.5]}),
    ('ab_', {'size': 192, 'anchor': [0.5, 0.5]}),
    ('ui_keyart', {'size': 1920, 'trim': False, 'clean': False, 'anchor': [0, 0], 'quality': 82}),
    ('ui_appicon', None),  # native app icon: written to resources/ by scripts/art/native_icons.py
    ('ui_logo', {'size': 900, 'anchor': [0.5, 0.5], 'quality': 90}),
    ('ui_medal', {'size': 192, 'anchor': [0.5, 0.5]}),
    ('ui_', {'size': 160, 'anchor': [0.5, 0.5]}),
]


def rule_for(id_, overrides):
    base = None
    for prefix, r in RULES:
        if id_.startswith(prefix):
            base = r
            break
    if base is None:
        return None
    r = dict(base)
    for k, v in BOSS.items():
        if id_ == k or id_.startswith(k + '_'):
            r['size'] = v
    r.update(overrides.get(id_, {}))
    return r


def raw_path(id_):
    for ext in ('.webp', '.png'):
        p = os.path.join(RAW, id_ + ext)
        if os.path.exists(p):
            return p
    return None


def clean_haze(a):
    """Zero faint alpha (< 60) that is not near solid pixels (> 160)."""
    solid = a > 160
    near = solid.copy()
    for _ in range(3):  # dilate ~12px
        g = near.copy()
        for dy, dx in ((4, 0), (-4, 0), (0, 4), (0, -4)):
            g |= np.roll(np.roll(near, dy, 0), dx, 1)
        near = g
    out = a.copy()
    out[(a < 60) & ~near] = 0
    return out


def spool_anchor(a):
    """Anchor at the centre of the spool platform's top. Walking up from the lowest opaque row, the
    platform outline widens until its full width (bottom ellipse + wall); the first row where it stops
    growing gives the spool width S. The top ellipse centre sits about 0.27*S above the bottom.
    Returns (ax, ay, foot)."""
    H, W = a.shape
    op = a > 128
    rows = np.nonzero(op.any(axis=1))[0]
    bottom = int(rows.max())

    def span(y):
        xs = np.nonzero(op[y])[0]
        return (xs[0], xs[-1] - xs[0] + 1) if len(xs) else (0, 0)

    y = bottom - 3
    while y - 6 > bottom - H * 0.4:
        w0, w1 = span(y)[1], span(y - 6)[1]
        if w0 > W * 0.3 and w1 < w0 * 1.015:
            break
        y -= 3
    left, S = span(y)
    cx = left + S / 2
    ay = (bottom - 0.27 * S) / H
    return cx / W, ay, S / W


def inscribed(a, thresh=150):
    """Largest circle inside the opaque mask: returns (cx, cy, r) in pixels of `a`."""
    H, W = a.shape
    k = 160 / max(H, W)
    sw, sh = max(1, round(W * k)), max(1, round(H * k))
    m = np.array(Image.fromarray(a).resize((sw, sh), Image.BILINEAR)) > thresh
    pad = np.pad(m, 1, constant_values=False)
    near_in = np.zeros_like(pad)
    for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
        near_in |= np.roll(np.roll(pad, dy, 0), dx, 1)
    oy, ox = np.nonzero(~pad & near_in)
    iy, ix = np.nonzero(pad)
    best, bi = -1.0, 0
    for c in range(0, len(iy), 4096):
        d2 = (iy[c:c + 4096, None] - oy[None, :]) ** 2 + (ix[c:c + 4096, None] - ox[None, :]) ** 2
        dm = d2.min(axis=1)
        j = int(dm.argmax())
        if dm[j] > best:
            best, bi = float(dm[j]), c + j
    # pad offset of 1, pixel centres
    cx = (ix[bi] - 1 + 0.5) / k
    cy = (iy[bi] - 1 + 0.5) / k
    return cx, cy, (best ** 0.5 - 0.5) / k


def process(id_, rule):
    src = raw_path(id_)
    im = Image.open(src).convert('RGBA')
    arr = np.array(im)
    if rule.get('clean', True):
        arr[:, :, 3] = clean_haze(arr[:, :, 3])
    im = Image.fromarray(arr)
    if rule.get('trim', True):
        box = im.getchannel('A').point(lambda v: 255 if v > 8 else 0).getbbox()
        if box:
            im = im.crop(box)
    size = rule.get('size', 256)
    w, h = im.size
    s = size / max(w, h)
    if s < 1 or rule.get('upscale'):
        im = im.resize((max(1, round(w * s)), max(1, round(h * s))), Image.LANCZOS)
    os.makedirs(OUT, exist_ok=True)
    path = os.path.join(OUT, f'{id_}.webp')
    im.save(path, 'WEBP', quality=rule.get('quality', 88), method=6)
    w, h = im.size
    info = {'file': f'sprites/{id_}.webp', 'w': w, 'h': h}
    anchor = rule.get('anchor', [0.5, 0.5])
    if anchor == 'spool':
        ax, ay, foot = spool_anchor(np.array(im.getchannel('A')))
        info.update(ax=round(ax, 4), ay=round(ay, 4), foot=round(foot, 4))
    elif anchor == 'inscribed':
        cx, cy, r = inscribed(np.array(im.getchannel('A')))
        info.update(ax=round(cx / w, 4), ay=round(cy / h, 4), body=round(min(1.0, 2 * r / max(w, h) * rule.get('bodyScale', 1)), 4))
    else:
        info.update(ax=anchor[0], ay=anchor[1])
    if 'body' in rule:
        info['body'] = rule['body']
    if 'foot' in rule:
        info['foot'] = rule['foot']
    return info


def _stamp(id_, rule):
    src = raw_path(id_)
    st = os.stat(src)
    h = hashlib.sha1()
    h.update(open(__file__, 'rb').read())
    h.update(json.dumps(rule, sort_keys=True).encode())
    h.update(f'{os.path.basename(src)}|{st.st_size}|{st.st_mtime_ns}'.encode())
    return h.hexdigest()


def _job(args):
    id_, rule = args
    try:
        return id_, process(id_, rule), None
    except Exception as e:  # e.g. a raw file that is still being written; retried on the next run
        return id_, None, e


def main():
    args = sys.argv[1:]
    force = '--force' in args
    only = {a for a in args if not a.startswith('--')}
    overrides = {}
    if os.path.exists(MANIFEST):
        for e in json.load(open(MANIFEST)):
            overrides[e['id']] = {k: v for k, v in e.items() if k != 'id' and not k.startswith('_')}
    index = json.load(open(INDEX)) if os.path.exists(INDEX) else {}
    cache = {}
    if os.path.exists(CACHE):
        try:
            cache = json.load(open(CACHE))
        except Exception:
            cache = {}
    ids = sorted({os.path.splitext(f)[0] for f in os.listdir(RAW) if f.endswith(('.webp', '.png'))})
    todo = []
    stamps = {}
    for id_ in ids:
        if only and id_ not in only:
            continue
        rule = rule_for(id_, overrides)
        if rule is None:
            index.pop(id_, None)  # not a game sprite (e.g. source sheets, the native app icon)
            continue
        stamps[id_] = _stamp(id_, rule)
        out = os.path.join(OUT, f'{id_}.webp')
        if not force and cache.get(id_) == stamps[id_] and id_ in index and os.path.exists(out):
            continue
        todo.append((id_, rule))
    with ProcessPoolExecutor(max_workers=max(1, (os.cpu_count() or 2))) as ex:
        for id_, info, err in ex.map(_job, todo):
            if err is not None:
                print('skip', id_, '(%s)' % err)
                continue
            index[id_] = info
            cache[id_] = stamps[id_]
            i = info
            print('ok', id_, i['w'], 'x', i['h'], 'anchor', i['ax'], i['ay'], ('foot %s' % i['foot']) if 'foot' in i else '', ('body %s' % i['body']) if 'body' in i else '')
    print(f'{len(todo)} processed, {len(stamps) - len(todo)} unchanged')
    # drop index entries whose raw art is gone
    for id_ in list(index):
        if raw_path(id_) is None:
            del index[id_]
            cache.pop(id_, None)
    os.makedirs(os.path.dirname(INDEX), exist_ok=True)
    json.dump(dict(sorted(index.items())), open(INDEX, 'w'), indent=1)
    os.makedirs(os.path.dirname(CACHE), exist_ok=True)
    json.dump(cache, open(CACHE, 'w'))


if __name__ == '__main__':
    main()
