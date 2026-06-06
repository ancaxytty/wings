#!/usr/bin/env python3
"""Generador de texturas PNG (RGBA) sin dependencias externas - Wings Search v2."""
import struct, zlib, os, math

RP = "wings_search_RP"
BP = "wings_search_BP"

# ------------------------------------------------------------------ PNG IO
def write_png(path, w, h, pixels):
    raw = bytearray()
    for y in range(h):
        raw.append(0)
        for px in pixels[y]:
            raw += bytes(px)
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
    for y in range(max(0, y0), min(h, y1)):
        for x in range(max(0, x0), min(w, x1)):
            img[y][x] = [color[0], color[1], color[2], color[3] if len(color) > 3 else 255]

def draw_disc(img, cx, cy, r, color):
    h = len(img); w = len(img[0])
    for y in range(max(0, cy - r), min(h, cy + r + 1)):
        for x in range(max(0, cx - r), min(w, cx + r + 1)):
            if (x - cx) ** 2 + (y - cy) ** 2 <= r * r:
                img[y][x] = [color[0], color[1], color[2], color[3] if len(color) > 3 else 255]

# ------------------------------------------------------------------ UI panels
def fill_rounded_panel(w, h, base, border, glow=None, radius=6, alpha=235):
    img = blank(w, h)
    for y in range(h):
        for x in range(w):
            cx = min(x, w - 1 - x); cy = min(y, h - 1 - y)
            if cx < radius and cy < radius:
                dx = radius - cx; dy = radius - cy
                if dx * dx + dy * dy > radius * radius:
                    continue
            if cx < 2 or cy < 2:
                img[y][x] = [border[0], border[1], border[2], 255]
            else:
                t = y / max(1, h - 1)
                img[y][x] = [int(base[0] * (1 - .25 * t)), int(base[1] * (1 - .25 * t)),
                             int(base[2] * (1 - .25 * t)), alpha]
    if glow:
        for x in range(3, w - 3):
            img[3][x] = [glow[0], glow[1], glow[2], 180]
    return img

def make_close(hover=False):
    w = h = 32
    base = (35, 12, 16) if not hover else (120, 30, 36)
    border = (90, 30, 34) if not hover else (200, 70, 76)
    xc = (220, 80, 80) if not hover else (255, 235, 235)
    img = fill_rounded_panel(w, h, base, border, radius=7, alpha=245)
    for i in range(8, w - 8):
        for t in (-1, 0, 1):
            if 0 <= i + t < h: img[i + t][i] = [xc[0], xc[1], xc[2], 255]
            if 0 <= (h - 1 - i) + t < h: img[(h - 1 - i) + t][i] = [xc[0], xc[1], xc[2], 255]
    return w, h, img

def make_bg(hover=False):
    # Panel oscuro profesional: degradado diagonal + doble borde + esquinas en L + brillo superior
    w = h = 64
    if not hover:
        top = (32, 36, 52); bot = (12, 14, 22)
        bd_out = (96, 112, 158); bd_in = (52, 60, 88); accent = (120, 150, 220); alpha = 244
    else:
        top = (58, 70, 104); bot = (28, 34, 54)
        bd_out = (150, 190, 255); bd_in = (86, 110, 165); accent = (180, 210, 255); alpha = 255
    radius = 9
    img = blank(w, h)
    for y in range(h):
        for x in range(w):
            cx = min(x, w - 1 - x); cy = min(y, h - 1 - y)
            if cx < radius and cy < radius:
                dx = radius - cx; dy = radius - cy
                if dx * dx + dy * dy > radius * radius:
                    continue
            edge = min(cx, cy)
            if edge == 0:
                img[y][x] = [bd_out[0], bd_out[1], bd_out[2], 255]
            elif edge == 1:
                img[y][x] = [bd_in[0], bd_in[1], bd_in[2], 255]
            else:
                # degradado diagonal
                t = (x + y) / (2.0 * (w - 1))
                r = int(top[0] * (1 - t) + bot[0] * t)
                g = int(top[1] * (1 - t) + bot[1] * t)
                b = int(top[2] * (1 - t) + bot[2] * t)
                img[y][x] = [r, g, b, alpha]
    # brillo superior
    for x in range(4, w - 4):
        img[3][x] = [accent[0], accent[1], accent[2], 150]
        img[4][x] = [accent[0], accent[1], accent[2], 70]
    # esquinas en L (acento)
    L = 9
    for i in range(3, L):
        for (ax, ay) in ((i, 3), (3, i), (w - 1 - i, 3), (3, h - 1 - i),
                          (i, h - 4), (w - 4, i), (w - 1 - i, h - 4), (w - 4, h - 1 - i)):
            if 0 <= ax < w and 0 <= ay < h:
                img[ay][ax] = [accent[0], accent[1], accent[2], 230]
    return w, h, img

