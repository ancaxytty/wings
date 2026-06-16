#!/usr/bin/env python3
"""Generador de texturas PNG (RGBA) para ROM PvP Zones.
Sin dependencias externas. Crea:
  - items 16x16: zone_wand (varita nether), wall_wand (palo marcador)
  - iconos de formularios 64x64 (estilo tile)
  - pack_icon 128x128 (arena con espadas) para BP y RP
"""
import struct, zlib, os, math

RP = "rom_pvp_RP"
BP = "rom_pvp_BP"

# ----------------------------------------------------------- PNG IO
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
    print("  ->", path)

def blank(w, h, color=(0, 0, 0, 0)):
    return [[list(color) for _ in range(w)] for _ in range(h)]

def clamp(v): return max(0, min(255, int(v)))
def mix(c1, c2, t): return (c1[0]+(c2[0]-c1[0])*t, c1[1]+(c2[1]-c1[1])*t, c1[2]+(c2[2]-c1[2])*t)
def lighten(c, f): return mix(c, (255, 255, 255), f)
def darken(c, f): return mix(c, (0, 0, 0), f)

def putpx(img, x, y, col):
    if 0 <= y < len(img) and 0 <= x < len(img[0]):
        img[y][x] = [clamp(col[0]), clamp(col[1]), clamp(col[2]), clamp(col[3]) if len(col) > 3 else 255]

def blend(img, x, y, color, a):
    if not (0 <= x < len(img[0]) and 0 <= y < len(img)):
        return
    a = max(0.0, min(1.0, a))
    bg = img[y][x]; ba = bg[3] / 255.0
    out_a = a + ba * (1 - a)
    if out_a <= 0:
        return
    for i in range(3):
        img[y][x][i] = int((color[i] * a + bg[i] * ba * (1 - a)) / out_a)
    img[y][x][3] = int(out_a * 255)

def draw_rect(img, x0, y0, x1, y1, color):
    for y in range(int(y0), int(y1)):
        for x in range(int(x0), int(x1)):
            putpx(img, x, y, color)

def draw_disc(img, cx, cy, r, color):
    for y in range(int(cy - r), int(cy + r + 1)):
        for x in range(int(cx - r), int(cx + r + 1)):
            if (x - cx) ** 2 + (y - cy) ** 2 <= r * r:
                putpx(img, x, y, color)

# ----------------------------------------------------------- rounded tile (iconos)
_cov = {}
def cov(size, inset, radius, ss=3):
    key = (size, inset, round(radius, 2), ss)
    if key in _cov:
        return _cov[key]
    g = [[0.0] * size for _ in range(size)]
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
            g[y][x] = c / (ss * ss)
    _cov[key] = g
    return g

def tile(size, c1, c2, border, symbol=None):
    rad = size * 0.18; bw = max(2, int(size * 0.05))
    full = cov(size, 0, rad); inner = cov(size, bw, rad - bw)
    img = blank(size, size)
    for y in range(size):
        for x in range(size):
            a = full[y][x]
            if a <= 0:
                continue
            t = (x + y) / (2.0 * (size - 1))
            r, g, b = mix(c1, c2, t)
            dx = (x - size / 2) / (size / 2); dy = (y - size / 2) / (size / 2)
            vig = 1 - 0.20 * min(1.0, dx * dx + dy * dy)
            r *= vig; g *= vig; b *= vig
            if inner[y][x] < 0.55:
                d = ((x + y) - size) / float(size)
                bf = 1.18 - 0.55 * d
                r, g, b = border[0] * bf, border[1] * bf, border[2] * bf
            elif y < size * 0.5:
                gl = (1 - y / (size * 0.5)) * 0.22
                r += 255 * gl; g += 255 * gl; b += 255 * gl
            img[y][x] = [clamp(r), clamp(g), clamp(b), clamp(255 * a)]
    if symbol:
        symbol(img, size)
    return img

