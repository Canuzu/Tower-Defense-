#!/usr/bin/env python3
"""
Turns raw generated artwork (art/raw/*.webp|png) into game-ready sprites.

For every entry in art/manifest.json:
  - trims fully transparent margins (alpha > 8)
  - optionally removes a flat background colour (for images generated without alpha)
  - scales so the longest side matches the entry's `size`
  - writes public/sprites/<id>.webp (lossy with alpha, q=90)
  - records width/height and the anchor (default: horizontal centre, bottom of the
    visible pixels = the character's feet) into src/assets/sprites.json

Usage: python3 scripts/process_art.py [id ...]
"""
import json, os, sys
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MANIFEST = os.path.join(ROOT, 'art', 'manifest.json')
RAW = os.path.join(ROOT, 'art', 'raw')
OUT = os.path.join(ROOT, 'public', 'sprites')
INDEX = os.path.join(ROOT, 'src', 'assets', 'sprites.json')


def trim(im, thresh=8):
    a = im.getchannel('A').point(lambda v: 255 if v > thresh else 0)
    box = a.getbbox()
    return im.crop(box) if box else im


def raw_path(entry):
    if 'file' in entry:
        return os.path.join(RAW, entry['file'])
    for ext in ('.webp', '.png'):
        p = os.path.join(RAW, entry['id'] + ext)
        if os.path.exists(p):
            return p
    return os.path.join(RAW, entry['id'] + '.webp')


def process(entry):
    src = raw_path(entry)
    im = Image.open(src).convert('RGBA')
    if entry.get('trim', True):
        im = trim(im)
    size = entry.get('size', 256)
    w, h = im.size
    s = size / max(w, h)
    if s < 1 or entry.get('upscale'):
        im = im.resize((max(1, round(w * s)), max(1, round(h * s))), Image.LANCZOS)
    os.makedirs(OUT, exist_ok=True)
    fmt = entry.get('format', 'webp')
    path = os.path.join(OUT, f"{entry['id']}.{fmt}")
    if fmt == 'webp':
        im.save(path, 'WEBP', quality=entry.get('quality', 90), method=6)
    else:
        im.save(path, optimize=True)
    w, h = im.size
    ax, ay = entry.get('anchor', [0.5, 1.0])
    return {'file': f"sprites/{entry['id']}.{fmt}", 'w': w, 'h': h, 'ax': ax, 'ay': ay}


def main():
    manifest = json.load(open(MANIFEST))
    only = set(sys.argv[1:])
    index = json.load(open(INDEX)) if os.path.exists(INDEX) else {}
    for entry in manifest:
        if only and entry['id'] not in only:
            continue
        if not os.path.exists(raw_path(entry)):
            print('missing raw', entry['id'])
            continue
        index[entry['id']] = process(entry)
        print('ok', entry['id'], index[entry['id']]['w'], 'x', index[entry['id']]['h'])
    os.makedirs(os.path.dirname(INDEX), exist_ok=True)
    json.dump(dict(sorted(index.items())), open(INDEX, 'w'), indent=1)


if __name__ == '__main__':
    main()
