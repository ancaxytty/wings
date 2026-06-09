#!/usr/bin/env python3
"""Genera iconos PNG (RGBA) para los nuevos botones del addon Floating Text+ v5.0.0.
Sin dependencias externas (PNG escrito a mano con zlib).
Mejora hecha sobre el addon original de Death_Aruban (uso personal, creditos preservados).
"""
import struct, zlib, os, math

RP_ITEMS = os.path.join(os.path.dirname(__file__), "floating_textRP", "textures", "items")


def write_png(path, w, h, pixels):
    raw = bytearray()
    for y in range(h):
        raw.append(0)
        for px in pixels[y]:
            raw += bytes(int(max(0, min(255, c))) for c in px)

    def chunk(typ, data):
        c = struct.pack(">I", len(data)) + typ + data
        c += struct.pack(">I", zlib.crc32(typ + data) & 0xffffffff)
        return c

    sig = b"\x89PNG\r\n\x1a\n"
    ihdr = struct.pack(">IIBBBBB", w, h, 8, 6, 0, 0, 0)
    idat = zlib.compress(bytes(raw), 9)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "wb") as f:
        f.write(sig + chunk(b"IHDR", ihdr) + chunk(b"IDAT", idat) + chunk(b"IEND", b""))


def blank(w, h, color=(0, 0, 0, 0)):
    return [[list(color) for _ in range(w)] for _ in range(h)]


def rrect_cov(size, inset, radius, ss=3):
    cov = [[0.0] * size for _ in range(size)]
    x0 = inset; y0 = inset; x1 = size - inset; y1 = size - inset
    for y in range(size):
        for x in range(size):
            c = 0
            for sy in range(ss):
                for sx in range(ss):
                    px = x + (sx + 0.5) / ss; py = y + (sy + 0.5) / ss
                    if px < x0 or px > x1 or py < y0 or py > y1:
                        continue
                    cxr = min(px - x0, x1 - px); cyr = min(py - y0, y1 - py)
                    if cxr < radius and cyr < radius:
                        dx = radius - cxr; dy = radius - cyr
                        if dx * dx + dy * dy > radius * radius:
                            continue
                    c += 1
            cov[y][x] = c / (ss * ss)
    return cov


def blend(img, x, y, color, a):
    if not (0 <= x < len(img[0]) and 0 <= y < len(img)):
        return
    a = max(0.0, min(1.0, a))
    bg = img[y][x]
    ba = bg[3] / 255.0
    out_a = a + ba * (1 - a)
    if out_a <= 0:
        return
    for i in range(3):
        img[y][x][i] = int((color[i] * a + bg[i] * ba * (1 - a)) / out_a)
    img[y][x][3] = int(out_a * 255)


def fill_tile(img, cov, top, bottom):
    n = len(img)
    for y in range(n):
        t = y / (n - 1)
        col = [int(top[i] + (bottom[i] - top[i]) * t) for i in range(3)]
        for x in range(n):
            a = cov[y][x]
            if a > 0:
                blend(img, x, y, col, a)
    # bisel claro arriba / sombra abajo
    for y in range(n):
        for x in range(n):
            if cov[y][x] <= 0:
                continue
            if y < n * 0.18:
                blend(img, x, y, (255, 255, 255), 0.25 * cov[y][x])
            elif y > n * 0.82:
                blend(img, x, y, (0, 0, 0), 0.30 * cov[y][x])


def draw_arrow(img, cx, top_y, h, w, color, up=True):
    """Dibuja una flecha rellena (triangulo + tallo)."""
    n = len(img)
    head_h = h * 0.55
    stem_w = w * 0.34
    for yy in range(int(top_y), int(top_y + h) + 1):
        rel = (yy - top_y) / h
        if up:
            phase = rel
        else:
            phase = 1 - rel
        if phase < (head_h / h):
            # cabeza del triangulo
            p = phase / (head_h / h)
            half = (w / 2) * p
        else:
            half = stem_w / 2
        for xx in range(int(cx - half), int(cx + half) + 1):
            blend(img, xx, yy, color, 1.0)


def make_float_icon(on=True):
    n = 64
    img = blank(n, n)
    cov = rrect_cov(n, 4, 12)
    if on:
        top, bottom = (74, 222, 128), (22, 130, 73)   # verde
    else:
        top, bottom = (120, 120, 130), (60, 60, 68)    # gris
    fill_tile(img, cov, top, bottom)
    # flecha arriba y flecha abajo (movimiento flotante)
    arrow_col = (255, 255, 255) if on else (210, 210, 215)
    draw_arrow(img, n / 2, 11, 18, 24, arrow_col, up=True)
    draw_arrow(img, n / 2, 35, 18, 24, arrow_col, up=False)
    if not on:
        # diagonal roja de "off"
        for i in range(-2, 3):
            for t in range(8, n - 8):
                blend(img, t + i, t, (220, 50, 50), 1.0)
    return img


def main():
    write_png(os.path.join(RP_ITEMS, "float_on.png"), 64, 64, make_float_icon(True))
    write_png(os.path.join(RP_ITEMS, "float_off.png"), 64, 64, make_float_icon(False))
    print("OK -> float_on.png, float_off.png en", RP_ITEMS)


if __name__ == "__main__":
    main()