def make_icon(kind):
    w = h = 48
    img = blank(w, h)
    if kind == "create":
        draw_disc(img, 24, 26, 15, (110, 200, 120, 255))
        draw_rect(img, 22, 14, 26, 38, (245, 255, 245, 255))
        draw_rect(img, 12, 24, 36, 28, (245, 255, 245, 255))
    elif kind == "review":
        draw_disc(img, 20, 20, 12, (120, 170, 240, 255))
        draw_disc(img, 20, 20, 8, (20, 22, 30, 255))
        for i in range(0, 12):
            draw_rect(img, 28 + i - 1, 28 + i - 1, 28 + i + 3, 28 + i + 3, (120, 170, 240, 255))
    elif kind == "reload":
        for a in range(40, 320):
            rad = a * math.pi / 180
            draw_rect(img, int(24 + 13 * math.cos(rad)) - 2, int(24 + 13 * math.sin(rad)) - 2,
                      int(24 + 13 * math.cos(rad)) + 2, int(24 + 13 * math.sin(rad)) + 2, (200, 150, 240, 255))
        draw_rect(img, 32, 4, 46, 16, (200, 150, 240, 255))
    elif kind == "help":
        draw_disc(img, 24, 24, 16, (230, 200, 90, 255))
        draw_disc(img, 24, 24, 12, (40, 34, 12, 255))
        draw_rect(img, 20, 14, 30, 18, (255, 240, 180, 255))
        draw_rect(img, 26, 18, 30, 24, (255, 240, 180, 255))
        draw_rect(img, 22, 24, 28, 28, (255, 240, 180, 255))
        draw_rect(img, 22, 32, 27, 37, (255, 240, 180, 255))
    elif kind == "delete":
        draw_rect(img, 14, 16, 34, 38, (200, 70, 76, 255))
        draw_rect(img, 12, 12, 36, 16, (230, 90, 96, 255))
        draw_rect(img, 20, 8, 28, 12, (230, 90, 96, 255))
        for x in (19, 24, 29):
            draw_rect(img, x, 20, x + 2, 34, (40, 16, 18, 255))
    elif kind == "wand":
        draw_disc(img, 14, 34, 4, (180, 130, 70, 255))
        for i in range(20):
            draw_rect(img, 12 + i, 32 - i, 15 + i, 35 - i, (150, 110, 60, 255))
        # star tip
        draw_disc(img, 34, 14, 6, (255, 230, 120, 255))
        draw_rect(img, 33, 6, 35, 22, (255, 245, 180, 255))
        draw_rect(img, 26, 13, 42, 15, (255, 245, 180, 255))
    elif kind == "place":
        draw_disc(img, 24, 22, 13, (110, 200, 120, 255))
        draw_rect(img, 22, 30, 26, 42, (245, 255, 245, 255))
        draw_rect(img, 16, 22, 32, 26, (40, 34, 12, 255))
    return w, h, img

# ------------------------------------------------------------------ Heads
PAL = {
    '.': None,  # base
    ' ': None,
    'K': (24, 20, 26), 'W': (236, 239, 246), 'R': (201, 42, 47), 'r': (150, 28, 32),
    'G': (74, 168, 86), 'g': (44, 112, 54), 'O': (228, 132, 32), 'o': (182, 96, 18),
    'B': (120, 182, 236), 'b': (70, 122, 192), 'P': (146, 84, 184), 'Y': (242, 212, 82),
    'S': (227, 182, 142), 'N': (120, 80, 45), 'n': (82, 52, 28), 'C': (172, 222, 242),
}