def shape(img, size, fn, col=(245, 248, 255)):
    fn(img, size, (10, 12, 18, 150), max(2, size // 24))  # sombra
    fn(img, size, col + (255,), 0)                          # figura

# ----------------------------------------------------------- simbolos de iconos
def sym_plus(img, size, col, off):
    cx = size // 2 + off; cy = size // 2 + off
    t = int(size * 0.10); L = int(size * 0.28)
    draw_rect(img, cx - t, cy - L, cx + t, cy + L, col)
    draw_rect(img, cx - L, cy - t, cx + L, cy + t, col)

def sym_info(img, size, col, off):
    cx = size // 2 + off; cy = size // 2 + off; s = max(2, int(size * 0.09))
    draw_rect(img, cx - s, cy - int(size * 0.26), cx + s, cy - int(size * 0.12), col)  # punto
    draw_rect(img, cx - s, cy - int(size * 0.02), cx + s, cy + int(size * 0.26), col)  # cuerpo

def sym_trash(img, size, col, off):
    cx = size // 2 + off; cy = int(size * 0.52) + off; w = int(size * 0.20)
    draw_rect(img, cx - w, cy - int(size * 0.16), cx + w, cy + int(size * 0.24), col)
    draw_rect(img, cx - w - 3, cy - int(size * 0.22), cx + w + 3, cy - int(size * 0.14), col)
    draw_rect(img, cx - 4, cy - int(size * 0.30), cx + 4, cy - int(size * 0.22), col)
    dk = (col[0] // 4, col[1] // 5, col[2] // 5, col[3] if len(col) > 3 else 255)
    for ox in (-int(size * 0.09), 0, int(size * 0.09)):
        draw_rect(img, cx + ox - 1, cy - int(size * 0.10), cx + ox + 2, cy + int(size * 0.18), dk)

def sym_help(img, size, col, off):
    cx = size // 2 + off; cy = int(size * 0.5) + off; s = max(2, int(size * 0.08))
    draw_rect(img, cx - 2 * s, cy - 3 * s, cx + 2 * s, cy - s, col)
    draw_rect(img, cx + s, cy - 2 * s, cx + 2 * s, cy + s, col)
    draw_rect(img, cx - s, cy, cx + 2 * s, cy + s, col)
    draw_rect(img, cx - s, cy + s, cx, cy + 2 * s, col)
    draw_rect(img, cx - s, cy + 3 * s, cx + s, cy + 4 * s, col)

def sym_pos(img, size, col, off):
    # marcador de mapa (pin)
    cx = size // 2 + off; cy = int(size * 0.42) + off; r = int(size * 0.18)
    draw_disc(img, cx, cy, r, col)
    dk = (col[0] // 4, col[1] // 4, col[2] // 4, col[3] if len(col) > 3 else 255)
    draw_disc(img, cx, cy, max(2, r // 2), dk)
    for i in range(int(size * 0.26)):
        wv = max(1, int((1 - i / (size * 0.26)) * r))
        draw_rect(img, cx - wv, cy + r + i - 2, cx + wv, cy + r + i, col)

def sym_wand(img, size, col, off):
    # varita en diagonal con estrella
    x0 = int(size * 0.30) + off; y0 = int(size * 0.70) + off
    x1 = int(size * 0.66) + off; y1 = int(size * 0.34) + off
    t = max(2, int(size * 0.05))
    steps = 60
    for i in range(steps + 1):
        x = x0 + (x1 - x0) * i / steps
        y = y0 + (y1 - y0) * i / steps
        draw_rect(img, x - t, y - t, x + t, y + t, col)
    # estrella superior
    for (dx, dy) in [(0, -1), (0, 1), (-1, 0), (1, 0)]:
        for k in range(int(size * 0.16)):
            putpx(img, x1 + dx * k, y1 + dy * k, col)
            putpx(img, x1 + dx * k + 1, y1 + dy * k, col)

# ----------------------------------------------------------- ITEM: varita nether 16x16
def item_zone_wand():
    s = 16
    img = blank(s, s)
    # mango oscuro tipo netherrack/obsidiana en diagonal
    handle_dark = (54, 26, 38)
    handle_light = (96, 44, 62)
    for i in range(11):
        x = 3 + i; y = 12 - i
        putpx(img, x, y, handle_dark)
        putpx(img, x + 1, y, handle_light)
        putpx(img, x, y + 1, darken(handle_dark, 0.3))
    # vetas crimson
    for i in range(0, 11, 3):
        x = 3 + i; y = 12 - i
        putpx(img, x + 1, y, (150, 40, 60))
    # punta: cristal nether brillante (morado/rojo)
    tipx, tipy = 14, 2
    draw_disc(img, tipx, tipy + 1, 2.4, (146, 50, 168, 255))
    draw_disc(img, tipx, tipy + 1, 1.6, (210, 90, 200, 255))
    putpx(img, tipx, tipy, (255, 200, 240))
    putpx(img, tipx - 1, tipy + 1, (255, 230, 250))
    # chispas
    for (sx, sy, c) in [(11, 1, (255, 170, 220)), (13, 5, (200, 90, 170)), (15, 3, (255, 210, 240))]:
        putpx(img, sx, sy, c)
    # brillo del mango (gema inferior)
    putpx(img, 3, 13, (120, 60, 200))
    return s, s, img

# ----------------------------------------------------------- ITEM: palo marcador 16x16
def item_wall_wand():
    s = 16
    img = blank(s, s)
    wood_d = (92, 60, 30); wood_l = (140, 96, 50)
    for i in range(11):
        x = 4 + i; y = 12 - i
        putpx(img, x, y, wood_d)
        putpx(img, x + 1, y, wood_l)
        putpx(img, x, y + 1, darken(wood_d, 0.3))
    # nudos de la madera
    putpx(img, 7, 9, darken(wood_d, 0.4))
    putpx(img, 10, 6, darken(wood_d, 0.4))
    # banderín marcador (naranja/oro) arriba
    fx, fy = 13, 2
    draw_rect(img, fx, fy, fx + 1, fy + 6, (70, 70, 74))  # asta
    draw_rect(img, fx - 5, fy, fx, fy + 4, (240, 165, 60, 255))
    draw_rect(img, fx - 5, fy + 2, fx, fy + 4, (220, 130, 40, 255))
    putpx(img, fx - 4, fy + 1, (255, 220, 150))
    return s, s, img

# ----------------------------------------------------------- pack icon (arena)
def pack_icon():
    s = 128
    img = tile(s, (44, 20, 30), (16, 10, 16), (150, 60, 70))
    # suelo de arena (elipse)
    for y in range(70, 104):
        for x in range(24, 104):
            if ((x - 64) / 40.0) ** 2 + ((y - 88) / 18.0) ** 2 <= 1:
                t = (y - 70) / 34.0
                col = mix((120, 122, 130), (70, 72, 82), t)
                putpx(img, x, y, (col[0], col[1], col[2], 255))
    # lineas de la arena
    for x in range(28, 100):
        putpx(img, x, 88, (200, 60, 60, 180))
    # espadas cruzadas
    def sword(cx, cy, ang, blade):
        for i in range(34):
            x = cx + math.cos(ang) * i; y = cy + math.sin(ang) * i
            draw_disc(img, x, y, 2.2, blade)
        # guarda
        gx = cx + math.cos(ang) * 6; gy = cy + math.sin(ang) * 6
        draw_disc(img, gx, gy, 4, (90, 70, 40, 255))
        # mango
        for i in range(8):
            x = cx - math.cos(ang) * i; y = cy - math.sin(ang) * i
            draw_disc(img, x, y, 2, (70, 48, 28, 255))
    sword(56, 80, math.radians(-58), (220, 225, 235, 255))
    sword(72, 80, math.radians(-122), (200, 205, 220, 255))
    # destellos
    for (sx, sy) in ((30, 30), (98, 36), (34, 100), (96, 98)):
        draw_disc(img, sx, sy, 2, (255, 230, 150, 255))
    # titulo (barra inferior)
    draw_rect(img, 18, 108, 110, 116, (0, 0, 0, 90))
    return s, s, img

# ================================================================= WRITE ALL
if __name__ == "__main__":
    print("Generando texturas ROM PvP Zones...")

    w, h, im = item_zone_wand(); write_png(f"{RP}/textures/items/zone_wand.png", w, h, im)

    ICONS = {
        "create": ((70, 210, 120), sym_plus),
        "info":   ((70, 150, 245), sym_info),
        "delete": ((240, 85, 95), sym_trash),
        "wand":   ((170, 90, 210), sym_wand),
        "pos":    ((245, 165, 60), sym_pos),
        "help":   ((120, 130, 150), sym_help),
    }
    for name, (base, sym) in ICONS.items():
        c1 = lighten(base, 0.18); c2 = darken(base, 0.42); bd = lighten(base, 0.5)
        fn = (lambda s: (lambda img, size: shape(img, size, s)))(sym)
        im = tile(64, c1, c2, bd, symbol=fn)
        write_png(f"{RP}/textures/rom_ui/icon_{name}.png", 64, 64, im)

    w, h, im = pack_icon()
    write_png(f"{RP}/pack_icon.png", w, h, im)
    write_png(f"{BP}/pack_icon.png", w, h, im)

    print("Listo.")
