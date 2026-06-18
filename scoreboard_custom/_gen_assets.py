#!/usr/bin/env python3
"""
Generador de assets PNG para "Scoreboard Custom" (Minecraft Bedrock).
Sin dependencias externas (PNG RGBA escrito a mano).

Genera:
  - RP/font/glyph_E1.png   -> hoja de glyphs (iconos) mapeados a U+E100..
  - RP/textures/custom_ui/*.png -> tiles/iconos del menu (ActionForm)
  - RP/pack_icon.png  y  BP/pack_icon.png
"""
import struct, zlib, os, math

BASE = os.path.dirname(os.path.abspath(__file__))
RP = os.path.join(BASE, "ScoreboardCustom_RP")
BP = os.path.join(BASE, "ScoreboardCustom_BP")

# ----------------------------------------------------------------- PNG IO
def write_png(path, img):
    h = len(img); w = len(img[0])
    raw = bytearray()
    for y in range(h):
        raw.append(0)
        for px in img[y]:
            raw += bytes(int(max(0, min(255, round(c)))) for c in px)
    def chunk(typ, data):
        c = struct.pack(">I", len(data)) + typ + data
        return c + struct.pack(">I", zlib.crc32(typ + data) & 0xffffffff)
    sig = b"\x89PNG\r\n\x1a\n"
    ihdr = struct.pack(">IIBBBBB", w, h, 8, 6, 0, 0, 0)
    idat = zlib.compress(bytes(raw), 9)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "wb") as f:
        f.write(sig + chunk(b"IHDR", ihdr) + chunk(b"IDAT", idat) + chunk(b"IEND", b""))
    print("  ->", os.path.relpath(path, BASE))

def blank(w, h, color=(0, 0, 0, 0)):
    return [[list(color) for _ in range(w)] for _ in range(h)]

# ----------------------------------------------------------------- color
def clampc(v): return max(0, min(255, v))
def mix(a, b, t): return tuple(a[i] + (b[i] - a[i]) * t for i in range(3))
def lighten(c, f): return mix(c, (255, 255, 255), f)
def darken(c, f): return mix(c, (0, 0, 0), f)

def blend(img, x, y, color, a=1.0):
    x = int(x); y = int(y)
    if not (0 <= x < len(img[0]) and 0 <= y < len(img)):
        return
    a = max(0.0, min(1.0, a)) * (color[3] / 255.0 if len(color) > 3 else 1.0)
    if a <= 0:
        return
    bg = img[y][x]
    ba = bg[3] / 255.0
    out_a = a + ba * (1 - a)
    if out_a <= 0:
        return
    for i in range(3):
        img[y][x][i] = (color[i] * a + bg[i] * ba * (1 - a)) / out_a
    img[y][x][3] = out_a * 255

def fill_circle(img, cx, cy, r, color, a=1.0, ss=3):
    for y in range(int(cy - r - 1), int(cy + r + 2)):
        for x in range(int(cx - r - 1), int(cx + r + 2)):
            cov = 0
            for sy in range(ss):
                for sx in range(ss):
                    px = x + (sx + 0.5) / ss - cx
                    py = y + (sy + 0.5) / ss - cy
                    if px * px + py * py <= r * r:
                        cov += 1
            if cov:
                blend(img, x, y, color, a * cov / (ss * ss))

def fill_rect(img, x0, y0, x1, y1, color, a=1.0):
    for y in range(int(round(y0)), int(round(y1))):
        for x in range(int(round(x0)), int(round(x1))):
            blend(img, x, y, color, a)

def fill_poly(img, pts, color, a=1.0, ss=3):
    xs = [p[0] for p in pts]; ys = [p[1] for p in pts]
    for y in range(int(min(ys)) - 1, int(max(ys)) + 2):
        for x in range(int(min(xs)) - 1, int(max(xs)) + 2):
            cov = 0
            for sy in range(ss):
                for sx in range(ss):
                    if point_in_poly(x + (sx + 0.5) / ss, y + (sy + 0.5) / ss, pts):
                        cov += 1
            if cov:
                blend(img, x, y, color, a * cov / (ss * ss))