# (key, nombre, base, top, 8x8 face)
HEADS = [
    ("halloween", "Halloween", (228, 132, 32), (182, 96, 18), [
        "........", ".K....K.", ".KK..KK.", "........",
        "...KK...", ".K.KK.K.", ".KKKKKK.", "..K..K.."]),
    ("navidad", "Navidad", (44, 112, 54), (44, 112, 54), [
        "...GG...", "..GGGG..", ".GRGGYG.", "..GGGG..",
        ".GGRGGG.", "GGGGGYGG", "...NN...", "...NN..."]),
    ("santa", "Santa", (227, 182, 142), (201, 42, 47), [
        "RRRRRRRR", "RRRRRRRW", "WWWWWWWW", "..K..K..",
        "...SS...", ".WWWWWW.", "WWWWWWWW", ".WWWWWW."]),
    ("frozen", "Frozen", (172, 222, 242), (120, 182, 236), [
        "..BBBB..", ".BBBBBB.", "BBCCCCBB", "B.K..K.B",
        "BBCCCCBB", ".BC..CB.", "..BCCB..", "...BB..."]),
    ("olaf", "Olaf", (236, 239, 246), (236, 239, 246), [
        "...WW...", ".WWWWWW.", "WWWWWWWW", "W.K..K.W",
        "WWWOOWWW", "W.K..K.W", ".WKKKKW.", "..WWWW.."]),
    ("fantasma", "Fantasma", (236, 239, 246), (236, 239, 246), [
        "..WWWW..", ".WWWWWW.", "WWWWWWWW", "WKKWWKKW",
        "WWWWWWWW", "WWWWWWWW", "WWWWWWWW", "W.WW.WW."]),
    ("esqueleto", "Esqueleto", (236, 239, 246), (236, 239, 246), [
        ".WWWWWW.", "WWWWWWWW", "WKKWWKKW", "WKKWWKKW",
        "WWWKKWWW", "WWWWWWWW", "WKWKWKWW", ".WWWWWW."]),
    ("reno", "Reno", (120, 80, 45), (82, 52, 28), [
        "n..nn..n", ".n.nn.n.", "..NNNN..", ".NNNNNN.",
        "NK.NN.KN", "NNNRRNNN", ".NNNNNN.", "..NNNN.."]),
    ("munieco", "Muneco de Nieve", (236, 239, 246), (24, 20, 26), [
        "KKKKKKKK", "..KKKK..", "..KKKK..", ".WWWWWW.",
        "W.K..K.W", "WWWOWWWW", "W.KKKK.W", ".WWWWWW."]),
    ("regalo", "Regalo", (201, 42, 47), (242, 212, 82), [
        "RRRYYRRR", "RRRYYRRR", "YYYYYYYY", "RRRYYRRR",
        "RRRYYRRR", "RRRYYRRR", "RRRYYRRR", "RRRYYRRR"]),
    ("zombie", "Zombie", (74, 168, 86), (44, 112, 54), [
        ".gggggg.", "gggggggg", "gKKggKKg", "gggggggg",
        "ggKggKgg", "gggggggg", "gKgKgKgg", ".gggggg."]),
    ("bruja", "Bruja", (74, 168, 86), (146, 84, 184), [
        "...PP...", "..PPPP..", ".PPPPPP.", "PPPPPPPP",
        ".GK..KG.", ".GGGGGG.", ".GGKKGG.", "..GGGG.."]),
]

def paint_face(img, ox, oy, cell, base, rows):
    for gy in range(8):
        for gx in range(8):
            ch = rows[gy][gx]
            col = PAL.get(ch)
            if col is None:
                col = base
            draw_rect(img, ox + gx * cell, oy + gy * cell, ox + (gx + 1) * cell, oy + (gy + 1) * cell,
                      (col[0], col[1], col[2], 255))

def make_head_skin(theme):
    _key, _name, base, top, rows = theme
    w = h = 64
    img = blank(w, h)
    # rellenar todas las caras con base (region del head en uv [0,0]: x 0..32, y 0..16)
    draw_rect(img, 0, 0, 32, 16, (base[0], base[1], base[2], 255))
    # cara superior (top) [8..16, 0..8]
    draw_rect(img, 8, 0, 16, 8, (top[0], top[1], top[2], 255))
    # cara frontal [8..16, 8..16] con patron (cell=1)
    paint_face(img, 8, 8, 1, base, rows)
    return w, h, img

def make_head_icon(theme):
    _key, _name, base, top, rows = theme
    w = h = 64
    accent = (top[0], top[1], top[2])
    img = fill_rounded_panel(w, h, (18, 20, 28), accent, glow=accent, radius=10, alpha=255)
    # retrato: cara 8x8 escalada (cell=6) centrada
    paint_face(img, 8, 8, 6, base, rows)
    return w, h, img

def make_holo():
    return 8, 8, blank(8, 8, (0, 0, 0, 0))

