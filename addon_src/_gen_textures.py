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
def make_head_skin(theme):
    # Net COMPLETO box-uv en 64x64 (visible desde todos los angulos, robusto).
    # Caras: top/bottom/right/front/left/back con sombreado; rasgos en la frontal.
    _key, _name, base, top, rows = theme
    w = h = 64
    img = blank(w, h)

    def fill(x0, y0, x1, y1, col):
        draw_rect(img, x0, y0, x1, y1, (clamp(col[0]), clamp(col[1]), clamp(col[2]), 255))

    topc = lighten(top, 0.16)
    botc = darken(base, 0.44)
    rightc = darken(base, 0.10)
    frontc = base
    leftc = darken(base, 0.18)
    backc = darken(base, 0.30)
    fill(8, 0, 16, 8, topc)      # top
    fill(16, 0, 24, 8, botc)     # bottom
    fill(0, 8, 8, 16, rightc)    # right
    fill(8, 8, 16, 16, frontc)   # front
    fill(16, 8, 24, 16, leftc)   # left
    fill(24, 8, 32, 16, backc)   # back
    # sombreado vertical en la cara frontal
    for y in range(8, 16):
        for x in range(8, 16):
            sh = 1.0 - 0.045 * (y - 8)
            px = img[y][x]
            img[y][x] = [clamp(px[0] * sh), clamp(px[1] * sh), clamp(px[2] * sh), 255]
    # rasgos de la cara frontal ('.'/' ' = fondo)
    for gy in range(8):
        for gx in range(8):
            ch = rows[gy][gx]
            col = PAL.get(ch)
            if col is None:
                continue
            img[8 + gy][8 + gx] = [col[0], col[1], col[2], 255]
    # contorno/AO: oscurece bordes entre color y fondo en la cara frontal
    for gy in range(8):
        for gx in range(8):
            ch = rows[gy][gx]
            if PAL.get(ch) is None:
                continue
            for (dx, dy) in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                ny, nx = gy + dy, gx + dx
                if 0 <= ny < 8 and 0 <= nx < 8 and PAL.get(rows[ny][nx]) is None:
                    px = img[8 + ny][8 + nx]
                    img[8 + ny][8 + nx] = [clamp(px[0] * 0.7), clamp(px[1] * 0.7), clamp(px[2] * 0.7), 255]
    # brillo borde superior del techo
    for x in range(8, 16):
        blend(img, x, 0, (255, 255, 255), 0.16)
    return w, h, img

def make_holo():
    return 8, 8, blank(8, 8, (0, 0, 0, 0))

