#!/usr/bin/env python3
"""Generate the custom UI textures for the WorldEdit Resource Pack.

Pure-Python PNG writer (no third-party deps) so it runs anywhere. Produces
clean, flat, rounded panels + a close button, themed in the WorldEdit/FIFA
colors (dark navy panel, cyan + gold accents).

Output: WorldEditRP/textures/custom_ui/*.png
"""
import math
import os
import struct
import zlib

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
OUTDIR = os.path.join(ROOT, "WorldEditRP", "textures", "custom_ui")


def png_chunk(tag, data):
    c = struct.pack(">I", len(data)) + tag + data
    c += struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF)
    return c


def write_png(path, w, h, pixels):
    """pixels: list of (r,g,b,a) length w*h."""
    raw = bytearray()
    i = 0
    for y in range(h):
        raw.append(0)  # filter type 0
        for x in range(w):
            r, g, b, a = pixels[i]
            raw += bytes((r, g, b, a))
            i += 1
    sig = b"\x89PNG\r\n\x1a\n"
    ihdr = struct.pack(">IIBBBBB", w, h, 8, 6, 0, 0, 0)
    png = sig + png_chunk(b"IHDR", ihdr)
    png += png_chunk(b"IDAT", zlib.compress(bytes(raw), 9))
    png += png_chunk(b"IEND", b"")
    with open(path, "wb") as f:
        f.write(png)
    print("  +", os.path.relpath(path, ROOT), f"({w}x{h})")


def rounded_panel(w, h, radius, interior, borders, inner_alpha=255):
    """borders: list of (thickness, (r,g,b)) from the outside inward."""
    px = []
    total_border = sum(t for t, _ in borders)
    for y in range(h):
        for x in range(w):
            # rounded-corner test
            cx = None
            cy = None
            if x < radius and y < radius:
                cx, cy = radius, radius
            elif x >= w - radius and y < radius:
                cx, cy = w - radius - 1, radius
            elif x < radius and y >= h - radius:
                cx, cy = radius, h - radius - 1
            elif x >= w - radius and y >= h - radius:
                cx, cy = w - radius - 1, h - radius - 1
            if cx is not None and math.hypot(x - cx, y - cy) > radius + 0.2:
                px.append((0, 0, 0, 0))
                continue
            edge = min(x, w - 1 - x, y, h - 1 - y)
            if edge < total_border:
                acc = 0
                color = borders[-1][1]
                for t, col in borders:
                    acc += t
                    if edge < acc:
                        color = col
                        break
                px.append((color[0], color[1], color[2], 255))
            else:
                px.append((interior[0], interior[1], interior[2], inner_alpha))
    return px


def close_button(w, h, base, glyph=(245, 245, 245)):
    px = []
    radius = 4
    border = (max(0, base[0] - 40), max(0, base[1] - 40), max(0, base[2] - 40))
    m = 4  # margin for the X
    for y in range(h):
        for x in range(w):
            cx = cy = None
            if x < radius and y < radius:
                cx, cy = radius, radius
            elif x >= w - radius and y < radius:
                cx, cy = w - radius - 1, radius
            elif x < radius and y >= h - radius:
                cx, cy = radius, h - radius - 1
            elif x >= w - radius and y >= h - radius:
                cx, cy = w - radius - 1, h - radius - 1
            if cx is not None and math.hypot(x - cx, y - cy) > radius + 0.2:
                px.append((0, 0, 0, 0))
                continue
            edge = min(x, w - 1 - x, y, h - 1 - y)
            inside_x = m <= x <= w - 1 - m and m <= y <= h - 1 - m
            on_x = inside_x and (abs((x - m) - (y - m)) <= 1 or abs((x - m) - (h - 1 - m - y)) <= 1)
            if on_x:
                px.append((glyph[0], glyph[1], glyph[2], 255))
            elif edge < 1:
                px.append((border[0], border[1], border[2], 255))
            else:
                px.append((base[0], base[1], base[2], 255))
    return px


def main():
    os.makedirs(OUTDIR, exist_ok=True)

    NAVY = (14, 20, 36)
    NAVY_HOVER = (28, 44, 78)
    GOLD = (240, 196, 36)
    CYAN = (60, 210, 255)

    # main panel background (nine-sliced -> nineslice_size 8 in JSON)
    write_png(os.path.join(OUTDIR, "custom_bg.png"), 36, 36,
              rounded_panel(36, 36, 6, NAVY, [(2, GOLD), (1, CYAN)], inner_alpha=240))
    # hover / pressed variant for buttons
    write_png(os.path.join(OUTDIR, "custom_bg_hover.png"), 36, 36,
              rounded_panel(36, 36, 6, NAVY_HOVER, [(2, CYAN), (1, GOLD)], inner_alpha=255))

    # close button + hover
    write_png(os.path.join(OUTDIR, "close_button.png"), 16, 16, close_button(16, 16, (176, 48, 58)))
    write_png(os.path.join(OUTDIR, "close_button_hover.png"), 16, 16, close_button(16, 16, (224, 69, 79)))

    print("Done ->", os.path.relpath(OUTDIR, ROOT))


if __name__ == "__main__":
    main()
