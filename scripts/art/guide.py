#!/usr/bin/env python3
"""Draws a flat-colour layout guide for a map (track + obstacles) used as an image reference
for AI repainting. Usage: guide.py <mapId> <out.png> [width]"""
import json, sys, math
from PIL import Image, ImageDraw

maps = {m['id']: m for m in json.load(open('art/maps.json'))}
m = maps[sys.argv[1]]
W = int(sys.argv[3]) if len(sys.argv) > 3 else 2048
s = W / 1600
H = round(900 * s)
COL = {
    'meadow': ((110, 190, 80), (196, 160, 105)),
    'cave': ((70, 62, 92), (150, 128, 110)),
    'lava': ((70, 50, 50), (120, 100, 90)),
    'river': ((105, 180, 85), (190, 160, 110)),
    'snow': ((228, 238, 248), (170, 190, 215)),
    'candy': ((250, 190, 220), (245, 230, 200)),
}
ground, track = COL[m['theme']]
im = Image.new('RGB', (W, H), ground)
d = ImageDraw.Draw(im)
OB = {
    'tree': (40, 120, 50), 'pine': (30, 100, 60), 'bush': (60, 150, 60), 'rock': (130, 130, 135), 'boulder': (120, 115, 110),
    'pond': (60, 150, 220), 'water': (60, 150, 220), 'ice': (170, 220, 245), 'lava': (255, 110, 30), 'pit': (25, 20, 30),
    'crystal': (170, 90, 255), 'mushroom': (220, 60, 60), 'stump': (120, 80, 50), 'vent': (90, 60, 50), 'snowman': (255, 255, 255),
    'lollipop': (255, 80, 160), 'gumdrop': (120, 220, 120), 'cupcake': (240, 160, 200), 'choco': (110, 70, 40),
}
# water-like areas first
for o in m['obstacles']:
    if o['kind'] in ('pond', 'water', 'ice', 'lava', 'pit'):
        rx, ry = o['r'] * s, o.get('ry', o['r']) * s
        d.ellipse([o['x'] * s - rx, o['y'] * s - ry, o['x'] * s + rx, o['y'] * s + ry], fill=OB[o['kind']])
w = m['pathWidth'] * s
for p in m['paths']:
    pts = [(x * s, y * s) for x, y in p]
    for width, col in ((w + 8 * s, tuple(int(c * 0.7) for c in track)), (w, track)):
        d.line(pts, fill=col, width=round(width), joint='curve')
        for x, y in pts[::3]:
            r = width / 2
            d.ellipse([x - r, y - r, x + r, y + r], fill=col)
for o in m['obstacles']:
    if o['kind'] in ('pond', 'water', 'ice', 'lava', 'pit'):
        continue
    r = o['r'] * s
    d.ellipse([o['x'] * s - r, o['y'] * s - r, o['x'] * s + r, o['y'] * s + r], fill=OB.get(o['kind'], (200, 0, 200)))
im.save(sys.argv[2])
print(sys.argv[2], im.size)