# ------------------------------------------------------------------ particle atlas (64x64, rejilla 4x4 de 16px)
def make_particle_atlas():
    w = h = 64
    img = blank(w, h)

    def cell(cx, cy):
        return cx * 16, cy * 16

    def disc(ox, oy, cx, cy, r, col):
        for y in range(16):
            for x in range(16):
                if (x - cx) ** 2 + (y - cy) ** 2 <= r * r:
                    img[oy + y][ox + x] = list(col)

    def px(ox, oy, x, y, col):
        if 0 <= x < 16 and 0 <= y < 16:
            img[oy + y][ox + x] = list(col)

    # (0,0) destello/sparkle (blanco-amarillo) -> burst tintable
    ox, oy = cell(0, 0)
    disc(ox, oy, 8, 8, 3, (255, 255, 255, 255))
    for d in range(1, 8):
        for (dx, dy) in ((d, 0), (-d, 0), (0, d), (0, -d), (d, d), (-d, -d), (d, -d), (-d, d)):
            px(ox, oy, 8 + dx, 8 + dy, (255, 248, 200, max(40, 255 - d * 30)))
    disc(ox, oy, 8, 8, 1, (255, 255, 255, 255))

    # (1,0) corazon (rojo)
    ox, oy = cell(1, 0)
    heart = ["..XX.XX.", ".XXXXXXX", ".XXXXXXX", "..XXXXX.", "...XXX..", "....X..."]
    for j, row in enumerate(heart):
        for i, c in enumerate(row):
            if c == "X":
                px(ox, oy, i + 4, j + 4, (230, 40, 70, 255))

    # (2,0) estrella 5 puntas (amarilla)
    ox, oy = cell(2, 0)
    import math as _m
    pts = []
    for k in range(10):
        a = -_m.pi / 2 + k * _m.pi / 5
        rr = 7 if k % 2 == 0 else 3
        pts.append((8 + rr * _m.cos(a), 8 + rr * _m.sin(a)))
    for y in range(16):
        for x in range(16):
            inside = False
            jp = len(pts) - 1
            for ip in range(len(pts)):
                xi, yi = pts[ip]; xj, yj = pts[jp]
                if ((yi > y) != (yj > y)) and (x < (xj - xi) * (y - yi) / (yj - yi + 1e-9) + xi):
                    inside = not inside
                jp = ip
            if inside:
                px(ox, oy, x, y, (255, 214, 70, 255))

    # (3,0) copo de nieve (blanco/cyan)
    ox, oy = cell(3, 0)
    for d in range(-6, 7):
        px(ox, oy, 8 + d, 8, (210, 240, 255, 255))
        px(ox, oy, 8, 8 + d, (210, 240, 255, 255))
        px(ox, oy, 8 + d, 8 + d, (170, 220, 255, 255))
        px(ox, oy, 8 + d, 8 - d, (170, 220, 255, 255))

    # (0,1) llama (naranja) -> torch
    ox, oy = cell(0, 1)
    for y in range(16):
        t = y / 15.0
        r = int(1 + 6 * (1 - t))
        for dx in range(-r, r + 1):
            if t < 0.35:
                col = (255, 232, 90, 255)
            elif abs(dx) >= r - 1:
                col = (255, 90, 20, 235)
            else:
                col = (240, 140, 30, 245)
            px(ox, oy, 8 + dx, y, col)

    # (1,1) magia (morado swirl)
    ox, oy = cell(1, 1)
    disc(ox, oy, 8, 8, 6, (150, 90, 210, 230))
    disc(ox, oy, 8, 8, 3, (210, 160, 255, 255))

    # (2,1) confeti (blanco, se tinta)
    ox, oy = cell(2, 1)
    for y in range(3, 13):
        for x in range(3, 13):
            px(ox, oy, x, y, (255, 255, 255, 255))

    # (3,1) humo (gris suave)
    ox, oy = cell(3, 1)
    for y in range(16):
        for x in range(16):
            d = (x - 8) ** 2 + (y - 8) ** 2
            if d <= 49:
                a = int(200 * (1 - d / 49.0))
                px(ox, oy, x, y, (180, 180, 188, max(0, a)))

    # (0,2) ender (diamante morado)
    ox, oy = cell(0, 2)
    for j in range(8):
        wj = j if j < 4 else 7 - j
        for x in range(-wj, wj + 1):
            px(ox, oy, 8 + x, 4 + j, (170, 70, 220, 255))

    # (1,2) nota musical (blanca)
    ox, oy = cell(1, 2)
    disc(ox, oy, 6, 11, 2, (245, 245, 250, 255))
    for y in range(3, 11):
        px(ox, oy, 8, y, (245, 245, 250, 255))
    for x in range(8, 12):
        px(ox, oy, x, 3, (245, 245, 250, 255))

    # (2,2) burbuja (anillo azul)
    ox, oy = cell(2, 2)
    for y in range(16):
        for x in range(16):
            d = (x - 8) ** 2 + (y - 8) ** 2
            if 25 <= d <= 49:
                px(ox, oy, x, y, (140, 200, 255, 230))
    px(ox, oy, 6, 6, (255, 255, 255, 255))

    # (3,2) sparkle plus (blanco)
    ox, oy = cell(3, 2)
    for d in range(-6, 7):
        px(ox, oy, 8 + d, 8, (255, 255, 255, max(60, 255 - abs(d) * 30)))
        px(ox, oy, 8, 8 + d, (255, 255, 255, max(60, 255 - abs(d) * 30)))

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
    # skin del bloque/entidad (net box-uv 64, visible)
    sw, sh, si = make_head_skin(theme)
    write_png(f"{RP}/textures/entity/heads/h{n}.png", sw, sh, si)

# Paneles / close / pack
pw, ph, pi = make_panel(False); write_png(f"{RP}/textures/custom_ui/custom_bg.png", pw, ph, pi)
pw, ph, pi = make_panel(True);  write_png(f"{RP}/textures/custom_ui/custom_bg_hover.png", pw, ph, pi)
cw, ch, ci = make_close(False); write_png(f"{RP}/textures/custom_ui/close_button.png", cw, ch, ci)
cw, ch, ci = make_close(True);  write_png(f"{RP}/textures/custom_ui/close_button_hover.png", cw, ch, ci)
iw, ih, ii = make_pack_icon();  write_png(f"{RP}/pack_icon.png", iw, ih, ii)
write_png(f"{BP}/pack_icon.png", iw, ih, ii)