def point_in_poly(px, py, pts):
    inside = False
    n = len(pts)
    j = n - 1
    for i in range(n):
        xi, yi = pts[i]; xj, yj = pts[j]
        if ((yi > py) != (yj > py)) and (px < (xj - xi) * (py - yi) / (yj - yi + 1e-9) + xi):
            inside = not inside
        j = i
    return inside

def vgrad(img, x0, y0, x1, y1, ctop, cbot, a=1.0):
    h = max(1, y1 - y0)
    for y in range(int(y0), int(y1)):
        t = (y - y0) / h
        c = mix(ctop, cbot, t)
        for x in range(int(x0), int(x1)):
            blend(img, x, y, c, a)

# ----------------------------------------------------------------- EMBLEMS
# Cada funcion dibuja un emblema centrado en una caja [ox,oy, ox+s, oy+s].
def E(ox, oy, s, fx, fy):
    return (ox + fx * s, oy + fy * s)

def em_volcano(img, ox, oy, s):
    # montana con lava y humo
    base = (78, 64, 70)
    fill_poly(img, [E(ox,oy,s,0.12,0.86), E(ox,oy,s,0.40,0.30),
                    E(ox,oy,s,0.60,0.30), E(ox,oy,s,0.88,0.86)],
              darken(base, 0.1) + (255,))
    fill_poly(img, [E(ox,oy,s,0.40,0.30), E(ox,oy,s,0.50,0.40),
                    E(ox,oy,s,0.60,0.30)], (60, 50, 55, 255))
    # lava cayendo
    lava_top = (255, 210, 70); lava_bot = (220, 60, 30)
    fill_poly(img, [E(ox,oy,s,0.43,0.33), E(ox,oy,s,0.57,0.33),
                    E(ox,oy,s,0.66,0.86), E(ox,oy,s,0.34,0.86)],
              (235, 110, 40, 255))
    fill_poly(img, [E(ox,oy,s,0.47,0.33), E(ox,oy,s,0.53,0.33),
                    E(ox,oy,s,0.58,0.86), E(ox,oy,s,0.42,0.86)],
              (255, 190, 60, 255))
    # chispas
    fill_circle(img, *E(ox,oy,s,0.50,0.22), s*0.05, (255, 150, 40, 255))
    fill_circle(img, *E(ox,oy,s,0.40,0.16), s*0.035, (255, 120, 30, 230))
    fill_circle(img, *E(ox,oy,s,0.61,0.18), s*0.03, (255, 200, 80, 230))

def em_fire(img, ox, oy, s):
    fill_poly(img, [E(ox,oy,s,0.5,0.08), E(ox,oy,s,0.78,0.45),
                    E(ox,oy,s,0.72,0.74), E(ox,oy,s,0.5,0.9),
                    E(ox,oy,s,0.28,0.74), E(ox,oy,s,0.22,0.45)],
              (235, 90, 30, 255))
    fill_poly(img, [E(ox,oy,s,0.5,0.26), E(ox,oy,s,0.66,0.52),
                    E(ox,oy,s,0.62,0.72), E(ox,oy,s,0.5,0.82),
                    E(ox,oy,s,0.38,0.72), E(ox,oy,s,0.34,0.52)],
              (255, 175, 45, 255))
    fill_poly(img, [E(ox,oy,s,0.5,0.46), E(ox,oy,s,0.58,0.64),
                    E(ox,oy,s,0.5,0.78), E(ox,oy,s,0.42,0.64)],
              (255, 235, 130, 255))

