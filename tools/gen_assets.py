#!/usr/bin/env python3
"""Generador de PNGs profesionales (sin PIL): productos + texturas.
Usa solo stdlib (zlib, struct). Determinista (semilla fija)."""
import zlib, struct, os, math, random

def write_png(path, w, h, buf, color_type):
    """buf: bytearray RGB (ct=2) o RGBA (ct=6), sin byte de filtro."""
    ch = 3 if color_type == 2 else 4
    raw = bytearray()
    stride = w * ch
    for y in range(h):
        raw.append(0)  # filtro None
        raw.extend(buf[y*stride:(y+1)*stride])
    def chunk(tag, data):
        c = struct.pack('>I', len(data)) + tag + data
        return c + struct.pack('>I', zlib.crc32(tag + data) & 0xffffffff)
    sig = b'\x89PNG\r\n\x1a\n'
    ihdr = struct.pack('>IIBBBBB', w, h, 8, color_type, 0, 0, 0)
    idat = zlib.compress(bytes(raw), 9)
    with open(path, 'wb') as f:
        f.write(sig + chunk(b'IHDR', ihdr) + chunk(b'IDAT', idat) + chunk(b'IEND', b''))

class Canvas:
    def __init__(self, w, h, ct=2):
        self.w, self.h, self.ch = w, h, (3 if ct == 2 else 4)
        self.ct = ct
        self.buf = bytearray(w * h * self.ch)
    def set(self, x, y, r, g, b, a=255):
        if x < 0 or y < 0 or x >= self.w or y >= self.h:
            return
        i = (y * self.w + x) * self.ch
        if self.ch == 3:
            self.buf[i] = r & 255; self.buf[i+1] = g & 255; self.buf[i+2] = b & 255
        else:
            self.buf[i] = r & 255; self.buf[i+1] = g & 255; self.buf[i+2] = b & 255; self.buf[i+3] = a & 255
    def blend(self, x, y, r, g, b, a):
        if a <= 0: return
        if a >= 255: self.set(x, y, r, g, b, 255); return
        if x < 0 or y < 0 or x >= self.w or y >= self.h: return
        i = (y * self.w + x) * self.ch
        ba = a / 255.0
        self.buf[i]   = int(self.buf[i]   * (1-ba) + r * ba)
        self.buf[i+1] = int(self.buf[i+1] * (1-ba) + g * ba)
        self.buf[i+2] = int(self.buf[i+2] * (1-ba) + b * ba)
        if self.ch == 4:
            self.buf[i+3] = max(self.buf[i+3], a)
    def save(self, path):
        write_png(path, self.w, self.h, self.buf, self.ct)

def lerp(a, b, t): return a + (b - a) * t
def mix(c1, c2, t): return tuple(int(lerp(c1[k], c2[k], t)) for k in range(3))

def fill_poly(cv, pts, color, alpha=255):
    ys = [p[1] for p in pts]
    y0, y1 = max(0, int(min(ys))), min(cv.h-1, int(max(ys)))
    n = len(pts)
    for y in range(y0, y1+1):
        xs = []
        for i in range(n):
            x1, yy1 = pts[i]; x2, yy2 = pts[(i+1) % n]
            if (yy1 <= y < yy2) or (yy2 <= y < yy1):
                xs.append(x1 + (y - yy1) * (x2 - x1) / (yy2 - yy1))
        xs.sort()
        for k in range(0, len(xs)-1, 2):
            for x in range(int(xs[k]), int(xs[k+1])+1):
                cv.blend(x, y, color[0], color[1], color[2], alpha)

def vgrad(cv, top, bot):
    for y in range(cv.h):
        t = y / (cv.h - 1)
        c = mix(top, bot, t)
        for x in range(cv.w):
            cv.set(x, y, *c)

def vignette(cv, strength=0.55):
    cx, cy = cv.w/2, cv.h/2
    maxd = math.hypot(cx, cy)
    for y in range(cv.h):
        for x in range(cv.w):
            d = math.hypot(x-cx, y-cy)/maxd
            a = int(max(0, (d-0.45)) * strength * 255)
            if a > 0: cv.blend(x, y, 0, 0, 0, min(a, 200))

def pixel_grid(cv, step=20, alpha=14):
    for y in range(cv.h):
        for x in range(cv.w):
            if x % step == 0 or y % step == 0:
                cv.blend(x, y, 255, 255, 255, alpha)

def light_streak(cv, alpha=42):
    for y in range(cv.h):
        for x in range(cv.w):
            band = (x + y)
            if 120 < (band % 360) < 165:
                cv.blend(x, y, 255, 255, 255, alpha)

