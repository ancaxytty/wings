#!/usr/bin/env python3
"""Generador de texturas PNG (RGBA) - Logros Custom v1.0.0.
Sin dependencias externas. Produce:
  - item especial (logros_book)
  - 12 medallas a color + 12 versiones "bloqueadas" (gris)
  - botones de UI (tiles estilo pro)
  - fondo custom del server_form (nineslice)
  - pack_icon (RP y BP)
"""
import struct, zlib, os, math

RP = "logros_RP"
BP = "logros_BP"

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

def fill_poly(img, pts, color):
    ys = [p[1] for p in pts]
    y0 = max(0, int(min(ys))); y1 = min(len(img), int(max(ys)) + 1)
    n = len(pts)
    for y in range(y0, y1):
        xs = []
        j = n - 1
        for i in range(n):
            yi = pts[i][1]; yj = pts[j][1]
            if (yi > y) != (yj > y):
                x = (pts[j][0] - pts[i][0]) * (y - yi) / (yj - yi + 1e-9) + pts[i][0]
                xs.append(x)
            j = i
        xs.sort()
        for k in range(0, len(xs) - 1, 2):
            for x in range(max(0, int(xs[k])), min(len(img[0]), int(xs[k + 1]) + 1)):
                img[y][x] = [color[0], color[1], color[2], color[3] if len(color) > 3 else 255]

# ------------------------------------------------------------------ color helpers
def clamp(v): return max(0, min(255, int(v)))
def mix(c1, c2, t): return (c1[0] + (c2[0] - c1[0]) * t, c1[1] + (c2[1] - c1[1]) * t, c1[2] + (c2[2] - c1[2]) * t)
def lighten(c, f): return mix(c, (255, 255, 255), f)
def darken(c, f): return mix(c, (0, 0, 0), f)
def gray(c):
    l = 0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2]
    g = 0.55 * l + 60
    return (g, g, g * 1.02)

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

def compose_tile(size, c1, c2, border, symbol=None, plate=False, grad="diag"):
    rad = size * 0.18
    bw = max(3, int(size * 0.05))
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
                d = ((x + y) - size) / float(size)
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
                    blend(img, x, y, (16, 18, 26), 0.40 * pl[y][x])
    if symbol:
        symbol(img, size)
    return img

# ------------------------------------------------------------------ symbolos (con sombra)
def _shape(img, size, fn, col=(245, 248, 255)):
    fn(img, size, (10, 12, 18, 150), 3)
    fn(img, size, tuple(col) + (255,), 0)

def sym_eye(img, size, col, off):
    cx = size // 2 + off; cy = int(size * 0.5) + off
    rw = int(size * 0.26); rh = int(size * 0.15)
    for y in range(-rh, rh + 1):
        for x in range(-rw, rw + 1):
            if (x / rw) ** 2 + (y / rh) ** 2 <= 1:
                img_set(img, cx + x, cy + y, col)
    draw_disc(img, cx, cy, int(size * 0.10), (20, 24, 34, col[3] if len(col) > 3 else 255))

def sym_bars(img, size, col, off):
    cx = int(size * 0.32) + off; base = int(size * 0.68) + off
    w = int(size * 0.10)
    hs = [0.18, 0.30, 0.42]
    for i, hh in enumerate(hs):
        x = cx + i * int(size * 0.18)
        draw_rect(img, x, base - int(size * hh), x + w, base, col)