def em_air(img, ox, oy, s):
    col = (210, 235, 245)
    for (yy, x0, x1, w) in [(0.34, 0.16, 0.66, 0.075), (0.52, 0.16, 0.74, 0.085), (0.70, 0.16, 0.58, 0.07)]:
        fill_rect(img, ox+x0*s, oy+(yy-w/2)*s, ox+x1*s, oy+(yy+w/2)*s, col + (255,))
        # remolino al final
        fill_circle(img, ox+x1*s, oy+yy*s, w*s*0.95, (0,0,0,0))  # noop placeholder
    # circulos espirales al final de las dos lineas superiores
    fill_circle(img, ox+0.70*s, oy+0.34*s, 0.085*s, col + (255,))
    fill_circle(img, ox+0.70*s, oy+0.34*s, 0.045*s, (0,0,0,0))
    fill_circle(img, ox+0.78*s, oy+0.52*s, 0.095*s, col + (255,))
    fill_circle(img, ox+0.78*s, oy+0.52*s, 0.05*s, (0,0,0,0))

def em_water(img, ox, oy, s):
    drop = [E(ox,oy,s,0.5,0.10)]
    for i in range(0, 181, 12):
        a = math.radians(i)
        drop.append(E(ox,oy,s, 0.5 + 0.30*math.sin(a), 0.62 - 0.30*math.cos(a)))
    fill_poly(img, drop, (70, 150, 230, 255))
    drop2 = [E(ox,oy,s,0.5,0.26)]
    for i in range(0, 181, 12):
        a = math.radians(i)
        drop2.append(E(ox,oy,s, 0.5 + 0.20*math.sin(a), 0.62 - 0.20*math.cos(a)))
    fill_poly(img, drop2, (130, 200, 255, 255))
    fill_circle(img, ox+0.42*s, oy+0.6*s, 0.06*s, (235, 250, 255, 235))

def em_shadow(img, ox, oy, s):
    fill_circle(img, ox+0.5*s, oy+0.5*s, 0.36*s, (60, 40, 90, 255))
    fill_circle(img, ox+0.62*s, oy+0.42*s, 0.30*s, (120, 90, 170, 255))
    fill_circle(img, ox+0.62*s, oy+0.42*s, 0.30*s, (40, 28, 64, 0))
    # crescent: recortar con fondo
    fill_circle(img, ox+0.66*s, oy+0.40*s, 0.30*s, (0, 0, 0, 0))
    fill_circle(img, ox+0.34*s, oy+0.66*s, 0.05*s, (180, 150, 230, 230))

def em_light(img, ox, oy, s):
    c = (255, 220, 90)
    for i in range(8):
        a = math.radians(i * 45)
        x = ox + 0.5*s + math.cos(a) * 0.40*s
        y = oy + 0.5*s + math.sin(a) * 0.40*s
        fill_circle(img, x, y, 0.06*s, c + (255,))
    fill_circle(img, ox+0.5*s, oy+0.5*s, 0.24*s, (255, 235, 120, 255))
    fill_circle(img, ox+0.5*s, oy+0.5*s, 0.16*s, (255, 250, 200, 255))

def em_zombie(img, ox, oy, s):
    skin = (96, 156, 78)
    fill_rect(img, ox+0.24*s, oy+0.18*s, ox+0.76*s, oy+0.82*s, skin + (255,))
    fill_rect(img, ox+0.24*s, oy+0.18*s, ox+0.76*s, oy+0.30*s, lighten(skin, 0.12) + (255,))
    # ojos oscuros
    fill_rect(img, ox+0.32*s, oy+0.40*s, ox+0.45*s, oy+0.52*s, (30, 50, 28, 255))
    fill_rect(img, ox+0.55*s, oy+0.40*s, ox+0.68*s, oy+0.52*s, (30, 50, 28, 255))
    # boca
    fill_rect(img, ox+0.36*s, oy+0.62*s, ox+0.64*s, oy+0.70*s, (40, 60, 36, 255))
    for gx in (0.43, 0.5, 0.57):
        fill_rect(img, ox+gx*s, oy+0.62*s, ox+(gx+0.015)*s, oy+0.70*s, (20, 30, 18, 255))

