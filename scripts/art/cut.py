#!/usr/bin/env python3
"""Cuts an AI sprite sheet (objects laid out in a rows x cols grid) into separate raw sprites.
Usage: cut.py <sheet_raw_id> <rows> <cols> <id1,id2,...>   (ids row by row; '-' skips a cell)
Connected blobs are assigned to the grid cell containing their centroid, so objects that slightly
overflow their cell are kept whole and stray bits of neighbours are dropped."""
import sys
from collections import deque
import numpy as np
from PIL import Image

src, rows, cols, ids = sys.argv[1], int(sys.argv[2]), int(sys.argv[3]), sys.argv[4].split(',')
im = Image.open(f'art/raw/{src}.webp').convert('RGBA')
W, H = im.size
arr = np.array(im)
alpha = arr[:, :, 3]
S = 4  # label on a downsampled mask for speed
small = alpha[::S, ::S] > 24
h, w = small.shape
labels = np.zeros((h, w), np.int32)
n = 0
for y in range(h):
    for x in range(w):
        if small[y, x] and not labels[y, x]:
            n += 1
            q = deque([(y, x)])
            labels[y, x] = n
            while q:
                cy, cx = q.popleft()
                for ny, nx in ((cy + 1, cx), (cy - 1, cx), (cy, cx + 1), (cy, cx - 1), (cy + 1, cx + 1), (cy - 1, cx - 1), (cy + 1, cx - 1), (cy - 1, cx + 1)):
                    if 0 <= ny < h and 0 <= nx < w and small[ny, nx] and not labels[ny, nx]:
                        labels[ny, nx] = n
                        q.append((ny, nx))
cell_of = {}
for lab in range(1, n + 1):
    ys, xs = np.nonzero(labels == lab)
    if len(ys) < 6:
        continue
    cy, cx = ys.mean() * S, xs.mean() * S
    r, c = min(rows - 1, int(cy / (H / rows))), min(cols - 1, int(cx / (W / cols)))
    cell_of[lab] = r * cols + c
big = np.kron(labels, np.ones((S, S), np.int32))[:H, :W]
for idx, id_ in enumerate(ids):
    if id_ == '-' or idx >= rows * cols:
        continue
    labs = [l for l, c in cell_of.items() if c == idx]
    if not labs:
        print('EMPTY cell', idx, id_)
        continue
    mask = np.isin(big, labs)
    # grow mask a little so soft edges survive
    grown = mask.copy()
    for dy in range(-S, S + 1):
        for dx in range(-S, S + 1):
            grown |= np.roll(np.roll(mask, dy, 0), dx, 1)
    out = arr.copy()
    out[:, :, 3] = np.where(grown, alpha, 0)
    ys, xs = np.nonzero(out[:, :, 3] > 8)
    box = (xs.min(), ys.min(), xs.max() + 1, ys.max() + 1)
    pad = 6
    box = (max(0, box[0] - pad), max(0, box[1] - pad), min(W, box[2] + pad), min(H, box[3] + pad))
    Image.fromarray(out).crop(box).save(f'art/raw/{id_}.webp', 'WEBP', quality=95, method=6)
    print('ok', id_, box[2] - box[0], 'x', box[3] - box[1])
