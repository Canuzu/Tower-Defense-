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

Usage: python3 scripts/process_art.py [id ...]
"""
import json, os, sys
import numpy as np
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MANIFEST = os.path.join(ROOT, 'art', 'manifest.json')
RAW = os.path.join(ROOT, 'art', 'raw')
OUT = os.path.join(ROOT, 'public', 'sprites')
INDEX = os.path.join(ROOT, 'src', 'assets', 'sprites.json')

BOSS = {'e_moab': 512, 'e_bfb': 560, 'e_zomg': 640, 'e_ddt': 512, 'e_bad': 768}
RULES = [
    ('sheet_', None),  # source sheets for cut.py, not sprites
    ('m_', {'size': 2400, 'trim': False, 'anchor': [0, 0], 'quality': 84, 'clean': False}),
    ('t_', {'size': 320, 'anchor': 'spool'}),
    ('h_', {'size': 360, 'anchor': 'spool'}),
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
    else:
        info.update(ax=anchor[0], ay=anchor[1])
    if 'body' in rule:
        info['body'] = rule['body']
    if 'foot' in rule:
        info['foot'] = rule['foot']
    return info


def main():
    overrides = {}
    if os.path.exists(MANIFEST):
        for e in json.load(open(MANIFEST)):
            overrides[e['id']] = {k: v for k, v in e.items() if k != 'id'}
    only = set(sys.argv[1:])
    index = json.load(open(INDEX)) if os.path.exists(INDEX) else {}
    ids = sorted({os.path.splitext(f)[0] for f in os.listdir(RAW) if f.endswith(('.webp', '.png'))})
    for id_ in ids:
        if only and id_ not in only:
            continue
        rule = rule_for(id_, overrides)
        if rule is None:
            continue
        index[id_] = process(id_, rule)
        i = index[id_]
        print('ok', id_, i['w'], 'x', i['h'], 'anchor', i['ax'], i['ay'], ('foot %s' % i['foot']) if 'foot' in i else '')
    # drop index entries whose raw art is gone
    for id_ in list(index):
        if raw_path(id_) is None:
            del index[id_]
    os.makedirs(os.path.dirname(INDEX), exist_ok=True)
    json.dump(dict(sorted(index.items())), open(INDEX, 'w'), indent=1)


if __name__ == '__main__':
    main()