def iso_cube(cv, cx, cy, size, top, side_l, side_r, alpha=235):
    s = size
    top_pts  = [(cx, cy-s), (cx+s, cy-s*0.5), (cx, cy), (cx-s, cy-s*0.5)]
    left_pts = [(cx-s, cy-s*0.5), (cx, cy), (cx, cy+s), (cx-s, cy+s*0.5)]
    right_pts= [(cx+s, cy-s*0.5), (cx, cy), (cx, cy+s), (cx+s, cy+s*0.5)]
    fill_poly(cv, left_pts, side_l, alpha)
    fill_poly(cv, right_pts, side_r, alpha)
    fill_poly(cv, top_pts, top, alpha)

def diamond(cv, cx, cy, size, c_light, c_dark, alpha=235):
    s = size
    fill_poly(cv, [(cx, cy-s), (cx+s*0.7, cy-s*0.2), (cx, cy*1.0), (cx-s*0.7, cy-s*0.2)], c_light, alpha)
    fill_poly(cv, [(cx-s*0.7, cy-s*0.2), (cx, cy), (cx, cy+s)], c_dark, alpha)
    fill_poly(cv, [(cx+s*0.7, cy-s*0.2), (cx, cy), (cx, cy+s)], mix(c_dark, (0,0,0), 0.18), alpha)

# ---- definición de productos (color base + motivo) ----
PRODUCTS = [
    ("dragon",    (44,16,28), (120,28,52),  "cube",    (230,90,110),(150,40,66),(110,26,48)),
    ("shaders",   (10,26,40), (24,86,140),  "diamond", (150,220,255),(40,120,180)),
    ("medieval",  (28,30,18), (78,86,40),   "cube",    (150,170,90),(96,110,52),(70,82,38)),
    ("cyber",     (26,12,40), (108,40,150), "diamond", (210,150,255),(110,40,170)),
    ("textures",  (12,30,34), (28,110,116), "cube",    (90,210,210),(40,140,142),(28,104,106)),
    ("ninja",     (14,16,24), (44,52,84),   "cube",    (120,130,180),(70,80,120),(48,56,90)),
    ("tools",     (32,22,8),  (140,96,24),  "diamond", (255,210,110),(170,120,30)),
    ("economy",   (10,32,22), (26,120,80),  "cube",    (90,220,150),(40,150,100),(28,112,74)),
    ("furniture", (34,20,12), (150,84,40),  "cube",    (235,160,96),(160,98,52),(120,72,38)),
    ("galaxy",    (14,12,34), (52,40,130),  "diamond", (170,150,255),(80,60,180)),
]

os.makedirs("assets/products", exist_ok=True)
os.makedirs("assets/tex", exist_ok=True)

for p in PRODUCTS:
    name, top, bot, motif = p[0], p[1], p[2], p[3]
    cv = Canvas(640, 400, 2)
    vgrad(cv, mix(top, (255,255,255), 0.04), bot)
    # halo
    for y in range(cv.h):
        for x in range(cv.w):
            d = math.hypot(x-440, y-150)/300
            if d < 1: cv.blend(x, y, 255, 255, 255, int((1-d)*26))
    light_streak(cv)
    if motif == "cube":
        iso_cube(cv, 430, 210, 120, p[4], p[5], p[6])
        iso_cube(cv, 180, 250, 64, mix(p[4],(255,255,255),0.1), p[5], p[6], 150)
    else:
        diamond(cv, 430, 200, 130, p[4], p[5])
        diamond(cv, 175, 250, 66, p[4], p[5], 150)
    pixel_grid(cv, 20, 12)
    # barra de acento inferior
    for y in range(388, 400):
        for x in range(cv.w):
            cv.set(x, y, *p[4])
    vignette(cv, 0.6)
    cv.save(f"assets/products/{name}.png")
    print("producto:", name)

# ---- texturas RGBA profesionales ----
random.seed(7)
# grano fino
g = Canvas(160, 160, 6)
for y in range(160):
    for x in range(160):
        v = random.randint(0, 255)
        a = 10 if v > 210 else (8 if v < 36 else 0)
        col = 255 if v > 210 else 0
        g.set(x, y, col, col, col, a)
g.save("assets/tex/grain.png")
print("textura: grain")

# papel suave (ruido de baja frecuencia)
random.seed(21)
base = [[random.uniform(-1,1) for _ in range(42)] for _ in range(42)]
pa = Canvas(220, 220, 6)
for y in range(220):
    for x in range(220):
        gx, gy = x/220*40, y/220*40
        ix, iy = int(gx), int(gy)
        v = base[iy][ix]
        a = int(abs(v) * 16)
        col = 255 if v > 0 else 0
        pa.set(x, y, col, col, col, min(a, 16))
pa.save("assets/tex/paper.png")
print("textura: paper")

# trama diagonal sutil (relieve)
we = Canvas(24, 24, 6)
for y in range(24):
    for x in range(24):
        if (x + y) % 6 == 0:
            we.set(x, y, 255, 255, 255, 12)
        elif (x + y) % 6 == 3:
            we.set(x, y, 0, 0, 0, 14)
we.save("assets/tex/weave.png")
print("textura: weave")
print("OK")