def sym_gear(img, size, col, off):
    cx = size // 2 + off; cy = int(size * 0.5) + off; R = int(size * 0.22)
    for a in range(0, 360, 45):
        rad = a * math.pi / 180
        draw_disc(img, cx + (R + 4) * math.cos(rad), cy + (R + 4) * math.sin(rad), max(3, size // 22), col)
    draw_disc(img, cx, cy, R, col)
    draw_disc(img, cx, cy, int(R * 0.45), (20, 24, 34, col[3] if len(col) > 3 else 255))

def sym_help(img, size, col, off):
    cx = size // 2 + off; cy = int(size * 0.46) + off; s = max(3, int(size * 0.075))
    draw_rect(img, cx - 2 * s, cy - 3 * s, cx + 2 * s, cy - s, col)
    draw_rect(img, cx + s, cy - 2 * s, cx + 2 * s, cy + s, col)
    draw_rect(img, cx - s, cy, cx + 2 * s, cy + s, col)
    draw_rect(img, cx - s, cy + s, cx, cy + 2 * s, col)
    draw_rect(img, cx - s, cy + 3 * s, cx + s, cy + 4 * s, col)

def sym_arrow_left(img, size, col, off):
    cx = size // 2 + off; cy = int(size * 0.5) + off; L = int(size * 0.20)
    fill_poly(img, [(cx - L, cy), (cx, cy - L), (cx, cy + L)], col)
    draw_rect(img, cx, cy - int(size * 0.06), cx + L, cy + int(size * 0.06), col)

def sym_plus(img, size, col, off):
    cx = size // 2 + off; cy = int(size * 0.5) + off; t = int(size * 0.09); L = int(size * 0.26)
    draw_rect(img, cx - t, cy - L, cx + t, cy + L, col)
    draw_rect(img, cx - L, cy - t, cx + L, cy + t, col)

def sym_pencil(img, size, col, off):
    cx = size // 2 + off; cy = size // 2 + off
    for i in range(-int(size * 0.22), int(size * 0.18)):
        draw_rect(img, cx + i, cy - i, cx + i + int(size * 0.12), cy - i + int(size * 0.12), col)
    fill_poly(img, [(cx - int(size * 0.26), cy + int(size * 0.26)),
                    (cx - int(size * 0.16), cy + int(size * 0.10)),
                    (cx - int(size * 0.10), cy + int(size * 0.20))], col)

def sym_gift(img, size, col, off):
    cx = size // 2 + off; cy = int(size * 0.52) + off; w = int(size * 0.22)
    draw_rect(img, cx - w, cy - int(size * 0.10), cx + w, cy + int(size * 0.22), col)
    draw_rect(img, cx - w - 3, cy - int(size * 0.18), cx + w + 3, cy - int(size * 0.08), col)
    draw_rect(img, cx - int(size * 0.04), cy - int(size * 0.18), cx + int(size * 0.04), cy + int(size * 0.22),
              (20, 24, 34, col[3] if len(col) > 3 else 255))
    draw_disc(img, cx - int(size * 0.08), cy - int(size * 0.22), int(size * 0.07), col)
    draw_disc(img, cx + int(size * 0.08), cy - int(size * 0.22), int(size * 0.07), col)

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
    dk = (20, 24, 34, col[3] if len(col) > 3 else 255)
    for ox in (-int(size * 0.09), 0, int(size * 0.09)):
        draw_rect(img, cx + ox - 2, cy - int(size * 0.10), cx + ox + 2, cy + int(size * 0.18), dk)

def img_set(img, x, y, col):
    if 0 <= x < len(img[0]) and 0 <= y < len(img):
        img[y][x] = [col[0], col[1], col[2], col[3] if len(col) > 3 else 255]

# ------------------------------------------------------------------ simbolos de medalla (centrados)
def med_star(img, cx, cy, s, col):
    pts = []
    for k in range(10):
        a = -math.pi / 2 + k * math.pi / 5
        rr = s if k % 2 == 0 else s * 0.45
        pts.append((cx + rr * math.cos(a), cy + rr * math.sin(a)))
    fill_poly(img, pts, col)

def med_pick(img, cx, cy, s, col):
    # mango
    for i in range(int(-s), int(s)):
        draw_rect(img, cx + i * 0.4 - 2, cy + i * 0.4 - 2, cx + i * 0.4 + 3, cy + i * 0.4 + 3, col)
    # cabeza curva
    for a in range(200, 340):
        rad = a * math.pi / 180
        draw_disc(img, cx + s * math.cos(rad), cy - s * 0.5 + s * math.sin(rad), 2.5, col)

def med_sword(img, cx, cy, s, col):
    draw_rect(img, cx - s * 0.12, cy - s, cx + s * 0.12, cy + s * 0.6, col)         # hoja
    draw_rect(img, cx - s * 0.45, cy + s * 0.4, cx + s * 0.45, cy + s * 0.6, col)   # guarda
    draw_rect(img, cx - s * 0.10, cy + s * 0.6, cx + s * 0.10, cy + s, col)         # mango
    fill_poly(img, [(cx - s * 0.12, cy - s), (cx + s * 0.12, cy - s), (cx, cy - s * 1.25)], col)

def med_shield(img, cx, cy, s, col):
    fill_poly(img, [(cx - s, cy - s * 0.8), (cx + s, cy - s * 0.8), (cx + s, cy * 1.0 + s * 0.1),
                    (cx, cy + s), (cx - s, cy * 1.0 + s * 0.1)], col)

def med_crown(img, cx, cy, s, col):
    base_y = cy + s * 0.6
    fill_poly(img, [(cx - s, base_y), (cx + s, base_y),
                    (cx + s, cy - s * 0.2), (cx + s * 0.5, cy + s * 0.1),
                    (cx, cy - s * 0.6), (cx - s * 0.5, cy + s * 0.1), (cx - s, cy - s * 0.2)], col)
    draw_rect(img, cx - s, base_y, cx + s, base_y + s * 0.3, col)

def med_diamond(img, cx, cy, s, col):
    fill_poly(img, [(cx, cy - s), (cx + s * 0.7, cy - s * 0.2), (cx, cy + s), (cx - s * 0.7, cy - s * 0.2)], col)
    fill_poly(img, [(cx - s * 0.7, cy - s * 0.2), (cx + s * 0.7, cy - s * 0.2), (cx, cy - s * 0.45)],
              lighten(col[:3], 0.35) + (col[3] if len(col) > 3 else 255,))

def med_trophy(img, cx, cy, s, col):
    fill_poly(img, [(cx - s * 0.7, cy - s * 0.7), (cx + s * 0.7, cy - s * 0.7),
                    (cx + s * 0.45, cy + s * 0.2), (cx - s * 0.45, cy + s * 0.2)], col)
    for a in range(0, 181, 20):
        rad = a * math.pi / 180
        draw_disc(img, cx - s * 0.7 + (-s * 0.35) * math.cos(rad), cy - s * 0.45 + s * 0.45 * math.sin(rad), 2, col)
        draw_disc(img, cx + s * 0.7 + (s * 0.35) * math.cos(rad), cy - s * 0.45 + s * 0.45 * math.sin(rad), 2, col)
    draw_rect(img, cx - s * 0.12, cy + s * 0.2, cx + s * 0.12, cy + s * 0.55, col)
    draw_rect(img, cx - s * 0.5, cy + s * 0.55, cx + s * 0.5, cy + s * 0.75, col)

def med_heart(img, cx, cy, s, col):
    draw_disc(img, cx - s * 0.4, cy - s * 0.25, s * 0.45, col)
    draw_disc(img, cx + s * 0.4, cy - s * 0.25, s * 0.45, col)
    fill_poly(img, [(cx - s * 0.82, cy - s * 0.05), (cx + s * 0.82, cy - s * 0.05), (cx, cy + s)], col)

def med_bolt(img, cx, cy, s, col):
    fill_poly(img, [(cx + s * 0.2, cy - s), (cx - s * 0.5, cy + s * 0.1),
                    (cx - s * 0.05, cy + s * 0.1), (cx - s * 0.2, cy + s),
                    (cx + s * 0.5, cy - s * 0.15), (cx + s * 0.05, cy - s * 0.15)], col)

def med_flame(img, cx, cy, s, col):
    fill_poly(img, [(cx, cy - s), (cx + s * 0.6, cy), (cx + s * 0.4, cy + s * 0.7),
                    (cx, cy + s), (cx - s * 0.4, cy + s * 0.7), (cx - s * 0.6, cy)], col)
    fill_poly(img, [(cx, cy - s * 0.2), (cx + s * 0.3, cy + s * 0.3), (cx, cy + s * 0.7), (cx - s * 0.3, cy + s * 0.3)],
              lighten(col[:3], 0.4) + (col[3] if len(col) > 3 else 255,))

def med_leaf(img, cx, cy, s, col):
    fill_poly(img, [(cx, cy - s), (cx + s * 0.7, cy), (cx, cy + s), (cx - s * 0.7, cy)], col)
    draw_rect(img, cx - 1.5, cy - s, cx + 1.5, cy + s, darken(col[:3], 0.3) + (col[3] if len(col) > 3 else 255,))

def med_skull(img, cx, cy, s, col):
    draw_disc(img, cx, cy - s * 0.15, s * 0.7, col)
    draw_rect(img, cx - s * 0.4, cy + s * 0.3, cx + s * 0.4, cy + s * 0.7, col)
    dk = (20, 22, 30, col[3] if len(col) > 3 else 255)
    draw_disc(img, cx - s * 0.28, cy - s * 0.15, s * 0.18, dk)
    draw_disc(img, cx + s * 0.28, cy - s * 0.15, s * 0.18, dk)
    draw_rect(img, cx - s * 0.06, cy + s * 0.1, cx + s * 0.06, cy + s * 0.35, dk)

MED_SYMS = [med_star, med_pick, med_sword, med_shield, med_crown, med_diamond,
            med_trophy, med_heart, med_bolt, med_flame, med_leaf, med_skull]
MED_COLORS = [
    (255, 200, 40), (130, 160, 195), (215, 65, 65), (70, 120, 210),
    (175, 95, 205), (90, 210, 232), (250, 200, 60), (232, 75, 115),
    (245, 222, 60), (245, 140, 45), (85, 192, 92), (222, 222, 212)
]
RIBBON = [
    (200, 60, 60), (70, 110, 190), (60, 150, 90), (210, 160, 50),
    (150, 80, 190), (60, 160, 180), (200, 70, 90), (90, 120, 200),
    (180, 150, 50), (200, 100, 50), (70, 150, 80), (120, 130, 150)
]

def draw_medal(size, base, ribbon, symfn, locked=False):
    img = blank(size, size)
    cx = cy = size / 2.0
    cy_disc = size * 0.56
    R = size * 0.36
    bc = base
    rib = ribbon
    if locked:
        bc = gray(base); rib = gray(ribbon)
    ring_lt = lighten(bc, 0.45); ring_dk = darken(bc, 0.45)
    face_lt = lighten(bc, 0.10); face_dk = darken(bc, 0.40)

    # cinta (ribbon) detras, arriba
    for (sx, dirn) in ((cx - R * 0.55, -1), (cx + R * 0.55, 1)):
        pts = [(sx - size * 0.10, 0), (sx + size * 0.10, 0),
               (sx + size * 0.10 + dirn * size * 0.05, cy_disc),
               (sx - size * 0.10 + dirn * size * 0.05, cy_disc)]
        fill_poly(img, pts, darken(rib, 0.0) + (255,))
    # sombra de las cintas
    for (sx, dirn) in ((cx - R * 0.55, -1), (cx + R * 0.55, 1)):
        for yy in range(0, int(cy_disc)):
            blend(img, int(sx + dirn * size * 0.05 * (yy / cy_disc) + size * 0.085), yy, (0, 0, 0), 0.18)

    # disco con anillo metalico
    for y in range(size):
        for x in range(size):
            d = math.hypot(x - cx, y - cy_disc)
            if d > R + 1.2:
                continue
            edge = max(0.0, min(1.0, (R + 1.0 - d)))
            ang = math.atan2(y - cy_disc, x - cx)
            if d > R * 0.74:
                # anillo: brillo segun angulo (luz arriba-izq)
                hl = 0.5 + 0.5 * math.cos(ang + 2.3)
                r, g, b = mix(ring_dk, ring_lt, hl)
            else:
                t = (y - (cy_disc - R)) / (2 * R)
                r, g, b = mix(face_lt, face_dk, max(0.0, min(1.0, t)))
            img[y][x] = [clamp(r), clamp(g), clamp(b), clamp(255 * edge)]

    # muescas en el anillo
    for a in range(0, 360, 30):
        rad = a * math.pi / 180
        nx = cx + (R * 0.87) * math.cos(rad); ny = cy_disc + (R * 0.87) * math.sin(rad)
        draw_disc(img, nx, ny, max(1.5, size * 0.018), darken(bc, 0.25) + (255,))

    # brillo superior izquierdo
    for y in range(size):
        for x in range(size):
            d = math.hypot(x - cx, y - cy_disc)
            if d < R * 0.7:
                gl = max(0.0, 1 - math.hypot(x - (cx - R * 0.3), y - (cy_disc - R * 0.32)) / (R * 0.6))
                if gl > 0:
                    blend(img, x, y, (255, 255, 255), 0.28 * gl)

    # simbolo
    symcol = (255, 255, 255) if not locked else (210, 210, 214)
    # sombra del simbolo
    symfn(img, cx + 1.5, cy_disc + 1.5, R * 0.5, (12, 14, 20, 150))
    symfn(img, cx, cy_disc, R * 0.5, symcol + (255,))

    if locked:
        # candado pequeno + atenuar
        for y in range(size):
            for x in range(size):
                if img[y][x][3] > 0:
                    blend(img, x, y, (20, 22, 30), 0.30)
        lx = cx + R * 0.55; ly = cy_disc + R * 0.55
        draw_rect(img, lx - 7, ly - 3, lx + 7, ly + 10, (40, 42, 50, 255))
        for a in range(180, 361, 20):
            rad = a * math.pi / 180
            draw_disc(img, lx + 5 * math.cos(rad), ly - 3 + 5 * math.sin(rad), 1.6, (40, 42, 50, 255))
        draw_disc(img, lx, ly + 3, 2, (210, 210, 60, 255))
    return img

# ------------------------------------------------------------------ fondo server_form (nineslice real)
def make_form_bg():
    """Panel oscuro profesional, nineslice 28/30. Bordes biselados con doble
    linea de acento y esquinas reforzadas para un look avanzado."""
    size = 128
    bw = 10          # grosor de marco (cabe en el nineslice de 28-30)
    img = blank(size, size)
    top = (34, 41, 64); mid = (22, 27, 44); bot = (12, 15, 26)
    steel_lt = (150, 178, 235); steel_dk = (54, 70, 120)
    acc = (122, 196, 255)
    for y in range(size):
        for x in range(size):
            inb = (x < bw or x >= size - bw or y < bw or y >= size - bw)
            if inb:
                # marco metalico con bisel diagonal
                d = ((x + y) - size) / float(size)
                r, g, b = mix(steel_dk, steel_lt, max(0.0, min(1.0, 0.5 - d * 0.7)))
                # borde mas oscuro en el contorno exterior
                if x < 2 or y < 2 or x >= size - 2 or y >= size - 2:
                    r, g, b = darken((r, g, b), 0.5)
                a = 255
            else:
                t = y / (size - 1)
                if t < 0.5:
                    r, g, b = mix(top, mid, t * 2)
                else:
                    r, g, b = mix(mid, bot, (t - 0.5) * 2)
                dx = (x - size / 2) / (size / 2); dy = (y - size / 2) / (size / 2)
                vig = 1 - 0.22 * (dx * dx + dy * dy)
                r *= vig; g *= vig; b *= vig
                a = 250
            img[y][x] = [clamp(r), clamp(g), clamp(b), a]
    # doble linea de acento interior
    for x in range(bw, size - bw):
        blend(img, x, bw, acc, 0.85); blend(img, x, bw + 1, acc, 0.4)
        blend(img, x, size - bw - 1, acc, 0.7); blend(img, x, size - bw - 2, acc, 0.3)
    for y in range(bw, size - bw):
        blend(img, bw, y, acc, 0.85); blend(img, bw + 1, y, acc, 0.4)
        blend(img, size - bw - 1, y, acc, 0.7); blend(img, size - bw - 2, y, acc, 0.3)
    # esquinas reforzadas (corchetes brillantes)
    Lc = 18
    for i in range(bw, bw + Lc):
        for (ax, ay) in ((i, bw), (bw, i),
                          (size - 1 - i, bw), (bw, size - 1 - i),
                          (i, size - bw - 1), (size - bw - 1, i),
                          (size - 1 - i, size - bw - 1), (size - bw - 1, size - 1 - i)):
            blend(img, ax, ay, (210, 235, 255), 0.95)
    return size, size, img

# ------------------------------------------------------------------ barra de cabecera (header)
def make_form_header():
    w, h = 256, 46
    img = blank(w, h)
    c_top = (58, 84, 150); c_bot = (26, 36, 70)
    acc = (255, 206, 92)
    for y in range(h):
        for x in range(w):
            t = y / (h - 1)
            r, g, b = mix(c_top, c_bot, t)
            # brillo central horizontal
            cx = abs(x - w / 2) / (w / 2)
            r += (1 - cx) * 26; g += (1 - cx) * 22; b += (1 - cx) * 14
            img[y][x] = [clamp(r), clamp(g), clamp(b), 235]
    # linea dorada inferior (separador de cabecera)
    for x in range(w):
        glow = 0.55 + 0.45 * (1 - abs(x - w / 2) / (w / 2))
        blend(img, x, h - 2, acc, glow)
        blend(img, x, h - 3, acc, glow * 0.5)
        blend(img, x, h - 1, (120, 90, 30), 0.6)
    # remaches decorativos
    for x in (10, w - 11):
        for yy in (10, h - 14):
            draw_disc(img, x, yy, 2.5, (200, 215, 245, 235))
            draw_disc(img, x, yy, 1.2, (90, 110, 160, 235))
    return w, h, img

# ------------------------------------------------------------------ glow superior (ambiente)
def make_form_glow():
    w, h = 128, 128
    img = blank(w, h)
    cx = w / 2; cy = h * 0.16
    for y in range(h):
        for x in range(w):
            d = math.hypot((x - cx) / (w * 0.6), (y - cy) / (h * 0.5))
            a = max(0.0, 1 - d)
            if a > 0:
                img[y][x] = [120, 170, 255, clamp(150 * a * a)]
    return w, h, img

# ------------------------------------------------------------------ boton largo horizontal (nineslice)
def make_long_button(hover=False):
    w, h = 200, 40
    img = blank(w, h)
    if hover:
        c1 = (74, 116, 196); c2 = (40, 64, 120); bd = (150, 200, 255); acc = (255, 214, 110)
    else:
        c1 = (52, 64, 98); c2 = (28, 34, 56); bd = (96, 124, 188); acc = (150, 185, 250)
    bw = 4
    rad = 9
    cov = get_cov_rect(w, h, 0, rad)
    inner = get_cov_rect(w, h, bw, rad - bw)
    for y in range(h):
        for x in range(w):
            a = cov[y][x]
            if a <= 0:
                continue
            t = y / (h - 1)
            r, g, b = mix(c1, c2, t)
            if inner[y][x] < 0.55:
                d = ((x + y) - (w + h) / 2) / float(w)
                bf = 1.15 - 0.4 * d
                r, g, b = bd[0] * bf, bd[1] * bf, bd[2] * bf
            else:
                # brillo superior
                if y < h * 0.45:
                    gl = (1 - y / (h * 0.45)) * 0.20
                    r += 255 * gl; g += 255 * gl; b += 255 * gl
            img[y][x] = [clamp(r), clamp(g), clamp(b), clamp(255 * a)]
    # acento vertical a la izquierda (marca de seleccion)
    for y in range(int(h * 0.18), int(h * 0.82)):
        for x in range(bw + 2, bw + 6):
            blend(img, x, y, acc, 0.9 if hover else 0.6)
    return w, h, img

def get_cov_rect(w, h, inset, radius, ss=3):
    cov = [[0.0] * w for _ in range(h)]
    x0 = inset; y0 = inset; x1 = w - inset; y1 = h - inset
    for y in range(h):
        for x in range(w):
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

# ------------------------------------------------------------------ item especial (libro de logros)
def make_item_book():
    size = 16
    img = blank(size, size)
    cover = (196, 150, 36); cover_dk = (150, 110, 24); pages = (240, 236, 220)
    # tapa
    draw_rect(img, 2, 1, 14, 15, cover)
    draw_rect(img, 2, 1, 4, 15, cover_dk)        # lomo
    # paginas
    draw_rect(img, 11, 2, 13, 14, pages)
    # estrella dorada en la tapa
    med_star(img, 8.5, 7.5, 4.2, (255, 226, 120, 255))
    med_star(img, 8.5, 7.5, 2.0, (255, 248, 200, 255))
    # bisel/sombra
    for y in range(1, 15):
        blend(img, 2, y, (0, 0, 0), 0.25)
        blend(img, 13, y, (0, 0, 0), 0.2)
    for x in range(2, 14):
        blend(img, x, 1, (255, 255, 255), 0.18)
    return size, size, img

# ------------------------------------------------------------------ pack icon
def make_pack_icon():
    size = 128
    img = compose_tile(size, (38, 48, 78), (12, 14, 22), (120, 150, 220))
    m = draw_medal(96, MED_COLORS[6], RIBBON[6], MED_SYMS[6], False)
    # pegar medalla centrada
    ox = (size - 96) // 2; oy = (size - 96) // 2 + 6
    for y in range(96):
        for x in range(96):
            if m[y][x][3] > 0:
                blend(img, ox + x, oy + y, m[y][x][:3], m[y][x][3] / 255.0)
    return size, size, img

# ================================================================== WRITE ALL
# Medallas (color + bloqueadas)
for i in range(12):
    on = draw_medal(96, MED_COLORS[i], RIBBON[i], MED_SYMS[i], False)
    write_png(f"{RP}/textures/ui/logros/m{i}.png", 96, 96, on)
    off = draw_medal(96, MED_COLORS[i], RIBBON[i], MED_SYMS[i], True)
    write_png(f"{RP}/textures/ui/logros/m{i}_off.png", 96, 96, off)

# Botones de UI
BTN = {
    "btn_view":   ((70, 200, 120), sym_eye),
    "btn_stats":  ((70, 150, 245), sym_bars),
    "btn_admin":  ((245, 175, 60), sym_gear),
    "btn_help":   ((175, 115, 240), sym_help),
    "btn_back":   ((130, 140, 160), sym_arrow_left),
    "btn_create": ((70, 205, 120), sym_plus),
    "btn_edit":   ((245, 200, 70), sym_pencil),
    "btn_give":   ((70, 165, 245), sym_gift),
    "btn_reset":  ((240, 90, 95), sym_trash),
    "btn_reload": ((60, 205, 205), sym_reload),
}
for name, (base, sym) in BTN.items():
    c1 = lighten(base, 0.18); c2 = darken(base, 0.45); bd = lighten(base, 0.5)
    fn = (lambda s: (lambda img, size: _shape(img, size, s)))(sym)
    img = compose_tile(96, c1, c2, bd, symbol=fn)
    write_png(f"{RP}/textures/ui/logros/{name}.png", 96, 96, img)

# Fondo del server_form
fw, fh, fi = make_form_bg(); write_png(f"{RP}/textures/ui/logros/form_bg.png", fw, fh, fi)
# Cabecera, glow y botones largos (UI v2 avanzada)
hw, hh, hi = make_form_header(); write_png(f"{RP}/textures/ui/logros/form_header.png", hw, hh, hi)
gw, gh, gi = make_form_glow(); write_png(f"{RP}/textures/ui/logros/form_glow.png", gw, gh, gi)
lw, lh, li = make_long_button(False); write_png(f"{RP}/textures/ui/logros/btn_long.png", lw, lh, li)
lw, lh, li = make_long_button(True); write_png(f"{RP}/textures/ui/logros/btn_long_hover.png", lw, lh, li)

# Item especial
iw, ih, ii = make_item_book(); write_png(f"{RP}/textures/items/logros_book.png", iw, ih, ii)

# pack_icon (RP + BP)
pw, ph, pi = make_pack_icon()
write_png(f"{RP}/pack_icon.png", pw, ph, pi)
write_png(f"{BP}/pack_icon.png", pw, ph, pi)

print("Logros v2: 12 medallas (+12 off), 10 botones, fondo/header/glow, 2 botones largos, item y pack_icon generados.")
