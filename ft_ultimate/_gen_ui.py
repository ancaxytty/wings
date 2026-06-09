#!/usr/bin/env python3
"""Genera iconos UI (64x64 RGBA) para el menu de Hologram Studio. Sin dependencias."""
import struct, zlib, os, math

OUT = os.path.join(os.path.dirname(__file__), "HologramStudioRP", "textures", "ui", "holo")


def write_png(path, w, h, px):
    raw = bytearray()
    for y in range(h):
        raw.append(0)
        for p in px[y]:
            raw += bytes(int(max(0, min(255, c))) for c in p)

    def chunk(t, d):
        return struct.pack(">I", len(d)) + t + d + struct.pack(">I", zlib.crc32(t + d) & 0xffffffff)

    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "wb") as f:
        f.write(b"\x89PNG\r\n\x1a\n")
        f.write(chunk(b"IHDR", struct.pack(">IIBBBBB", w, h, 8, 6, 0, 0, 0)))
        f.write(chunk(b"IDAT", zlib.compress(bytes(raw), 9)))
        f.write(chunk(b"IEND", b""))


def blank(w, h):
    return [[[0, 0, 0, 0] for _ in range(w)] for _ in range(h)]


def put(img, x, y, c, a=1.0):
    if not (0 <= x < len(img[0]) and 0 <= y < len(img)):
        return
    a = max(0.0, min(1.0, a))
    if a <= 0:
        return
    bg = img[y][x]; ba = bg[3] / 255.0; oa = a + ba * (1 - a)
    if oa <= 0:
        return
    for i in range(3):
        img[y][x][i] = (c[i] * a + bg[i] * ba * (1 - a)) / oa
    img[y][x][3] = oa * 255


def rounded_tile(n, c1, c2, rad=12):
    img = blank(n, n)
    inset = 4
    for y in range(n):
        t = y / (n - 1)
        col = [c1[i] + (c2[i] - c1[i]) * t for i in range(3)]
        for x in range(n):
            px = x + 0.5; py = y + 0.5
            x0, y0, x1, y1 = inset, inset, n - inset, n - inset
            if px < x0 or px > x1 or py < y0 or py > y1:
                continue
            cxr = min(px - x0, x1 - px); cyr = min(py - y0, y1 - py)
            a = 1.0
            if cxr < rad and cyr < rad:
                d = math.hypot(rad - cxr, rad - cyr)
                if d > rad:
                    continue
                a = max(0.0, min(1.0, rad - d + 0.5))
            put(img, x, y, col, a)
            if y < n * 0.2:
                put(img, x, y, (255, 255, 255), 0.18 * a)
            elif y > n * 0.8:
                put(img, x, y, (0, 0, 0), 0.22 * a)
    return img


def thick(img, pts, c, r=3):
    for (x, y) in pts:
        for oy in range(-r, r + 1):
            for ox in range(-r, r + 1):
                if ox * ox + oy * oy <= r * r:
                    put(img, int(x + ox), int(y + oy), c, 1.0)


def line(a, b, steps=60):
    return [(a[0] + (b[0] - a[0]) * i / steps, a[1] + (b[1] - a[1]) * i / steps) for i in range(steps + 1)]


W = (255, 255, 255)


def sym_plus(img):
    thick(img, line((32, 18), (32, 46)), W); thick(img, line((18, 32), (46, 32)), W)


def sym_box(img):
    thick(img, line((20, 20), (44, 20)), W, 2); thick(img, line((44, 20), (44, 44)), W, 2)
    thick(img, line((44, 44), (20, 44)), W, 2); thick(img, line((20, 44), (20, 20)), W, 2)


def sym_cursor(img):
    # flecha de clic
    thick(img, line((24, 18), (24, 44)), W, 2); thick(img, line((24, 18), (42, 30)), W, 2)
    thick(img, line((24, 44), (30, 36)), W, 2); thick(img, line((42, 30), (30, 33)), W, 2)
    thick(img, line((30, 36), (38, 48)), W, 3)


def sym_list(img):
    for y in (22, 32, 42):
        thick(img, line((20, y), (24, y)), W, 2)
        thick(img, line((30, y), (46, y)), W, 1)


def sym_x(img):
    thick(img, line((20, 20), (44, 44)), W); thick(img, line((44, 20), (20, 44)), W)


def sym_q(img):
    thick(img, [(32 + 9 * math.cos(t / 10), 26 + 9 * math.sin(t / 10)) for t in range(-8, 22)], W, 2)
    thick(img, line((32, 35), (32, 40)), W, 2); thick(img, [(32, 46)], W, 2)


def sym_pencil(img):
    thick(img, line((20, 44), (42, 22)), W, 3); thick(img, [(44, 20)], W, 3)
    thick(img, line((20, 44), (24, 40)), W, 2)


def sym_move(img):
    thick(img, line((16, 32), (48, 32)), W, 2); thick(img, line((32, 16), (32, 48)), W, 2)
    for p in [((16, 32), (22, 27)), ((16, 32), (22, 37)), ((48, 32), (42, 27)), ((48, 32), (42, 37)),
              ((32, 16), (27, 22)), ((32, 16), (37, 22)), ((32, 48), (27, 42)), ((32, 48), (37, 42))]:
        thick(img, line(p[0], p[1], 20), W, 1)


def sym_tp(img):
    thick(img, [(32 + 11 * math.cos(t / 8), 32 + 11 * math.sin(t / 8)) for t in range(0, 44)], W, 2)
    thick(img, line((32, 32), (32, 18)), W, 2)


def sym_dup(img):
    sym_box(img)
    thick(img, line((28, 28), (52, 28)), W, 1); thick(img, line((52, 28), (52, 52)), W, 1)
    thick(img, line((52, 52), (28, 52)), W, 1); thick(img, line((28, 52), (28, 28)), W, 1)


def sym_cmd(img):
    thick(img, line((20, 24), (28, 32)), W, 2); thick(img, line((28, 32), (20, 40)), W, 2)
    thick(img, line((32, 42), (44, 42)), W, 2)


ICONS = {
    "create_text": ((60, 200, 110), (24, 120, 60), sym_plus),
    "create_item": ((240, 200, 70), (170, 120, 20), sym_box),
    "create_button": ((40, 200, 230), (20, 110, 150), sym_cursor),
    "manage": ((90, 140, 255), (40, 70, 170), sym_list),
    "delete_all": ((235, 80, 80), (150, 30, 30), sym_x),
    "help": ((150, 160, 175), (80, 90, 105), sym_q),
    "edit": ((70, 210, 220), (30, 120, 140), sym_pencil),
    "move": ((180, 120, 255), (100, 50, 170), sym_move),
    "teleport": ((60, 210, 180), (25, 120, 110), sym_tp),
    "duplicate": ((255, 160, 70), (180, 90, 20), sym_dup),
    "command": ((230, 100, 220), (140, 40, 140), sym_cmd),
    "back": ((130, 140, 150), (70, 80, 90), lambda im: thick(im, line((40, 20), (24, 32)) + line((24, 32), (40, 44)), W, 2)),
}


def main():
    for name, (c1, c2, sym) in ICONS.items():
        img = rounded_tile(64, c1, c2)
        sym(img)
        write_png(os.path.join(OUT, name + ".png"), 64, 64, img)
    print("OK -> %d iconos UI en %s" % (len(ICONS), OUT))


if __name__ == "__main__":
    main()
