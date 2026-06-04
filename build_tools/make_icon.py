#!/usr/bin/env python3
"""Generate pack_icon.png for the WorldEdit MCPE addon.

Tries Pillow for a nicer icon (gradient + "WE" text). Falls back to a
pure-Python PNG writer (no third-party deps) if Pillow is unavailable.
"""
import os
import struct
import zlib

OUT = os.path.join(os.path.dirname(__file__), "..", "WorldEditBP", "pack_icon.png")
OUT = os.path.abspath(OUT)
SIZE = 128


def with_pillow():
    from PIL import Image, ImageDraw, ImageFont

    img = Image.new("RGB", (SIZE, SIZE), (20, 24, 38))
    draw = ImageDraw.Draw(img)
    # vertical gradient (dark blue -> teal)
    top = (24, 38, 72)
    bot = (16, 110, 110)
    for y in range(SIZE):
        t = y / (SIZE - 1)
        r = int(top[0] + (bot[0] - top[0]) * t)
        g = int(top[1] + (bot[1] - top[1]) * t)
        b = int(top[2] + (bot[2] - top[2]) * t)
        draw.line([(0, y), (SIZE, y)], fill=(r, g, b))

    # selection-cube wireframe accent
    draw.rectangle([18, 30, 88, 100], outline=(120, 230, 255), width=3)
    draw.rectangle([40, 14, 110, 84], outline=(170, 255, 200), width=3)
    for a, b in [((18, 30), (40, 14)), ((88, 30), (110, 14)),
                 ((18, 100), (40, 84)), ((88, 100), (110, 84))]:
        draw.line([a, b], fill=(150, 245, 230), width=3)

    # "WE" text
    try:
        font = ImageFont.truetype("DejaVuSans-Bold.ttf", 46)
    except Exception:
        font = ImageFont.load_default()
    text = "WE"
    try:
        bbox = draw.textbbox((0, 0), text, font=font)
        tw, th = bbox[2] - bbox[0], bbox[3] - bbox[1]
    except Exception:
        tw, th = font.getsize(text) if hasattr(font, "getsize") else (40, 40)
    draw.text(((SIZE - tw) / 2, SIZE - th - 18), text, fill=(255, 255, 255), font=font)

    img.save(OUT, "PNG")
    print("Icon written with Pillow ->", OUT)


def png_chunk(tag, data):
    c = struct.pack(">I", len(data)) + tag + data
    c += struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF)
    return c


def without_pillow():
    # Pure-python gradient RGBA PNG, no dependencies.
    raw = bytearray()
    for y in range(SIZE):
        raw.append(0)  # filter type 0
        t = y / (SIZE - 1)
        r = int(24 + (16 - 24) * t)
        g = int(38 + (110 - 38) * t)
        b = int(72 + (110 - 72) * t)
        for x in range(SIZE):
            # simple diagonal highlight to make a wireframe-ish look
            edge = (x in (18, 88) and 30 <= y <= 100) or (y in (30, 100) and 18 <= x <= 88)
            if edge:
                raw += bytes((120, 230, 255, 255))
            else:
                raw += bytes((r, g, b, 255))
    sig = b"\x89PNG\r\n\x1a\n"
    ihdr = struct.pack(">IIBBBBB", SIZE, SIZE, 8, 6, 0, 0, 0)
    png = sig + png_chunk(b"IHDR", ihdr)
    png += png_chunk(b"IDAT", zlib.compress(bytes(raw), 9))
    png += png_chunk(b"IEND", b"")
    with open(OUT, "wb") as f:
        f.write(png)
    print("Icon written with pure-python fallback ->", OUT)


if __name__ == "__main__":
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    try:
        with_pillow()
    except Exception as e:
        print("Pillow unavailable (%s); using fallback." % e)
        without_pillow()