def em_heart(img, ox, oy, s):
    c = (225, 55, 70)
    fill_circle(img, ox+0.36*s, oy+0.38*s, 0.16*s, c + (255,))
    fill_circle(img, ox+0.64*s, oy+0.38*s, 0.16*s, c + (255,))
    fill_poly(img, [E(ox,oy,s,0.21,0.44), E(ox,oy,s,0.79,0.44), E(ox,oy,s,0.5,0.84)], c + (255,))
    fill_circle(img, ox+0.40*s, oy+0.34*s, 0.05*s, (255, 180, 190, 235))

def em_star(img, ox, oy, s):
    pts = []
    for i in range(10):
        a = math.radians(-90 + i * 36)
        r = 0.42 if i % 2 == 0 else 0.18
        pts.append(E(ox,oy,s, 0.5 + math.cos(a) * r, 0.5 + math.sin(a) * r))
    fill_poly(img, pts, (255, 205, 60, 255))
    pts2 = []
    for i in range(10):
        a = math.radians(-90 + i * 36)
        r = 0.26 if i % 2 == 0 else 0.11
        pts2.append(E(ox,oy,s, 0.5 + math.cos(a) * r, 0.5 + math.sin(a) * r))
    fill_poly(img, pts2, (255, 240, 160, 255))

def em_coin(img, ox, oy, s):
    fill_circle(img, ox+0.5*s, oy+0.5*s, 0.40*s, (200, 150, 30, 255))
    fill_circle(img, ox+0.5*s, oy+0.5*s, 0.32*s, (255, 215, 70, 255))
    fill_circle(img, ox+0.42*s, oy+0.42*s, 0.10*s, (255, 245, 180, 230))
    fill_rect(img, ox+0.46*s, oy+0.30*s, ox+0.54*s, oy+0.70*s, (190, 140, 30, 255))

def em_diamond(img, ox, oy, s):
    c = (90, 220, 230)
    fill_poly(img, [E(ox,oy,s,0.5,0.12), E(ox,oy,s,0.84,0.42),
                    E(ox,oy,s,0.5,0.88), E(ox,oy,s,0.16,0.42)], c + (255,))
    fill_poly(img, [E(ox,oy,s,0.5,0.12), E(ox,oy,s,0.66,0.42),
                    E(ox,oy,s,0.5,0.5), E(ox,oy,s,0.34,0.42)], lighten(c, 0.4) + (255,))

def em_sword(img, ox, oy, s):
    blade = (220, 228, 235)
    fill_poly(img, [E(ox,oy,s,0.66,0.14), E(ox,oy,s,0.74,0.22),
                    E(ox,oy,s,0.40,0.62), E(ox,oy,s,0.32,0.54)], blade + (255,))
    fill_rect(img, ox+0.30*s, oy+0.56*s, ox+0.46*s, oy+0.62*s, (150, 110, 60, 255))
    fill_rect(img, ox+0.24*s, oy+0.62*s, ox+0.40*s, oy+0.70*s, (110, 80, 45, 255))
    fill_rect(img, ox+0.20*s, oy+0.70*s, ox+0.30*s, oy+0.82*s, (150, 110, 60, 255))

def em_skull(img, ox, oy, s):
    c = (235, 235, 225)
    fill_circle(img, ox+0.5*s, oy+0.44*s, 0.32*s, c + (255,))
    fill_rect(img, ox+0.34*s, oy+0.62*s, ox+0.66*s, oy+0.80*s, c + (255,))
    fill_circle(img, ox+0.40*s, oy+0.46*s, 0.09*s, (40, 40, 45, 255))
    fill_circle(img, ox+0.60*s, oy+0.46*s, 0.09*s, (40, 40, 45, 255))
    fill_rect(img, ox+0.46*s, oy+0.58*s, ox+0.54*s, oy+0.70*s, (60, 60, 65, 255))