# Entidad/particula
sw, sh, si = make_head_skin(HEADS[0]); write_png(f"{RP}/textures/entity/wings_head.png", sw, sh, si)
hw, hh, hi = make_holo(); write_png(f"{RP}/textures/entity/wings_hologram.png", hw, hh, hi)
aw, ah, ai = make_particle_atlas(); write_png(f"{RP}/textures/particle/wings_particles.png", aw, ah, ai)

print("Texturas v4 PRO generadas:", len(HEADS), "cabezas + tiles de accion + panel + close + pack_icon")



# ================================================================== v7.2.1 celebration atlas
# Atlas 64x64 (rejilla 4x4 de 16px) para las 3 animaciones 3D:
#   fila 0 = DULCES, fila 1 = VOLCAN, fila 2 = SANTA/NAVIDAD
def make_celebration_atlas():
    w = h = 64
    img = blank(w, h)

    def cell(cx, cy):
        return cx * 16, cy * 16

    def P(ox, oy, x, y, col):
        if 0 <= x < 16 and 0 <= y < 16:
            img[oy + y][ox + x] = [clamp(col[0]), clamp(col[1]), clamp(col[2]),
                                   clamp(col[3]) if len(col) > 3 else 255]

    def DISC(ox, oy, cx, cy, r, col):
        for y in range(16):
            for x in range(16):
                if (x - cx) ** 2 + (y - cy) ** 2 <= r * r:
                    P(ox, oy, x, y, col)

    def RECT(ox, oy, x0, y0, x1, y1, col):
        for y in range(int(y0), int(y1)):
            for x in range(int(x0), int(x1)):
                P(ox, oy, x, y, col)

    # ---- (0,0) caramelo envuelto BLANCO (tintable por el script) ----
    ox, oy = cell(0, 0)
    DISC(ox, oy, 8, 8, 4, (255, 255, 255, 255))           # cuerpo
    # extremos retorcidos
    for dx in (-1, 1):
        P(ox, oy, 8 + dx * 6, 6, (255, 255, 255, 230))
        P(ox, oy, 8 + dx * 6, 9, (255, 255, 255, 230))
        P(ox, oy, 8 + dx * 7, 7, (255, 255, 255, 200))
        P(ox, oy, 8 + dx * 7, 8, (255, 255, 255, 200))
    DISC(ox, oy, 6, 6, 1, (255, 255, 255, 255))           # brillo
    DISC(ox, oy, 8, 8, 2, (240, 240, 245, 255))

    # ---- (1,0) caramelo "candy corn" (blanco/naranja/amarillo) ----
    ox, oy = cell(1, 0)
    for y in range(2, 14):
        t = (y - 2) / 12.0
        half = int(1 + 6 * t)
        if t < 0.34:
            col = (255, 255, 255, 255)
        elif t < 0.7:
            col = (245, 150, 40, 255)
        else:
            col = (250, 215, 70, 255)
        RECT(ox, oy, 8 - half, y, 8 + half, y + 1, col)

    # ---- (2,0) paleta/lollipop (espiral rojo-blanco) ----
    ox, oy = cell(2, 0)
    for y in range(16):
        for x in range(16):
            d = (x - 7) ** 2 + (y - 6) ** 2
            if d <= 30:
                ang = math.atan2(y - 6, x - 7)
                sp = (ang * 2 + math.sqrt(d) * 0.9)
                col = (230, 45, 55, 255) if (int(sp) % 2 == 0) else (250, 250, 250, 255)
                P(ox, oy, x, y, col)
    RECT(ox, oy, 7, 10, 9, 16, (235, 235, 240, 255))      # palito

    # ---- (3,0) gomita/gumdrop BLANCA (tintable) ----
    ox, oy = cell(3, 0)
    for y in range(4, 14):
        t = (y - 4) / 10.0
        half = int(2 + 5 * t)
        RECT(ox, oy, 8 - half, y, 8 + half, y + 1, (255, 255, 255, 255))
    DISC(ox, oy, 6, 6, 1, (255, 255, 255, 255))           # brillo

    # ---- (0,1) lava (amarillo->naranja->rojo) ----
    ox, oy = cell(0, 1)
    DISC(ox, oy, 8, 8, 7, (210, 40, 12, 255))
    DISC(ox, oy, 8, 8, 5, (250, 120, 20, 255))
    DISC(ox, oy, 8, 8, 3, (255, 210, 70, 255))
    DISC(ox, oy, 7, 7, 1, (255, 255, 210, 255))

    # ---- (1,1) ascua/ember (punto brillante) ----
    ox, oy = cell(1, 1)
    DISC(ox, oy, 8, 8, 3, (255, 110, 20, 230))
    DISC(ox, oy, 8, 8, 2, (255, 200, 60, 255))
    P(ox, oy, 8, 8, (255, 255, 230, 255))

    # ---- (2,1) roca volcanica (gris oscuro + brasa) ----
    ox, oy = cell(2, 1)
    rock = ["..XXXX..", ".XXXXXX.", "XXXXXXXX", "XXXXXXXX",
            "XXXXXXXX", ".XXXXXX.", ".XXXXXX.", "..XXXX.."]
    for j, row in enumerate(rock):
        for i, c in enumerate(row):
            if c == "X":
                base = (62, 58, 66) if (i + j) % 3 else (78, 72, 80)
                P(ox, oy, i + 4, j + 4, base + (255,))
    P(ox, oy, 7, 8, (220, 90, 30, 255))
    P(ox, oy, 9, 9, (200, 70, 25, 255))

    # ---- (3,1) ceniza/humo (gris suave) ----
    ox, oy = cell(3, 1)
    for y in range(16):
        for x in range(16):
            d = (x - 8) ** 2 + (y - 8) ** 2
            if d <= 49:
                a = int(205 * (1 - d / 49.0))
                P(ox, oy, x, y, (96, 92, 98, max(0, a)))

    # ---- (0,2) gorro de Santa (rojo + ribete blanco + pompon) ----
    ox, oy = cell(0, 2)
    for y in range(3, 12):
        t = (y - 3) / 9.0
        half = int(1 + 6 * t)
        RECT(ox, oy, 8 - half, y, 8 + half, y + 1, (212, 38, 44, 255))
    RECT(ox, oy, 1, 12, 15, 15, (245, 245, 250, 255))     # ribete
    DISC(ox, oy, 8, 3, 2, (250, 250, 252, 255))           # pompon
    P(ox, oy, 6, 6, (245, 120, 120, 255))                 # brillo

    # ---- (1,2) copo/nieve BLANCO suave (tintable) ----
    ox, oy = cell(1, 2)
    for y in range(16):
        for x in range(16):
            d = (x - 8) ** 2 + (y - 8) ** 2
            if d <= 20:
                a = int(255 * (1 - d / 22.0))
                P(ox, oy, x, y, (255, 255, 255, max(0, a)))

    # ---- (2,2) regalo (caja roja + lazo amarillo) ----
    ox, oy = cell(2, 2)
    RECT(ox, oy, 3, 6, 13, 14, (206, 44, 50, 255))        # caja
    RECT(ox, oy, 3, 6, 13, 8, (180, 32, 38, 255))         # tapa
    RECT(ox, oy, 7, 6, 9, 14, (240, 206, 78, 255))        # lazo vertical
    RECT(ox, oy, 3, 9, 13, 11, (240, 206, 78, 255))       # lazo horizontal
    RECT(ox, oy, 5, 3, 7, 6, (240, 206, 78, 255))         # moño izq
    RECT(ox, oy, 9, 3, 11, 6, (240, 206, 78, 255))        # moño der

    # ---- (3,2) estrella/campana dorada ----
    ox, oy = cell(3, 2)
    pts = []
    for k in range(10):
        a = -math.pi / 2 + k * math.pi / 5
        rr = 7 if k % 2 == 0 else 3
        pts.append((8 + rr * math.cos(a), 8 + rr * math.sin(a)))
    for y in range(16):
        for x in range(16):
            inside = False
            jp = len(pts) - 1
            for ip in range(len(pts)):
                xi, yi = pts[ip]; xj, yj = pts[jp]
                if ((yi > y) != (yj > y)) and (x < (xj - xi) * (y - yi) / (yj - yi + 1e-9) + xi):
                    inside = not inside
                jp = ip
            if inside:
                P(ox, oy, x, y, (255, 214, 70, 255))
    DISC(ox, oy, 7, 7, 1, (255, 248, 200, 255))

    return w, h, img

cw2, ch2, ci2 = make_celebration_atlas()
write_png(f"{RP}/textures/particle/wings_celebration.png", cw2, ch2, ci2)
print("Atlas de celebracion v7.2.1 generado: dulces + volcan + santa")
