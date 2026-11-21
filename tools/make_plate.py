#!/usr/bin/env python3
"""Convert a raw plate scan into plate.jpg (max 900 px tall, JPEG q85).
Usage: python3 -I make_plate.py <input image> <output.jpg> [x0,y0,x1,y1]
Optional crop box (source pixels) trims wide sheet margins, e.g. Audubon's double-elephant sheets.
Optional --rotate=DEG (counter-clockwise, PIL convention; e.g. --rotate=-90 turns a sideways landscape plate upright)."""
import sys
from PIL import Image

Image.MAX_IMAGE_PIXELS = 200_000_000
rot = [a for a in sys.argv if a.startswith("--rotate=")]
sys.argv = [a for a in sys.argv if not a.startswith("--rotate=")]
src, dst = sys.argv[1], sys.argv[2]
im = Image.open(src)
im = im.convert("RGB")
print("source size", im.size)
if rot:
    im = im.rotate(float(rot[0].split("=", 1)[1]), expand=True)
    print("rotated", rot[0], im.size)
if len(sys.argv) > 3:
    box = tuple(int(v) for v in sys.argv[3].split(","))
    im = im.crop(box)
    print("cropped to", box, im.size)
if im.height > 900:
    w = round(im.width * 900 / im.height)
    im = im.resize((w, 900), Image.LANCZOS)
im.save(dst, "JPEG", quality=85, optimize=True, progressive=True)
print("saved", dst, im.size)
