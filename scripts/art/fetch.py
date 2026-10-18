#!/usr/bin/env python3
"""Downloads finished generations and stores them as raw art.
Usage: fetch.py '<json list of [id, job_id, url]>' [sheet.png]
 - saves art/raw/<id>.webp (q95) and records id -> job_id in art/jobs.json
 - writes a labelled contact sheet (on a mid-green backdrop) for visual QA"""
import json, os, sys, subprocess, tempfile, fcntl
from PIL import Image, ImageDraw
items = json.loads(sys.argv[1])
sheet_path = sys.argv[2] if len(sys.argv) > 2 else None
jobs_file = 'art/jobs.json'
tmp = tempfile.mkdtemp()
thumbs = []
jobs = {}
for id_, job, url in items:
    dst = os.path.join(tmp, id_ + '.png')
    subprocess.run(['curl', '-sS', '-o', dst, url], check=True)
    im = Image.open(dst)
    im.load()
    im.save(f'art/raw/{id_}.webp', 'WEBP', quality=95, method=6)
    jobs[id_] = job
    thumbs.append((id_, im.convert('RGBA')))
# parallel agents may call this at the same time: lock while merging
with open('art/.jobs.lock', 'w') as lock:
    fcntl.flock(lock, fcntl.LOCK_EX)
    allj = json.load(open(jobs_file)) if os.path.exists(jobs_file) else {}
    allj.update(jobs)
    json.dump(dict(sorted(allj.items())), open(jobs_file, 'w'), indent=1)
if sheet_path and thumbs:
    T = 384
    cols = min(4, len(thumbs))
    rows = (len(thumbs) + cols - 1) // cols
    sheet = Image.new('RGBA', (cols * T, rows * (T + 24)), (70, 130, 80, 255))
    d = ImageDraw.Draw(sheet)
    for i, (id_, im) in enumerate(thumbs):
        im = im.copy(); im.thumbnail((T, T))
        x, y = (i % cols) * T, (i // cols) * (T + 24)
        sheet.alpha_composite(im, (x + (T - im.width) // 2, y + 24 + (T - im.height) // 2))
        d.text((x + 6, y + 4), id_, fill=(255, 255, 255, 255))
    sheet.convert('RGB').save(sheet_path)
print('saved', [i[0] for i in items])
