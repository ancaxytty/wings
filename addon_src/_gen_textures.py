#!/usr/bin/env python3
"""Generador de texturas PNG (RGBA) - The Search MCPE v4.
Motor profesional: degradados, bisel, brillo (gloss), bordes redondeados
y placas, estilo "tiles" del menu de CubeCraft. Sin dependencias externas.
"""
import struct, zlib, os, math

RP = "wings_search_RP"
BP = "wings_search_BP"

# ------------------------------------------------------------------ PNG IO
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

def draw_rect(img, x0, y0, x1, y1, color):
    h = len(img); w = len(img[0])
    for y in range(max(0, int(y0)), min(h, int(y1))):
        for x in range(max(0, int(x0)), min(w, int(x1))):
            img[y][x] = [color[0], color[1], color[2], color[3] if len(color) > 3 else 255]

def draw_disc(img, cx, cy, r, color):
    h = len(img); w = len(img[0])
    for y in range(max(0, int(cy - r)), min(h, int(cy + r + 1))):
        for x in range(max(0, int(cx - r)), min(w, int(cx + r + 1))):
            if (x - cx) ** 2 + (y - cy) ** 2 <= r * r:
                img[y][x] = [color[0], color[1], color[2], color[3] if len(color) > 3 else 255]

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

# ------------------------------------------------------------------ color helpers
def clamp(v): return max(0, min(255, int(v)))
def mix(c1, c2, t): return (c1[0] + (c2[0] - c1[0]) * t, c1[1] + (c2[1] - c1[1]) * t, c1[2] + (c2[2] - c1[2]) * t)
def lighten(c, f): return mix(c, (255, 255, 255), f)
def darken(c, f): return mix(c, (0, 0, 0), f)

# ------------------------------------------------------------------ rounded-rect coverage (cache)
_cov_cache = {}
def get_cov(size, inset, radius, ss=3):
    key = (size, inset, round(radius, 2), ss)
    if key in _cov_cache:
        return _cov_cache[key]
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
    _cov_cache[key] = cov
    return cov

# ------------------------------------------------------------------ professional tile
def compose_tile(size, c1, c2, border, symbol=None, plate=False, grad="diag"):
    rad = size * 0.18
    bw = max(3, int(size * 0.045))
    full = get_cov(size, 0, rad)
    inner = get_cov(size, bw, rad - bw)
    img = blank(size, size)
    for y in range(size):
        for x in range(size):
            a = full[y][x]
            if a <= 0:
                continue
            t = (x + y) / (2.0 * (size - 1)) if grad == "diag" else y / (size - 1)
            r, g, b = mix(c1, c2, t)
            dx = (x - size / 2) / (size / 2); dy = (y - size / 2) / (size / 2)
            vig = 1 - 0.20 * min(1.0, dx * dx + dy * dy)
            r *= vig; g *= vig; b *= vig
            if inner[y][x] < 0.55:
                d = ((x + y) - size) / float(size)      # -1 (arriba-izq) .. 1
                bf = 1.18 - 0.55 * d
                r, g, b = border[0] * bf, border[1] * bf, border[2] * bf
            else:
                if y < size * 0.5:
                    gl = (1 - y / (size * 0.5)) * 0.22
                    r += 255 * gl; g += 255 * gl; b += 255 * gl
            img[y][x] = [clamp(r), clamp(g), clamp(b), clamp(255 * a)]
    if plate:
        pl = get_cov(size, int(size * 0.17), rad * 0.55)
        for y in range(size):
            for x in range(size):
                if pl[y][x] > 0:
                    blend(img, x, y, (16, 18, 26), 0.42 * pl[y][x])
    if symbol:
        symbol(img, size)
    return img