def em_clock(img, ox, oy, s):
    fill_circle(img, ox+0.5*s, oy+0.5*s, 0.40*s, (60, 70, 90, 255))
    fill_circle(img, ox+0.5*s, oy+0.5*s, 0.34*s, (235, 240, 248, 255))
    fill_rect(img, ox+0.485*s, oy+0.26*s, ox+0.515*s, oy+0.52*s, (40, 50, 70, 255))
    fill_rect(img, ox+0.5*s, oy+0.485*s, ox+0.70*s, oy+0.515*s, (40, 50, 70, 255))

def em_crown(img, ox, oy, s):
    c = (255, 205, 60)
    fill_poly(img, [E(ox,oy,s,0.16,0.70), E(ox,oy,s,0.16,0.34),
                    E(ox,oy,s,0.33,0.52), E(ox,oy,s,0.5,0.26),
                    E(ox,oy,s,0.67,0.52), E(ox,oy,s,0.84,0.34),
                    E(ox,oy,s,0.84,0.70)], c + (255,))
    fill_rect(img, ox+0.16*s, oy+0.70*s, ox+0.84*s, oy+0.80*s, darken(c, 0.18) + (255,))
    for gx in (0.5, 0.27, 0.73):
        fill_circle(img, ox+gx*s, oy+0.30*s if gx == 0.5 else oy+0.40*s, 0.04*s, (235, 70, 90, 255))

def em_leaf(img, ox, oy, s):
    c = (90, 180, 70)
    fill_poly(img, [E(ox,oy,s,0.22,0.78), E(ox,oy,s,0.78,0.22),
                    E(ox,oy,s,0.80,0.50), E(ox,oy,s,0.50,0.80)], c + (255,))
    fill_poly(img, [E(ox,oy,s,0.22,0.78), E(ox,oy,s,0.78,0.22),
                    E(ox,oy,s,0.50,0.30)], lighten(c, 0.18) + (255,))
    fill_rect(img, ox+0.22*s, oy+0.76*s, ox+0.30*s, oy+0.84*s, (90, 70, 45, 255))

def em_head(img, ox, oy, s):
    skin = (235, 200, 165)
    fill_rect(img, ox+0.30*s, oy+0.16*s, ox+0.70*s, oy+0.40*s, (90, 60, 40, 255))  # pelo
    fill_rect(img, ox+0.30*s, oy+0.34*s, ox+0.70*s, oy+0.80*s, skin + (255,))
    fill_circle(img, ox+0.42*s, oy+0.52*s, 0.05*s, (40, 40, 60, 255))
    fill_circle(img, ox+0.58*s, oy+0.52*s, 0.05*s, (40, 40, 60, 255))
    fill_rect(img, ox+0.42*s, oy+0.66*s, ox+0.58*s, oy+0.70*s, (170, 110, 90, 255))

def em_trophy(img, ox, oy, s):
    c = (255, 205, 60)
    fill_rect(img, ox+0.34*s, oy+0.20*s, ox+0.66*s, oy+0.50*s, c + (255,))
    fill_poly(img, [E(ox,oy,s,0.34,0.50), E(ox,oy,s,0.66,0.50), E(ox,oy,s,0.5,0.66)], c + (255,))
    fill_rect(img, ox+0.46*s, oy+0.64*s, ox+0.54*s, oy+0.74*s, darken(c, 0.2) + (255,))
    fill_rect(img, ox+0.36*s, oy+0.74*s, ox+0.64*s, oy+0.82*s, darken(c, 0.25) + (255,))
    fill_circle(img, ox+0.30*s, oy+0.30*s, 0.09*s, (0,0,0,0))
    fill_circle(img, ox+0.70*s, oy+0.30*s, 0.09*s, (0,0,0,0))

def em_shield(img, ox, oy, s):
    c = (90, 130, 210)
    fill_poly(img, [E(ox,oy,s,0.5,0.14), E(ox,oy,s,0.82,0.26),
                    E(ox,oy,s,0.82,0.56), E(ox,oy,s,0.5,0.86),
                    E(ox,oy,s,0.18,0.56), E(ox,oy,s,0.18,0.26)], c + (255,))
    fill_poly(img, [E(ox,oy,s,0.5,0.22), E(ox,oy,s,0.5,0.78),
                    E(ox,oy,s,0.26,0.52), E(ox,oy,s,0.26,0.30)], lighten(c, 0.2) + (255,))

