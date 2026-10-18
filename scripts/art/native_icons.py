#!/usr/bin/env python3
"""Builds the native/PWA app icons and the splash screen from the painted art:
resources/icon.png (1024, opaque), public/icons/icon-<size>.png, resources/splash.png (2732, logo on night sky)."""
import os
from PIL import Image, ImageDraw, ImageFilter
os.makedirs('public/icons', exist_ok=True)
icon = Image.open('art/raw/ui_appicon.webp').convert('RGB')
icon = icon.resize((1024, 1024), Image.LANCZOS)
icon.save('resources/icon.png')
for s in (512, 192, 180, 167, 152, 120, 96, 64):
    icon.resize((s, s), Image.LANCZOS).save(f'public/icons/icon-{s}.png')
# splash: deep indigo radial gradient + soft stars + logo
S = 2732
bg = Image.new('RGB', (S, S), (23, 16, 54))
grad = Image.new('L', (S, S), 0)
d = ImageDraw.Draw(grad)
for i in range(60, 0, -1):
    r = S * 0.75 * i / 60
    d.ellipse([S / 2 - r, S / 2 - r, S / 2 + r, S / 2 + r], fill=int(255 * (1 - i / 60)))
glow = Image.new('RGB', (S, S), (74, 44, 140))
bg = Image.composite(glow, bg, grad.filter(ImageFilter.GaussianBlur(40)))
import random
random.seed(7)
dd = ImageDraw.Draw(bg)
for _ in range(220):
    x, y, r = random.randrange(S), random.randrange(S), random.choice((2, 3, 3, 4, 6))
    c = random.choice([(255, 246, 224), (255, 220, 120), (180, 200, 255)])
    dd.ellipse([x - r, y - r, x + r, y + r], fill=c)
logo = Image.open('art/raw/ui_logo.webp').convert('RGBA')
box = logo.getchannel('A').getbbox()
logo = logo.crop(box)
w = int(S * 0.42)
logo = logo.resize((w, int(logo.height * w / logo.width)), Image.LANCZOS)
bg = bg.convert('RGBA')
bg.alpha_composite(logo, ((S - logo.width) // 2, (S - logo.height) // 2))
bg.convert('RGB').save('resources/splash.png', optimize=True)
print('icons + splash written')

# ---- native platform assets (same files Capacitor's asset tool would write) ----
import glob
splash = Image.open('resources/splash.png').convert('RGB')
ios = 'ios/App/App/Assets.xcassets'
if os.path.isdir(ios):
    icon.save(f'{ios}/AppIcon.appiconset/AppIcon-512@2x.png')
    for p in glob.glob(f'{ios}/Splash.imageset/*.png'):
        splash.save(p)
res = 'android/app/src/main/res'
if os.path.isdir(res):
    dens = {'mdpi': 1, 'hdpi': 1.5, 'xhdpi': 2, 'xxhdpi': 3, 'xxxhdpi': 4}
    mask = None
    for d, k in dens.items():
        folder = f'{res}/mipmap-{d}'
        if not os.path.isdir(folder):
            continue
        s = round(48 * k)
        icon.resize((s, s), Image.LANCZOS).save(f'{folder}/ic_launcher.png')
        rnd = icon.resize((s, s), Image.LANCZOS).convert('RGBA')
        m = Image.new('L', (s * 4, s * 4), 0)
        ImageDraw.Draw(m).ellipse([0, 0, s * 4 - 1, s * 4 - 1], fill=255)
        rnd.putalpha(m.resize((s, s), Image.LANCZOS))
        rnd.save(f'{folder}/ic_launcher_round.png')
        f = round(108 * k)
        icon.resize((f, f), Image.LANCZOS).save(f'{folder}/ic_launcher_foreground.png')
    # splash drawables: centre-crop the square splash to each existing size
    for p in glob.glob(f'{res}/drawable*/splash.png'):
        w, h = Image.open(p).size
        sc = max(w / S, h / S)
        big = splash.resize((round(S * sc), round(S * sc)), Image.LANCZOS)
        l, t = (big.width - w) // 2, (big.height - h) // 2
        big.crop((l, t, l + w, t + h)).save(p)
    bgx = f'{res}/values/ic_launcher_background.xml'
    if os.path.exists(bgx):
        open(bgx, 'w').write('<?xml version="1.0" encoding="utf-8"?>\n<resources>\n    <color name="ic_launcher_background">#2A1F5C</color>\n</resources>\n')
    print('native assets written')