# ------------------------------------------------------------------ Heads pixel data
PAL = {
    '.': None, ' ': None,
    'K': (24, 20, 26), 'W': (236, 239, 246), 'R': (201, 42, 47), 'r': (150, 28, 32),
    'G': (74, 168, 86), 'g': (44, 112, 54), 'O': (228, 132, 32), 'o': (182, 96, 18),
    'B': (120, 182, 236), 'b': (70, 122, 192), 'P': (146, 84, 184), 'Y': (242, 212, 82),
    'S': (227, 182, 142), 'N': (120, 80, 45), 'n': (82, 52, 28), 'C': (172, 222, 242),
    'A': (96, 122, 80), 'V': (240, 196, 80), 'L': (200, 198, 196), 'D': (70, 70, 74),
    'E': (216, 200, 188), 'h': (120, 30, 30), 'Q': (250, 222, 70), 'q': (208, 168, 40),
    'i': (90, 150, 210),
}

HEADS = [
    ("halloween", "Halloween", (230, 126, 28), (150, 84, 16), [
        "..oooo..", ".oKKKKo.", "oKKooKKo", "ooKooKoo",
        "oo.oo.oo", "oKKKKKKo", "oKoKKoKo", ".oKKKKo."]),
    ("navidad", "Arbol", (38, 104, 50), (32, 86, 42), [
        "...Y....", "...G....", "..GGG...", ".GGRGG..",
        ".GRGGG..", "GGGGGYG.", "GGYGGGG.", "...NN..."]),
    ("santa", "Santa", (228, 184, 146), (190, 36, 42), [
        "RRRRRRRR", "rRRRRRRW", "WWWWWWWW", "SSKSSKSS",
        "SSSSSSSS", "SWWWWWWS", ".WWWWWW.", "..WWWW.."]),
    ("frozen", "Frozen", (150, 210, 240), (96, 168, 226), [
        "..bBBb..", ".BCCCCB.", "BCCCCCCB", "BCKCCKCB",
        "BCCCCCCB", ".BCCCCB.", "..BCCB..", "...BB..."]),
    ("olaf", "Olaf", (238, 241, 248), (210, 220, 232), [
        "..WWWW..", ".WWWWWW.", "WWKWWKWW", "WWWOOWWW",
        "WWWWWWWW", "W.KKKK.W", "WWWWWWWW", ".WWWWWW."]),
    ("fantasma", "Fantasma", (232, 236, 245), (200, 208, 224), [
        "..WWWW..", ".WWWWWW.", "WWWWWWWW", "WKKWWKKW",
        "WWWWWWWW", "WWKKKKWW", "WWWWWWWW", "W.WW.WW."]),
    ("esqueleto", "Esqueleto", (226, 230, 238), (188, 196, 212), [
        ".WWWWWW.", "WWWWWWWW", "WKKWWKKW", "WKKWWKKW",
        "WWWKKWWW", "WWWWWWWW", "WKWKWKWW", ".WWWWWW."]),
    ("reno", "Reno", (126, 84, 46), (88, 56, 30), [
        "n.n..n.n", ".nNNNNn.", "..NNNN..", ".NKNNKN.",
        ".NNNNNN.", "..NNNN..", "..NRRN..", "...NN..."]),
    ("munieco", "Munieco", (240, 243, 250), (24, 22, 30), [
        "KKKKKKKK", ".KKKKKK.", "WWWWWWWW", "WKWWWKWW",
        "WWWOWWWW", "WWWWWWWW", "W.KKKK.W", ".WWWWWW."]),
    ("regalo", "Regalo", (206, 44, 50), (236, 206, 78), [
        "RRRYYRRR", "RRRYYRRR", "YYYYYYYY", "RRRYYRRR",
        "RRRYYRRR", "RRRYYRRR", "YYYYYYYY", "RRRYYRRR"]),
    ("zombie", "Zombie", (78, 162, 80), (50, 110, 56), [
        ".gggggg.", "gggggggg", "gKKggKKg", "gggggggg",
        "ggKKKKgg", "gggggggg", "gKgggKgg", ".gggggg."]),
    ("bruja", "Bruja", (88, 158, 92), (140, 80, 178), [
        "...PP...", "..PPPP..", ".PPPPPP.", "PPPPPPPP",
        ".GKGGKG.", ".GGGGGG.", ".GGNNGG.", "..GGGG.."]),
    ("masterchief", "Master Chief", (84, 110, 70), (60, 84, 50), [
        "..AAAA..", ".AAAAAA.", "AAAAAAAA", "AVVVVVVA",
        "AVKKKKVA", "AAAAAAAA", ".AAAAAA.", "..AAAA.."]),
    ("godofwar", "God of War", (216, 200, 188), (150, 36, 36), [
        "EEEEEEEE", "RREEEEEE", "ERREKEEE", "EERREEEE",
        "EEEEEEEE", "EKKKKKKE", "KKKKKKKK", "EKKKKKKE"]),
    ("gearsofwar", "Gears of War", (120, 30, 30), (90, 20, 20), [
        "hhWWWWhh", "hWWWWWWh", "WWKWWKWW", "WWWWWWWW",
        "WWKKKKWW", "hWWWWWWh", "hhWKKWhh", "hhhWWhhh"]),
    ("bobesponja", "Bob Esponja", (250, 222, 70), (208, 168, 40), [
        "QQQQQQQQ", "QWWQQWWQ", "QWiQQiWQ", "QQqQQqQQ",
        "QKKKKKKQ", "QKWWWWKQ", "QKKKKKKQ", "QQQQQQQQ"]),
]

