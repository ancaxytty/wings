#!/usr/bin/env python3
"""Generate real country-flag textures for the FIFA menu icons.

Ports the same flag "color-grid" recipes the addon uses to build block flags
(see FIFA_FLAGS in main.js) and renders each as a small PNG. Pure-python (no
deps). Output: WorldEditRP/textures/custom_ui/flags/<key>.png
Referenced by the behavior pack as: textures/custom_ui/flags/<key>
"""
import math
import os
import struct
import zlib

CANVAS = 32
FW, FH = 30, 20          # flag drawing area (3:2-ish)
OX, OY = 1, 6            # top-left of the flag inside the canvas
BORDER = (38, 40, 48)

OUT_DIR = os.path.abspath(
    os.path.join(
        os.path.dirname(__file__), "..", "WorldEditRP", "textures", "custom_ui", "flags"
    )
)

# char -> RGB (matches FLAG_PALETTE in main.js, tuned for screen)
PAL = {
    "W": (245, 245, 245),
    "R": (200, 40, 45),
    "B": (40, 70, 150),
    "L": (95, 160, 215),
    "G": (30, 140, 70),
    "Y": (245, 200, 40),
    "K": (25, 25, 30),
    "O": (235, 130, 30),
    "N": (110, 70, 45),
    "A": (120, 120, 130),
    "E": (205, 205, 210),
}


# ---------------------------------------------------------------- flag helpers
def make_grid(W, H, fill):
    return [[fill for _ in range(W)] for _ in range(H)]