def em_bolt(img, ox, oy, s):
    c = (255, 225, 70)
    fill_poly(img, [E(ox,oy,s,0.56,0.12), E(ox,oy,s,0.30,0.56),
                    E(ox,oy,s,0.48,0.56), E(ox,oy,s,0.42,0.88),
                    E(ox,oy,s,0.72,0.42), E(ox,oy,s,0.52,0.42)], c + (255,))

def em_gem(img, ox, oy, s):
    c = (60, 210, 120)
    fill_poly(img, [E(ox,oy,s,0.30,0.30), E(ox,oy,s,0.70,0.30),
                    E(ox,oy,s,0.86,0.50), E(ox,oy,s,0.5,0.86),
                    E(ox,oy,s,0.14,0.50)], c + (255,))
    fill_poly(img, [E(ox,oy,s,0.30,0.30), E(ox,oy,s,0.70,0.30),
                    E(ox,oy,s,0.5,0.52)], lighten(c, 0.3) + (255,))

def em_arrow(img, ox, oy, s):
    c = (230, 230, 240)
    fill_rect(img, ox+0.18*s, oy+0.42*s, ox+0.62*s, oy+0.58*s, c + (255,))
    fill_poly(img, [E(ox,oy,s,0.58,0.26), E(ox,oy,s,0.86,0.5),
                    E(ox,oy,s,0.58,0.74)], c + (255,))

def em_dot(img, ox, oy, s):
    fill_circle(img, ox+0.5*s, oy+0.5*s, 0.16*s, (220, 225, 235, 255))
    fill_circle(img, ox+0.45*s, oy+0.45*s, 0.06*s, (255, 255, 255, 220))

# ----------------------------------------------------------------- GLYPH SHEET
# Mapeo: nombre -> (col, row).  char = 0xE100 + row*16 + col
GLYPHS = [
    ("volcano", em_volcano), ("fire", em_fire), ("air", em_air), ("water", em_water),
    ("shadow", em_shadow), ("light", em_light), ("zombie", em_zombie), ("heart", em_heart),
    ("star", em_star), ("coin", em_coin), ("diamond", em_diamond), ("sword", em_sword),
    ("skull", em_skull), ("clock", em_clock), ("crown", em_crown), ("leaf", em_leaf),
    ("head", em_head), ("trophy", em_trophy), ("shield", em_shield), ("bolt", em_bolt),
    ("gem", em_gem), ("arrow", em_arrow), ("dot", em_dot),
]

def gen_glyph_sheet():
    cs = 32  # cell size -> 512x512
    grid = 16
    img = blank(cs * grid, cs * grid, (0, 0, 0, 0))
    for idx, (name, fn) in enumerate(GLYPHS):
        col = idx % grid
        row = idx // grid
        pad = cs * 0.08
        fn(img, col * cs + pad, row * cs + pad, cs - 2 * pad)
    write_png(os.path.join(RP, "font", "glyph_E1.png"), img)

# ----------------------------------------------------------------- UI TILES
def rounded_tile(size, c_top, c_bot, edge):
    img = blank(size, size, (0, 0, 0, 0))
    r = size * 0.18
    # mascara redondeada con AA
    ss = 3
    for y in range(size):
        for x in range(size):
            cov = 0
            for sy in range(ss):
                for sx in range(ss):
                    px = x + (sx + 0.5) / ss; py = y + (sy + 0.5) / ss
                    inside = True
                    cx = min(px, size - px); cy = min(py, size - py)
                    if cx < r and cy < r:
                        if (r - cx) ** 2 + (r - cy) ** 2 > r * r:
                            inside = False
                    if inside:
                        cov += 1
            if cov:
                t = y / size
                col = mix(c_top, c_bot, t)
                blend(img, x, y, col + (255,), cov / (ss * ss))
    # bisel superior (brillo)
    for y in range(int(size * 0.06), int(size * 0.18)):
        for x in range(int(size * 0.12), int(size * 0.88)):
            blend(img, x, y, (255, 255, 255), 0.10)
    # borde
    for y in range(size):
        for x in range(size):
            if img[y][x][3] > 0:
                edgepx = (x < size*0.06 or x > size*0.94 or y < size*0.06 or y > size*0.94)
                if edgepx:
                    blend(img, x, y, edge, 0.5)
    return img