def paint_face_scaled(img, size, base, rows, shadow=True):
    face_px = int(size * 0.52)
    cell = max(2, face_px // 8)
    ox = (size - cell * 8) // 2
    oy = int(size * 0.20)
    if shadow:
        for gy in range(8):
            for gx in range(8):
                col = PAL.get(rows[gy][gx]) or base
                if PAL.get(rows[gy][gx]) is None and rows[gy][gx] in ('.', ' '):
                    col = base
                draw_rect(img, ox + gx * cell + 2, oy + gy * cell + 2,
                          ox + (gx + 1) * cell + 2, oy + (gy + 1) * cell + 2, (8, 8, 12, 150))
    for gy in range(8):
        for gx in range(8):
            ch = rows[gy][gx]
            col = PAL.get(ch)
            if col is None:
                col = base
            draw_rect(img, ox + gx * cell, oy + gy * cell, ox + (gx + 1) * cell, oy + (gy + 1) * cell,
                      (col[0], col[1], col[2], 255))

# ------------------------------------------------------------------ symbols (white w/ shadow)
def _shape(img, size, fn, col=(245, 248, 255)):
    fn(img, size, (10, 12, 18, 150), 3)   # sombra
    fn(img, size, col + (255,), 0)        # figura

def sym_plus(img, size, col, off):
    cx = size // 2 + off; cy = int(size * 0.52) + off
    t = int(size * 0.09); L = int(size * 0.26)
    draw_rect(img, cx - t, cy - L, cx + t, cy + L, col)
    draw_rect(img, cx - L, cy - t, cx + L, cy + t, col)

def sym_search(img, size, col, off):
    cx = int(size * 0.44) + off; cy = int(size * 0.44) + off; r = int(size * 0.17)
    draw_disc(img, cx, cy, r, col)
    draw_disc(img, cx, cy, r - max(3, size // 24), (col[0] // 4, col[1] // 4, col[2] // 5, col[3] if len(col) > 3 else 255))
    for i in range(int(size * 0.22)):
        draw_rect(img, cx + r + i - 2, cy + r + i - 2, cx + r + i + 4, cy + r + i + 4, col)

def sym_help(img, size, col, off):
    cx = size // 2 + off; cy = int(size * 0.5) + off; s = max(3, int(size * 0.07))
    draw_rect(img, cx - 2 * s, cy - 3 * s, cx + 2 * s, cy - s, col)
    draw_rect(img, cx + s, cy - 2 * s, cx + 2 * s, cy + s, col)
    draw_rect(img, cx - s, cy, cx + 2 * s, cy + s, col)
    draw_rect(img, cx - s, cy + s, cx, cy + 2 * s, col)
    draw_rect(img, cx - s, cy + 3 * s, cx + s, cy + 4 * s, col)

def sym_reload(img, size, col, off):
    cx = size // 2 + off; cy = int(size * 0.52) + off; R = int(size * 0.22)
    for a in range(35, 320):
        rad = a * math.pi / 180
        draw_disc(img, cx + R * math.cos(rad), cy + R * math.sin(rad), max(2, size // 26), col)
    draw_rect(img, cx + R - 2, cy - R - 6, cx + R + 10, cy - R + 6, col)

def sym_trash(img, size, col, off):
    cx = size // 2 + off; cy = int(size * 0.5) + off; w = int(size * 0.20)
    draw_rect(img, cx - w, cy - int(size * 0.16), cx + w, cy + int(size * 0.24), col)
    draw_rect(img, cx - w - 4, cy - int(size * 0.22), cx + w + 4, cy - int(size * 0.14), col)
    draw_rect(img, cx - 6, cy - int(size * 0.30), cx + 6, cy - int(size * 0.22), col)
    dk = (col[0] // 4, col[1] // 5, col[2] // 5, col[3] if len(col) > 3 else 255)
    for ox in (-int(size * 0.09), 0, int(size * 0.09)):
        draw_rect(img, cx + ox - 2, cy - int(size * 0.10), cx + ox + 2, cy + int(size * 0.18), dk)

def sym_place(img, size, col, off):
    cx = size // 2 + off; cy = int(size * 0.42) + off
    # flecha hacia abajo
    t = max(3, int(size * 0.07))
    draw_rect(img, cx - t, cy - int(size * 0.18), cx + t, cy + int(size * 0.12), col)
    for i in range(int(size * 0.14)):
        draw_rect(img, cx - int(size * 0.14) + i, cy + int(size * 0.10) + i,
                  cx + int(size * 0.14) - i, cy + int(size * 0.10) + i + 3, col)
    # base / slot
    draw_rect(img, cx - int(size * 0.20), cy + int(size * 0.30), cx + int(size * 0.20), cy + int(size * 0.40), col)

# ------------------------------------------------------------------ panels / close / pack
def make_panel(hover=False):
    size = 96
    rad = 16; bw = 4
    full = get_cov(size, 0, rad)
    inner = get_cov(size, bw, rad - bw)
    if not hover:
        top = (34, 40, 60); bot = (10, 12, 20); bd = (96, 120, 180); acc = (130, 165, 235)
    else:
        top = (60, 76, 112); bot = (24, 30, 48); bd = (150, 190, 255); acc = (190, 215, 255)
    img = blank(size, size)
    for y in range(size):
        for x in range(size):
            a = full[y][x]
            if a <= 0:
                continue
            t = y / (size - 1)
            r, g, b = mix(top, bot, t)
            if inner[y][x] < 0.55:
                d = ((x + y) - size) / float(size)
                bf = 1.2 - 0.55 * d
                r, g, b = bd[0] * bf, bd[1] * bf, bd[2] * bf
            img[y][x] = [clamp(r), clamp(g), clamp(b), clamp(255 * a)]
    # sheen superior
    for y in range(bw, int(size * 0.34)):
        for x in range(bw, size - bw):
            if inner[y][x] > 0.5:
                blend(img, x, y, (255, 255, 255), 0.10 * (1 - y / (size * 0.34)))
    # corchetes de esquina (acento)
    Lc = 16
    for i in range(bw + 1, bw + Lc):
        for (ax, ay) in ((i, bw + 1), (bw + 1, i), (size - 2 - i, bw + 1), (bw + 1, size - 2 - i),
                          (i, size - bw - 2), (size - bw - 2, i), (size - 2 - i, size - bw - 2), (size - bw - 2, size - 2 - i)):
            blend(img, ax, ay, acc, 0.85)
    return size, size, img

def make_close(hover=False):
    base = (212, 64, 64) if not hover else (250, 120, 120)
    c1 = lighten(base, 0.20); c2 = darken(base, 0.40); bd = lighten(base, 0.45)
    def x_sym(img, size):
        cx = size // 2; cy = size // 2; L = int(size * 0.26); t = max(3, int(size * 0.08))
        for s in (1, -1):
            for d in range(-L, L):
                for k in range(-t, t):
                    draw_rect(img, cx + d, cy + s * d + k, cx + d + 1, cy + s * d + k + 1, (10, 12, 18, 140))
        for s in (1, -1):
            for d in range(-L, L):
                for k in range(-t, t):
                    draw_rect(img, cx + d - 1, cy + s * d + k - 1, cx + d, cy + s * d + k, (255, 255, 255, 255))
    return 40, 40, compose_tile(40, c1, c2, bd, symbol=x_sym)

def make_pack_icon():
    size = 128
    img = compose_tile(size, (40, 52, 84), (12, 14, 22), (120, 150, 220))
    # cabeza calabaza
    draw_disc(img, 54, 74, 28, (228, 132, 32, 255))
    draw_disc(img, 54, 74, 28, (228, 132, 32, 255))
    for y in range(46, 102):
        for x in range(26, 82):
            if (x - 54) ** 2 + (y - 74) ** 2 <= 28 * 28 and y < 60:
                blend(img, x, y, (255, 255, 255), 0.10)
    draw_rect(img, 40, 64, 50, 74, (24, 20, 26, 255))
    draw_rect(img, 58, 64, 68, 74, (24, 20, 26, 255))
    draw_rect(img, 44, 84, 64, 90, (24, 20, 26, 255))
    draw_rect(img, 48, 90, 52, 94, (24, 20, 26, 255))
    draw_rect(img, 58, 90, 62, 94, (24, 20, 26, 255))
    # lupa
    draw_disc(img, 92, 42, 19, (235, 240, 255, 255))
    draw_disc(img, 92, 42, 14, (70, 120, 200, 255))
    draw_disc(img, 92, 42, 9, (150, 195, 255, 255))
    blend_disc = (210, 220, 245, 255)
    for i in range(0, 24):
        draw_rect(img, 104 + i - 3, 54 + i - 3, 104 + i + 4, 54 + i + 4, blend_disc)
    for (sx, sy) in ((24, 30), (110, 96), (30, 104)):
        draw_disc(img, sx, sy, 2, (255, 240, 150, 255))
    return size, size, img

# ------------------------------------------------------------------ block skins (pixel, 64px)
def make_head_skin_hd(theme):
    # Textura HD 128x128 con layout por caras (up/face/down) para geometria con UV por cara.
    # La cara se renderiza desde el arte 8x8 escalado x2 con sombreado y contorno (AO).
    _key, _name, base, top, rows = theme
    W = H = 128
    img = blank(W, H, (0, 0, 0, 0))
    topc = lighten(top, 0.18); topc2 = lighten(top, 0.02)
    botc = darken(base, 0.46)
    # UP tile en (0,0)
    for y in range(16):
        for x in range(16):
            c = mix(topc, topc2, y / 15.0)
            img[y][x] = [clamp(c[0]), clamp(c[1]), clamp(c[2]), 255]
    for x in range(16):
        blend(img, x, 0, (255, 255, 255), 0.20)
    # DOWN tile en (32,0)
    for y in range(16):
        for x in range(16):
            img[y][32 + x] = [clamp(botc[0]), clamp(botc[1]), clamp(botc[2]), 255]
    # FACE tile en (16,16)
    ox, oy = 16, 16
    for ty in range(16):
        for tx in range(16):
            sx = tx // 2; sy = ty // 2
            ch = rows[sy][sx]
            col = PAL.get(ch)
            bgmode = col is None
            if bgmode:
                col = base
            sh = 1.0 - 0.05 * sy
            r, g, b = col[0] * sh, col[1] * sh, col[2] * sh
            if bgmode and sy < 2:
                r += 22; g += 22; b += 22
            if tx % 2 == 1 and sx + 1 < 8 and rows[sy][sx + 1] != ch:
                r *= 0.78; g *= 0.78; b *= 0.78
            if ty % 2 == 1 and sy + 1 < 8 and rows[sy + 1][sx] != ch:
                r *= 0.82; g *= 0.82; b *= 0.82
            img[oy + ty][ox + tx] = [clamp(r), clamp(g), clamp(b), 255]
    # marco sutil de la cara
    for i in range(16):
        blend(img, ox + i, oy, (0, 0, 0), 0.12)
        blend(img, ox + i, oy + 15, (0, 0, 0), 0.20)
        blend(img, ox, oy + i, (0, 0, 0), 0.12)
        blend(img, ox + 15, oy + i, (0, 0, 0), 0.20)
    return W, H, img

def make_holo():
    return 8, 8, blank(8, 8, (0, 0, 0, 0))

# ------------------------------------------------------------------ particle atlas
def make_particle_atlas():
    w, h = 32, 16
    img = blank(w, h)
    cx, cy = 8, 8
    draw_disc(img, cx, cy, 3, (255, 255, 255, 255))
    for d in range(1, 7):
        for (dx, dy) in ((d, 0), (-d, 0), (0, d), (0, -d), (d, d), (-d, -d), (d, -d), (-d, d)):
            x, y = cx + dx, cy + dy
            if 0 <= x < 16 and 0 <= y < h:
                a = max(40, 255 - d * 32)
                img[y][x] = [255, 245, 180, a]
    draw_disc(img, cx, cy, 1, (200, 230, 255, 255))
    fx = 24
    for y in range(h):
        t = y / (h - 1)
        rad = int(1 + 5 * (1 - t))
        if y < 3:
            rad = max(0, rad - 2)
        for dx in range(-rad, rad + 1):
            x = fx + dx
            if 16 <= x < w:
                if abs(dx) >= rad - 1 and t < 0.7:
                    col = (255, 90, 20, 235)
                elif t < 0.35:
                    col = (255, 230, 90, 255)
                else:
                    col = (240, 140, 30, 245)
                img[y][x] = list(col)
    return w, h, img

# ================================================================== WRITE ALL
# Tiles de accion (estilo CubeCraft)
ACTION = {
    "create": ((70, 210, 120), sym_plus),
    "review": ((70, 150, 245), sym_search),
    "help":   ((175, 115, 240), sym_help),
    "reload": ((60, 205, 205), sym_reload),
    "delete": ((240, 85, 95), sym_trash),
    "place":  ((245, 165, 60), sym_place),
}
for name, (base, sym) in ACTION.items():
    c1 = lighten(base, 0.18); c2 = darken(base, 0.42); bd = lighten(base, 0.5)
    fn = (lambda s: (lambda img, size: _shape(img, size, s)))(sym)
    img = compose_tile(96, c1, c2, bd, symbol=fn)
    write_png(f"{RP}/textures/custom_ui/icon_{name}.png", 96, 96, img)

# Tiles de cabezas (galeria / botones)
for n, theme in enumerate(HEADS):
    _k, _name, base, top, rows = theme
    c1 = lighten(top, 0.28); c2 = darken(top, 0.50); bd = lighten(top, 0.55)
    sym = (lambda b, r: (lambda img, size: paint_face_scaled(img, size, b, r)))(base, rows)
    tile = compose_tile(96, c1, c2, bd, symbol=sym, plate=True)
    write_png(f"{RP}/textures/custom_ui/heads/h{n}.png", 96, 96, tile)
    # skin pixel del bloque/entidad (HD 128)
    sw, sh, si = make_head_skin_hd(theme)
    write_png(f"{RP}/textures/entity/heads/h{n}.png", sw, sh, si)

# Paneles / close / pack
pw, ph, pi = make_panel(False); write_png(f"{RP}/textures/custom_ui/custom_bg.png", pw, ph, pi)
pw, ph, pi = make_panel(True);  write_png(f"{RP}/textures/custom_ui/custom_bg_hover.png", pw, ph, pi)
cw, ch, ci = make_close(False); write_png(f"{RP}/textures/custom_ui/close_button.png", cw, ch, ci)
cw, ch, ci = make_close(True);  write_png(f"{RP}/textures/custom_ui/close_button_hover.png", cw, ch, ci)
iw, ih, ii = make_pack_icon();  write_png(f"{RP}/pack_icon.png", iw, ih, ii)
write_png(f"{BP}/pack_icon.png", iw, ih, ii)

# Entidad/particula
sw, sh, si = make_head_skin_hd(HEADS[0]); write_png(f"{RP}/textures/entity/wings_head.png", sw, sh, si)
hw, hh, hi = make_holo(); write_png(f"{RP}/textures/entity/wings_hologram.png", hw, hh, hi)
aw, ah, ai = make_particle_atlas(); write_png(f"{RP}/textures/particle/wings_particles.png", aw, ah, ai)

print("Texturas v4 PRO generadas:", len(HEADS), "cabezas + tiles de accion + panel + close + pack_icon")