def bands_h(colors, W, H):
    g = make_grid(W, H, colors[0])
    for y in range(H):
        i = min(len(colors) - 1, (y * len(colors)) // H)
        for x in range(W):
            g[y][x] = colors[i]
    return g


def bands_v(colors, W, H):
    g = make_grid(W, H, colors[0])
    for x in range(W):
        i = min(len(colors) - 1, (x * len(colors)) // W)
        for y in range(H):
            g[y][x] = colors[i]
    return g


def bands_v_prop(segs, W, H):
    last = segs[-1][0]
    g = make_grid(W, H, last)
    for x in range(W):
        f = (x + 0.5) / W
        acc = 0.0
        ch = last
        for c, w in segs:
            acc += w
            if f <= acc:
                ch = c
                break
        for y in range(H):
            g[y][x] = ch
    return g


def bands_h_prop(segs, W, H):
    last = segs[-1][0]
    g = make_grid(W, H, last)
    for y in range(H):
        f = (y + 0.5) / H
        acc = 0.0
        ch = last
        for c, w in segs:
            acc += w
            if f <= acc:
                ch = c
                break
        for x in range(W):
            g[y][x] = ch
    return g


def overlay_disc(g, color, cxf, cyf, rf):
    H = len(g)
    W = len(g[0])
    cx, cy = W * cxf, H * cyf
    r = min(W, H) * rf
    for y in range(H):
        for x in range(W):
            if math.hypot(x + 0.5 - cx, y + 0.5 - cy) <= r:
                g[y][x] = color
    return g


def _star_poly(cx, cy, rO, rI, pts, rot):
    v = []
    for i in range(pts * 2):
        r = rO if i % 2 == 0 else rI
        a = rot + i * math.pi / pts
        v.append((cx + r * math.sin(a), cy - r * math.cos(a)))
    return v


def _in_poly(x, y, poly):
    inside = False
    j = len(poly) - 1
    for i in range(len(poly)):
        xi, yi = poly[i]
        xj, yj = poly[j]
        if (yi > y) != (yj > y) and x < (xj - xi) * (y - yi) / (yj - yi) + xi:
            inside = not inside
        j = i
    return inside


def overlay_star(g, color, cxf, cyf, rf, rot=0.0):
    H = len(g)
    W = len(g[0])
    cx, cy = W * cxf, H * cyf
    rO = min(W, H) * rf
    poly = _star_poly(cx, cy, rO, rO * 0.42, 5, rot)
    for y in range(H):
        for x in range(W):
            if _in_poly(x + 0.5, y + 0.5, poly):
                g[y][x] = color
    return g


def full_cross(field, cross, W, H, t):
    g = make_grid(W, H, field)
    cy = (H - t) / 2
    cx = (W - t) / 2
    for y in range(H):
        for x in range(W):
            if (cy <= y < cy + t) or (cx <= x < cx + t):
                g[y][x] = cross
    return g


def plus_cross(field, cross, W, H, t, armf):
    g = make_grid(W, H, field)
    cxa = (W - t) / 2
    cya = (H - t) / 2
    ccx, ccy = W / 2, H / 2
    halfv = H * armf
    halfh = W * armf
    for y in range(H):
        for x in range(W):
            on_v = cxa <= x < cxa + t and abs(y + 0.5 - ccy) <= halfv
            on_h = cya <= y < cya + t and abs(x + 0.5 - ccx) <= halfh
            if on_v or on_h:
                g[y][x] = cross
    return g


def nordic(field, cross, W, H, t):
    g = make_grid(W, H, field)
    vx = int(W * 0.34)
    cya = int((H - t) / 2)
    for y in range(H):
        for x in range(W):
            if (vx <= x < vx + t) or (cya <= y < cya + t):
                g[y][x] = cross
    return g


def flag_usa(W, H):
    g = make_grid(W, H, "R")
    for y in range(H):
        stripe = "R" if (y * 13 // H) % 2 == 0 else "W"
        for x in range(W):
            g[y][x] = stripe
    cw = int(W * 0.42)
    chh = int(H * 0.54)
    for y in range(chh):
        for x in range(cw):
            g[y][x] = "W" if (x % 2 == 0 and y % 2 == 0) else "B"
    return g


def flag_brazil(W, H):
    g = make_grid(W, H, "G")
    cx = (W - 1) / 2
    cy = (H - 1) / 2
    for y in range(H):
        for x in range(W):
            d = abs(x - cx) / (W * 0.46) + abs(y - cy) / (H * 0.46)
            if d <= 1:
                g[y][x] = "Y"
    overlay_disc(g, "B", 0.5, 0.5, 0.17)
    return g


def flag_korea(W, H):
    g = make_grid(W, H, "W")
    cx, cy = W * 0.5, H * 0.5
    r = min(W, H) * 0.22
    for y in range(H):
        for x in range(W):
            if math.hypot(x + 0.5 - cx, y + 0.5 - cy) <= r:
                g[y][x] = "R" if (y + 0.5 < cy) else "B"
    m = max(1, int(min(W, H) * 0.08))
    pad = int(min(W, H) * 0.12)
    corners = [(pad, pad), (W - pad - m, pad), (pad, H - pad - m), (W - pad - m, H - pad - m)]
    for (sx, sy) in corners:
        for y in range(sy, sy + m):
            for x in range(sx, sx + m):
                if 0 <= y < H and 0 <= x < W:
                    g[y][x] = "K"
    return g


def flag_croatia(W, H):
    g = bands_h(["R", "W", "B"], W, H)
    cw = max(2, int(W * 0.2))
    ch = max(2, int(H * 0.36))
    sx = int((W - cw) / 2)
    sy = int(H * 0.14)
    for y in range(ch):
        for x in range(cw):
            gx, gy = sx + x, sy + y
            if 0 <= gy < H and 0 <= gx < W:
                g[gy][gx] = "R" if (x + y) % 2 == 0 else "W"
    return g


def flag_uruguay(W, H):
    # 9 stripes (white / light-blue) + white canton with a yellow sun
    g = make_grid(W, H, "W")
    for y in range(H):
        stripe = "W" if (y * 9 // H) % 2 == 0 else "L"
        for x in range(W):
            g[y][x] = stripe
    cw = int(W * 0.42)
    chh = int(H * 0.55)
    for y in range(chh):
        for x in range(cw):
            g[y][x] = "W"
    overlay_disc(g, "Y", 0.21, 0.27, 0.13)
    return g


SPECS = {
    "usa": flag_usa,
    "canada": lambda W, H: overlay_star(bands_v_prop([("R", 0.27), ("W", 0.46), ("R", 0.27)], W, H), "R", 0.5, 0.5, 0.2),
    "mexico": lambda W, H: overlay_disc(bands_v(["G", "W", "R"], W, H), "N", 0.5, 0.5, 0.1),
    "brazil": flag_brazil,
    "argentina": lambda W, H: overlay_disc(bands_h(["L", "W", "L"], W, H), "Y", 0.5, 0.5, 0.11),
    "france": lambda W, H: bands_v(["B", "W", "R"], W, H),
    "germany": lambda W, H: bands_h(["K", "R", "Y"], W, H),
    "spain": lambda W, H: bands_h_prop([("R", 0.25), ("Y", 0.5), ("R", 0.25)], W, H),
    "england": lambda W, H: full_cross("W", "R", W, H, max(2, int(H * 0.16))),
    "portugal": lambda W, H: overlay_disc(bands_v_prop([("G", 0.4), ("R", 0.6)], W, H), "Y", 0.4, 0.5, 0.1),
    "netherlands": lambda W, H: bands_h(["R", "W", "B"], W, H),
    "italy": lambda W, H: bands_v(["G", "W", "R"], W, H),
    "belgium": lambda W, H: bands_v(["K", "Y", "R"], W, H),
    "croatia": flag_croatia,
    "uruguay": flag_uruguay,
    "japan": lambda W, H: overlay_disc(make_grid(W, H, "W"), "R", 0.5, 0.5, 0.18),
    "korea": flag_korea,
    "morocco": lambda W, H: overlay_star(make_grid(W, H, "R"), "G", 0.5, 0.5, 0.2),
    "senegal": lambda W, H: overlay_star(bands_v(["G", "Y", "R"], W, H), "G", 0.5, 0.5, 0.16),
    "nigeria": lambda W, H: bands_v(["G", "W", "G"], W, H),
    "colombia": lambda W, H: bands_h_prop([("Y", 0.5), ("B", 0.25), ("R", 0.25)], W, H),
    "switzerland": lambda W, H: plus_cross("R", "W", W, H, max(2, int(H * 0.16)), 0.22),
    "denmark": lambda W, H: nordic("R", "W", W, H, max(2, int(H * 0.16))),
    "poland": lambda W, H: bands_h(["W", "R"], W, H),
    "ghana": lambda W, H: overlay_star(bands_h(["R", "Y", "G"], W, H), "K", 0.5, 0.5, 0.14),
}


# ------------------------------------------------------------------- PNG writer
def write_png(path, pixels):
    raw = bytearray()
    for y in range(CANVAS):
        raw.append(0)
        for x in range(CANVAS):
            r, g, b, a = pixels[y * CANVAS + x]
            raw += bytes((r & 255, g & 255, b & 255, a & 255))

    def chunk(tag, data):
        return (
            struct.pack(">I", len(data))
            + tag
            + data
            + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF)
        )

    png = b"\x89PNG\r\n\x1a\n"
    png += chunk(b"IHDR", struct.pack(">IIBBBBB", CANVAS, CANVAS, 8, 6, 0, 0, 0))
    png += chunk(b"IDAT", zlib.compress(bytes(raw), 9))
    png += chunk(b"IEND", b"")
    with open(path, "wb") as f:
        f.write(png)


def render(key, fn):
    grid = fn(FW, FH)
    px = [(0, 0, 0, 0)] * (CANVAS * CANVAS)
    # border rectangle
    for y in range(OY - 1, OY + FH + 1):
        for x in range(OX - 1, OX + FW + 1):
            if 0 <= x < CANVAS and 0 <= y < CANVAS:
                px[y * CANVAS + x] = BORDER + (255,)
    # flag pixels
    for fy in range(FH):
        for fx in range(FW):
            col = PAL.get(grid[fy][fx], (245, 245, 245))
            X, Y = OX + fx, OY + fy
            px[Y * CANVAS + X] = col + (255,)
    write_png(os.path.join(OUT_DIR, key + ".png"), px)


def main():
    os.makedirs(OUT_DIR, exist_ok=True)
    print("Writing", len(SPECS), "flags ->", OUT_DIR)
    for key, fn in SPECS.items():
        render(key, fn)
        print("  +", key + ".png")
    print("Done.")


if __name__ == "__main__":
    main()
