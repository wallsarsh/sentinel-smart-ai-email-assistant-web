"""Draws the app icons (a shield on the brand colour) into public/icons. Run: python3 tools/make-icons.py"""
import os
from PIL import Image, ImageDraw

OUT = os.path.join(os.path.dirname(__file__), '..', 'public', 'icons')
BRAND = (57, 73, 171, 255)  # --primary
WHITE = (255, 255, 255, 255)
SCALE = 4  # draw large, then downsample for smooth edges


def shield(size, pad):
    """Shield outline points inside a square of [size], keeping [pad] (fraction) free on every side."""
    a = size * pad
    w = size - 2 * a
    pts = [(0.5, 0.0), (1.0, 0.16), (1.0, 0.52), (0.5, 1.0), (0.0, 0.52), (0.0, 0.16)]
    return [(a + x * w, a + y * w) for x, y in pts]


def icon(px, pad, rounded):
    s = px * SCALE
    im = Image.new('RGBA', (s, s), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    if rounded:
        d.rounded_rectangle((0, 0, s - 1, s - 1), radius=int(s * 0.22), fill=BRAND)
    else:
        d.rectangle((0, 0, s, s), fill=BRAND)  # maskable: the platform crops it
    d.polygon(shield(s, pad), fill=WHITE)
    # an envelope in the middle of the shield
    w, h = s * (1 - 2 * pad) * 0.5, s * (1 - 2 * pad) * 0.34
    cx, cy = s / 2, s * (pad + (1 - 2 * pad) * 0.42)
    box = (cx - w / 2, cy - h / 2, cx + w / 2, cy + h / 2)
    line = max(2, s // 36)
    d.rectangle(box, outline=BRAND, width=line)
    d.line([(box[0], box[1]), (cx, cy + h * 0.1), (box[2], box[1])], fill=BRAND, width=line)
    return im.resize((px, px), Image.LANCZOS)


os.makedirs(OUT, exist_ok=True)
icon(192, 0.2, True).save(os.path.join(OUT, 'icon-192.png'))
icon(512, 0.2, True).save(os.path.join(OUT, 'icon-512.png'))
icon(512, 0.3, False).save(os.path.join(OUT, 'maskable-512.png'))  # shield inside the safe zone
icon(180, 0.2, False).save(os.path.join(OUT, 'apple-touch-icon.png'))
icon(32, 0.12, True).save(os.path.join(OUT, 'favicon-32.png'))
print('icons written to', os.path.abspath(OUT))