def gen_ui():
    out = os.path.join(RP, "textures", "custom_ui")
    size = 96
    # iconos de menu: (archivo, color_top, color_bot, emblema)
    items = [
        ("icon_power",   (90, 200, 120), (40, 130, 70),  em_bolt),
        ("icon_edit",    (120, 170, 240),(60, 100, 190),  em_arrow),
        ("icon_add",     (110, 210, 130),(50, 140, 80),   em_star),
        ("icon_delete",  (235, 110, 110),(170, 50, 50),   em_skull),
        ("icon_info",    (120, 200, 235),(60, 130, 190),  em_dot),
        ("icon_reload",  (180, 160, 240),(110, 90, 200),  em_clock),
        ("icon_reset",   (240, 190, 90), (190, 120, 40),  em_clock),
        ("icon_image",   (235, 170, 220),(170, 90, 170),  em_diamond),
        ("icon_lines",   (150, 175, 200),(90, 110, 150),  em_arrow),
        ("icon_title",   (240, 210, 110),(190, 150, 50),  em_crown),
        ("icon_template",(150, 200, 220),(80, 140, 180),  em_shield),
    ]
    for name, ct, cb, em in items:
        img = rounded_tile(size, ct, cb, darken(cb, 0.4))
        em(img, size * 0.18, size * 0.18, size * 0.64)
        write_png(os.path.join(out, name + ".png"), img)

    # tiles por template
    templates = [
        ("t_volcan", (250, 120, 60), (150, 30, 25),  em_volcano),
        ("t_aire",   (200, 235, 250),(120, 175, 215), em_air),
        ("t_agua",   (90, 170, 240), (30, 80, 175),   em_water),
        ("t_sombra", (130, 100, 180),(45, 30, 75),    em_shadow),
        ("t_luz",    (255, 235, 130),(225, 175, 50),  em_light),
        ("t_zombies",(120, 180, 90), (50, 110, 45),   em_zombie),
    ]
    for name, ct, cb, em in templates:
        img = rounded_tile(size, ct, cb, darken(cb, 0.4))
        em(img, size * 0.18, size * 0.18, size * 0.64)
        write_png(os.path.join(out, name + ".png"), img)

# ----------------------------------------------------------------- PACK ICON
def gen_pack_icon():
    size = 256
    img = rounded_tile(size, (60, 75, 110), (24, 28, 46), (10, 12, 20))
    # marco interior (placa de scoreboard)
    fill_rect(img, size*0.16, size*0.18, size*0.84, size*0.82, (18, 22, 36, 235))
    fill_rect(img, size*0.16, size*0.18, size*0.84, size*0.30, (235, 180, 60, 255))
    # lineas tipo scoreboard
    for i, c in enumerate([(235,90,40),(120,200,255),(180,140,235),(255,225,110)]):
        y = size*(0.36 + i*0.11)
        fill_rect(img, size*0.22, y, size*0.70, y + size*0.06, (60, 70, 95, 255))
        fill_circle(img, size*0.27, y + size*0.03, size*0.028, c + (255,))
    # emblema volcan en esquina-titulo
    em_volcano(img, size*0.62, size*0.18, size*0.18)
    write_png(os.path.join(RP, "pack_icon.png"), img)
    write_png(os.path.join(BP, "pack_icon.png"), img)

if __name__ == "__main__":
    print("Generando assets de Scoreboard Custom...")
    gen_glyph_sheet()
    gen_ui()
    gen_pack_icon()
    print("Listo.")