def make_pack_icon(rp=True):
    # Tema "búsqueda": panel oscuro pro + cabeza calabaza + lupa + chispas
    w = h = 128
    accent = (120, 160, 240) if rp else (235, 170, 70)
    img = blank(w, h)
    radius = 16
    top = (34, 38, 56); bot = (12, 14, 22)
    for y in range(h):
        for x in range(w):
            cx = min(x, w - 1 - x); cy = min(y, h - 1 - y)
            if cx < radius and cy < radius:
                dx = radius - cx; dy = radius - cy
                if dx * dx + dy * dy > radius * radius:
                    continue
            edge = min(cx, cy)
            if edge < 2:
                img[y][x] = [accent[0], accent[1], accent[2], 255]
            elif edge < 4:
                img[y][x] = [int(accent[0] * .4), int(accent[1] * .4), int(accent[2] * .5), 255]
            else:
                t = (x + y) / (2.0 * (w - 1))
                img[y][x] = [int(top[0] * (1 - t) + bot[0] * t),
                             int(top[1] * (1 - t) + bot[1] * t),
                             int(top[2] * (1 - t) + bot[2] * t), 255]
    # cabeza calabaza
    draw_disc(img, 56, 70, 30, (228, 132, 32, 255))
    draw_disc(img, 56, 70, 30, (228, 132, 32, 255))
    draw_rect(img, 43, 60, 53, 70, (24, 20, 26, 255))   # ojo izq (triangulo aprox)
    draw_rect(img, 45, 62, 51, 68, (255, 180, 40, 255))
    draw_rect(img, 47, 64, 49, 66, (24, 20, 26, 255))
    draw_rect(img, 60, 60, 70, 70, (24, 20, 26, 255))   # ojo der
    draw_rect(img, 62, 62, 68, 68, (255, 180, 40, 255))
    draw_rect(img, 64, 64, 66, 66, (24, 20, 26, 255))
    draw_rect(img, 46, 80, 68, 84, (24, 20, 26, 255))   # boca
    draw_rect(img, 50, 84, 54, 88, (24, 20, 26, 255))
    draw_rect(img, 60, 84, 64, 88, (24, 20, 26, 255))
    # lupa (search) arriba a la derecha
    draw_disc(img, 92, 40, 18, (235, 240, 255, 255))
    draw_disc(img, 92, 40, 13, (70, 120, 200, 255))
    draw_disc(img, 92, 40, 9, (150, 195, 255, 255))
    for i in range(0, 22):
        draw_rect(img, 104 + i - 2, 52 + i - 2, 104 + i + 3, 52 + i + 3, (210, 220, 245, 255))
    # chispas
    for (sx, sy) in ((26, 30), (108, 92), (30, 100), (96, 100)):
        draw_disc(img, sx, sy, 2, (255, 240, 150, 255))
    return w, h, img

# ------------------------------------------------------------------ Particles atlas
def make_particle_atlas():
    # 32x16: izq (0..16) destello/estrella, der (16..32) llama de antorcha
    w, h = 32, 16
    img = blank(w, h)
    # estrella / sparkle (colorida)
    cx, cy = 8, 8
    draw_disc(img, cx, cy, 3, (255, 255, 255, 255))
    for d in range(1, 7):
        for (dx, dy) in ((d, 0), (-d, 0), (0, d), (0, -d)):
            x, y = cx + dx, cy + dy
            if 0 <= x < 16 and 0 <= y < h:
                a = max(60, 255 - d * 30)
                img[y][x] = [255, 240, 130, a]
    draw_disc(img, cx, cy, 1, (180, 220, 255, 255))
    # llama de antorcha (der)
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
                    col = (255, 90, 20, 235)      # borde naranja
                elif t < 0.35:
                    col = (255, 230, 90, 255)     # nucleo amarillo
                else:
                    col = (240, 140, 30, 245)     # cuerpo naranja
                img[y][x] = list(col)
    return w, h, img

