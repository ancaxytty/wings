#!/usr/bin/env python3
"""Generate the custom UI textures for the WorldEdit resource pack.

Outputs (RGBA PNG) into WorldEditRP/textures/custom_ui/:
  - custom_bg.png          panel / button background (9-slice, dark slate + border)
  - custom_bg_hover.png    hover variant (lighter + gold accent border)
  - close_button.png       small red close button with an "X"
  - close_button_hover.png brighter hover variant

Pure-python PNG writer (no third-party dependencies) so it runs anywhere.
These are intentionally simple, clean, flat panels that look good when
stretched / 9-sliced by the Bedrock UI engine.
"""
import os
import struct
import zlib

OUT_DIR = os.path.abspath(
    os.path.join(os.path.dirname(__file__), "..", "WorldEditRP", "textures", "custom_ui")
)


def write_png(path, width, height, pixels):
    """pixels: list of (r,g,b,a) rows-major, length width*height."""
    raw = bytearray()
    for y in range(height):
        raw.append(0)  # filter type 0 (None) per scanline
        for x in range(width):
            r, g, b, a = pixels[y * width + x]
            raw += bytes((r & 255, g & 255, b & 255, a & 255))

    def chunk(tag, data):
        c = struct.pack(">I", len(data)) + tag + data
        return c + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF)

    sig = b"\x89PNG\r\n\x1a\n"
    ihdr = struct.pack(">IIBBBBB", width, height, 8, 6, 0, 0, 0)  # 8-bit RGBA
    png = sig + chunk(b"IHDR", ihdr)
    png += chunk(b"IDAT", zlib.compress(bytes(raw), 9))
    png += chunk(b"IEND", b"")
    with open(path, "wb") as f:
        f.write(png)
    print("  +", os.path.relpath(path, os.path.dirname(OUT_DIR)))


def lerp(a, b, t):
    return tuple(int(a[i] + (b[i] - a[i]) * t) for i in range(len(a)))


def panel(size, fill_top, fill_bot, border, accent, border_w=5):
    """A flat panel with a vertical gradient body + a solid border and a 1px
    inner accent line. Designed for a 9-slice of `border_w + 2`."""
    px = [(0, 0, 0, 0)] * (size * size)
    for y in range(size):
        t = y / (size - 1)
        body = lerp(fill_top, fill_bot, t) + (255,)
        for x in range(size):
            edge = min(x, y, size - 1 - x, size - 1 - y)
            if edge < border_w:
                col = border + (255,)
            elif edge == border_w:
                col = accent + (255,)  # thin inner highlight line
            else:
                col = body
            px[y * size + x] = col
    return px


def close_button(size, base, x_color):
    """Rounded-ish red square with a clean white X."""
    px = [(0, 0, 0, 0)] * (size * size)
    c = (size - 1) / 2.0
    radius = size / 2.0
    corner = 3  # rounded corner cut
    for y in range(size):
        for x in range(size):
            # rounded corners: skip pixels outside the rounded rect
            cx = min(x, size - 1 - x)
            cy = min(y, size - 1 - y)
            if cx + cy < corner:
                continue
            # base fill with a soft vertical gradient
            t = y / (size - 1)
            col = lerp(base, lerp(base, (0, 0, 0), 0.25), t) + (255,)
            # draw the X (two diagonals) within a margin
            m = size * 0.26
            on_main = abs((x - c) - (y - c)) <= 1.1 and m <= x <= size - 1 - m
            on_anti = abs((x - c) + (y - c)) <= 1.1 and m <= x <= size - 1 - m
            if on_main or on_anti:
                col = x_color + (255,)
            px[y * size + x] = col
    return px


def main():
    os.makedirs(OUT_DIR, exist_ok=True)
    print("Writing custom_ui textures ->", OUT_DIR)

    # Panel / button background: dark slate blue, subtle border + accent line.
    write_png(
        os.path.join(OUT_DIR, "custom_bg.png"),
        32, 32,
        panel(32, (30, 38, 58), (20, 26, 42), border=(72, 88, 124), accent=(120, 150, 200)),
    )
    # Hover: a touch lighter with a warm gold accent (FIFA vibe).
    write_png(
        os.path.join(OUT_DIR, "custom_bg_hover.png"),
        32, 32,
        panel(32, (46, 56, 82), (32, 40, 62), border=(150, 120, 60), accent=(224, 184, 96)),
    )
    # Close button + hover.
    write_png(
        os.path.join(OUT_DIR, "close_button.png"),
        16, 16,
        close_button(16, (168, 52, 56), (245, 245, 245)),
    )
    write_png(
        os.path.join(OUT_DIR, "close_button_hover.png"),
        16, 16,
        close_button(16, (214, 72, 72), (255, 255, 255)),
    )
    print("Done.")


if __name__ == "__main__":
    main()
