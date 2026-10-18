#!/usr/bin/env python3
"""Automatic sprite sanity checks for raw art. Usage: check.py id [id ...]
Prints per id: size, whether the 3px border is fully transparent (=not cropped), the opaque bounding
box as a fraction of the canvas, and the share of faint semi-transparent haze pixels."""
import sys
from PIL import Image
for id_ in sys.argv[1:]:
    im = Image.open(f'art/raw/{id_}.webp').convert('RGBA')
    a = im.getchannel('A')
    W, H = im.size
    px = a.load()
    border = max(max(px[x, y] for x in range(W) for y in (0, 1, 2, H - 3, H - 2, H - 1)),
                 max(px[x, y] for y in range(H) for x in (0, 1, 2, W - 3, W - 2, W - 1)))
    box = a.point(lambda v: 255 if v > 128 else 0).getbbox() or (0, 0, 0, 0)
    hist = a.histogram()
    haze = sum(hist[10:120]) / (W * H)
    solid = sum(hist[200:]) / (W * H)
    ok = border < 20 and haze < 0.08
    print(f"{id_}: {W}x{H} border_alpha={border} {'OK' if border < 20 else 'TOUCHES-EDGE'} "
          f"bbox=({box[0]/W:.2f},{box[1]/H:.2f})-({box[2]/W:.2f},{box[3]/H:.2f}) solid={solid:.2f} haze={haze:.3f} {'PASS' if ok else 'CHECK'}")