def make_wand_item():
    # Varita 32x32 nítida y vívida: mango de madera diagonal + estrella dorada con borde + chispas
    w = h = 32
    img = blank(w, h)
    wood = (150, 100, 52); wood_d = (104, 68, 34); wood_l = (196, 142, 86)
    # mango diagonal de abajo-izq a centro
    for i in range(20):
        x = 4 + i; y = 27 - i
        draw_rect(img, x - 1, y - 1, x + 3, y + 3, (wood[0], wood[1], wood[2], 255))
        # sombra y luz
        if 0 <= y + 2 < h: img[y + 2][min(w - 1, x + 1)] = [wood_d[0], wood_d[1], wood_d[2], 255]
        if 0 <= y - 1 < h: img[y - 1][x] = [wood_l[0], wood_l[1], wood_l[2], 255]
    # estrella de 5 puntas (dorada) centrada en (22,9)
    cx, cy, R = 22, 9, 9
    star_out = (255, 196, 40); star_in = (255, 240, 150); edge = (180, 120, 10)
    pts = []
    for k in range(10):
        ang = -math.pi / 2 + k * math.pi / 5
        rr = R if k % 2 == 0 else R * 0.45
        pts.append((cx + rr * math.cos(ang), cy + rr * math.sin(ang)))
    # relleno por test de punto-en-poligono
    def in_poly(px, py, poly):
        inside = False
        j = len(poly) - 1
        for i in range(len(poly)):
            xi, yi = poly[i]; xj, yj = poly[j]
            if ((yi > py) != (yj > py)) and (px < (xj - xi) * (py - yi) / (yj - yi + 1e-9) + xi):
                inside = not inside
            j = i
        return inside
    for y in range(h):
        for x in range(w):
            if in_poly(x + 0.5, y + 0.5, pts):
                d = math.hypot(x - cx, y - cy)
                img[y][x] = list(star_in + (255,)) if d < R * 0.5 else list(star_out + (255,))
    # borde de la estrella
    for y in range(h):
        for x in range(w):
            if img[y][x][3] and (star_out[0] == img[y][x][0] or star_in[0] == img[y][x][0]):
                for (dx, dy) in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                    nx, ny = x + dx, y + dy
                    if 0 <= nx < w and 0 <= ny < h and img[ny][nx][3] == 0:
                        img[ny][nx] = list(edge + (255,))
    # chispas alrededor
    for (sx, sy, c) in ((30, 4, (180, 220, 255)), (28, 16, (255, 255, 255)), (14, 6, (200, 240, 255)), (26, 24, (255, 240, 170))):
        img[sy][sx] = list(c + (255,))
        for (dx, dy) in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            if 0 <= sx + dx < w and 0 <= sy + dy < h:
                img[sy + dy][sx + dx] = [c[0], c[1], c[2], 150]
    return w, h, img

# ------------------------------------------------------------------ WRITE ALL
cw, ch, ci = make_close(False); write_png(f"{RP}/textures/custom_ui/close_button.png", cw, ch, ci)
cw, ch, ci = make_close(True);  write_png(f"{RP}/textures/custom_ui/close_button_hover.png", cw, ch, ci)
bw, bh, bi = make_bg(False); write_png(f"{RP}/textures/custom_ui/custom_bg.png", bw, bh, bi)
bw, bh, bi = make_bg(True);  write_png(f"{RP}/textures/custom_ui/custom_bg_hover.png", bw, bh, bi)
for k in ("create", "review", "reload", "help", "delete", "wand", "place"):
    iw, ih, ii = make_icon(k); write_png(f"{RP}/textures/custom_ui/icon_{k}.png", iw, ih, ii)

for n, theme in enumerate(HEADS):
    sw, sh, si = make_head_skin(theme); write_png(f"{RP}/textures/entity/heads/h{n}.png", sw, sh, si)
    iw, ih, ii = make_head_icon(theme); write_png(f"{RP}/textures/custom_ui/heads/h{n}.png", iw, ih, ii)

# textura por defecto de la entidad = halloween
sw, sh, si = make_head_skin(HEADS[0]); write_png(f"{RP}/textures/entity/wings_head.png", sw, sh, si)
hw, hh, hi = make_holo(); write_png(f"{RP}/textures/entity/wings_hologram.png", hw, hh, hi)

pw, ph, pi = make_particle_atlas(); write_png(f"{RP}/textures/particle/wings_particles.png", pw, ph, pi)
ww, wh, wi = make_wand_item(); write_png(f"{RP}/textures/items/wings_wand.png", ww, wh, wi)

pw, ph, pi = make_pack_icon(True); write_png(f"{RP}/pack_icon.png", pw, ph, pi)
pw, ph, pi = make_pack_icon(False); write_png(f"{BP}/pack_icon.png", pw, ph, pi)
print("texturas v2 generadas OK -", len(HEADS), "cabezas")
