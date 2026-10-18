#!/usr/bin/env python3
"""Overlays the true track centre-line and edges (red/yellow) on a painted map to check alignment.
Usage: overlay.py <mapId> <painted.png> <out.png>"""
import json, sys
from PIL import Image, ImageDraw
m = {x['id']: x for x in json.load(open('art/maps.json'))}[sys.argv[1]]
im = Image.open(sys.argv[2]).convert('RGB')
W, H = im.size
sx = W / 1600
sy = H / 900
d = ImageDraw.Draw(im)
for p in m['paths']:
    pts = [(x * sx, y * sy) for x, y in p]
    d.line(pts, fill=(255, 0, 0), width=3)
    # edges
    import math
    hw = m['pathWidth'] / 2 * sx
    for side in (-1, 1):
        e = []
        for i in range(1, len(pts) - 1):
            dx, dy = pts[i + 1][0] - pts[i - 1][0], pts[i + 1][1] - pts[i - 1][1]
            l = math.hypot(dx, dy) or 1
            e.append((pts[i][0] - dy / l * hw * side, pts[i][1] + dx / l * hw * side))
        d.line(e, fill=(255, 255, 0), width=2)
for o in m['obstacles']:
    r = o['r'] * sx; ry = o.get('ry', o['r']) * sy
    d.ellipse([o['x'] * sx - r, o['y'] * sy - ry, o['x'] * sx + r, o['y'] * sy + ry], outline=(0, 255, 255), width=3)
im.save(sys.argv[3])
