#!/usr/bin/env python3
"""Genera imágenes PNG tipo 'escena de Minecraft' (mundo isométrico con
cielo, sol, agua, colinas, árboles y un personaje) para los productos.
Solo stdlib (zlib, struct, math, random). Determinista por slug."""
import zlib, struct, os, math, random

def write_png(path, w, h, buf, color_type=2):
    ch = 3 if color_type == 2 else 4
    raw = bytearray()
    stride = w * ch
    for y in range(h):
        raw.append(0)
        raw.extend(buf[y*stride:(y+1)*stride])
    def chunk(tag, data):
        return struct.pack('>I', len(data)) + tag + data + struct.pack('>I', zlib.crc32(tag+data) & 0xffffffff)
    sig = b'\x89PNG\r\n\x1a\n'
    ihdr = struct.pack('>IIBBBBB', w, h, 8, color_type, 0, 0, 0)
    idat = zlib.compress(bytes(raw), 9)
    open(path, 'wb').write(sig + chunk(b'IHDR', ihdr) + chunk(b'IDAT', idat) + chunk(b'IEND', b''))

class C:
    def __init__(s, w, h):
        s.w, s.h = w, h
        s.buf = bytearray(w*h*3)
    def set(s, x, y, r, g, b):
        if 0 <= x < s.w and 0 <= y < s.h:
            i = (y*s.w + x)*3
            s.buf[i], s.buf[i+1], s.buf[i+2] = r & 255, g & 255, b & 255
    def blend(s, x, y, r, g, b, a):
        if a <= 0 or not (0 <= x < s.w and 0 <= y < s.h): return
        if a >= 255: s.set(x, y, r, g, b); return
        i = (y*s.w + x)*3; t = a/255.0
        s.buf[i]   = int(s.buf[i]*(1-t)+r*t)
        s.buf[i+1] = int(s.buf[i+1]*(1-t)+g*t)
        s.buf[i+2] = int(s.buf[i+2]*(1-t)+b*t)
    def save(s, p): write_png(p, s.w, s.h, s.buf, 2)

def lerp(a, b, t): return a+(b-a)*t
def mix(a, b, t): return tuple(int(lerp(a[k], b[k], t)) for k in range(3))

def poly(cv, pts, col, a=255):
    ys = [p[1] for p in pts]
    y0, y1 = max(0, int(min(ys))), min(cv.h-1, int(max(ys)))
    n = len(pts)
    for y in range(y0, y1+1):
        xs = []
        for i in range(n):
            x1, yy1 = pts[i]; x2, yy2 = pts[(i+1) % n]
            if (yy1 <= y < yy2) or (yy2 <= y < yy1):
                xs.append(x1 + (y-yy1)*(x2-x1)/(yy2-yy1))
        xs.sort()
        for k in range(0, len(xs)-1, 2):
            for x in range(int(xs[k]), int(xs[k+1])+1):
                cv.blend(x, y, col[0], col[1], col[2], a)

def rect(cv, x, y, w, h, col, a=255):
    for yy in range(int(y), int(y+h)):
        for xx in range(int(x), int(x+w)):
            cv.blend(xx, yy, col[0], col[1], col[2], a)

def sky(cv, top, bot):
    for y in range(cv.h):
        c = mix(top, bot, y/(cv.h-1))
        for x in range(cv.w):
            cv.set(x, y, *c)

def sun(cv, cx, cy, r, col):
    for y in range(cv.h):
        for x in range(cv.w):
            d = math.hypot(x-cx, y-cy)
            if d < r*2.6:
                a = int(max(0, 1-d/(r*2.6))*120)
                cv.blend(x, y, col[0], col[1], col[2], a)
    # disco sólido pixelado
    rr = int(r)
    for y in range(cy-rr, cy+rr):
        for x in range(cx-rr, cx+rr):
            if math.hypot(x-cx, y-cy) < r:
                cv.set(x, y, *col)

def cloud(cv, x, y, s):
    col = (245, 250, 255)
    for (dx, dy, w, h) in [(0, 6, 9, 3), (3, 3, 6, 4), (6, 5, 7, 3), (1, 8, 11, 2)]:
        rect(cv, x+dx*s, y+dy*s, w*s, h*s, col, 230)

def vignette(cv, st=0.5):
    cx, cy = cv.w/2, cv.h/2; md = math.hypot(cx, cy)
    for y in range(cv.h):
        for x in range(cv.w):
            d = math.hypot(x-cx, y-cy)/md
            a = int(max(0, d-0.5)*st*255)
            if a: cv.blend(x, y, 0, 0, 12, min(a, 150))

# proyección isométrica
TW, TH, BH = 46, 23, 13
OX, OY = 320, 92

def tile_screen(i, j, h):
    sx = OX + (i-j)*TW//2
    sy = OY + (i+j)*TH//2 - h*BH
    return sx, sy

def biome(h, snow_line=5):
    if h <= 1:   return ('water', (74, 163, 224), (44, 120, 180), (32, 96, 150))
    if h == 2:   return ('sand',  (224, 206, 138), (196, 176, 110), (170, 150, 92))
    if h >= snow_line: return ('snow', (236, 243, 248), (180, 196, 214), (150, 168, 190))
    if h >= 4:   return ('rock',  (138, 143, 153), (110, 116, 126), (92, 98, 108))
    return ('grass', (108, 191, 79), (122, 82, 48), (107, 69, 39))

def draw_cube(cv, sx, sy, sideH, top, sl, sr, tint=None, ta=0):
    tp = [(sx, sy-TH//2), (sx+TW//2, sy), (sx, sy+TH//2), (sx-TW//2, sy)]
    lf = [(sx-TW//2, sy), (sx, sy+TH//2), (sx, sy+TH//2+sideH), (sx-TW//2, sy+sideH)]
    rf = [(sx+TW//2, sy), (sx, sy+TH//2), (sx, sy+TH//2+sideH), (sx+TW//2, sy+sideH)]
    poly(cv, lf, sl); poly(cv, rf, sr); poly(cv, tp, top)
    if tint:
        poly(cv, tp, tint, ta)

def draw_tree(cv, sx, sy):
    rect(cv, sx-2, sy-14, 4, 16, (90, 58, 30))
    draw_cube(cv, sx, sy-22, 8, (86, 170, 70), (54, 120, 46), (44, 104, 40))
    draw_cube(cv, sx, sy-30, 6, (104, 188, 84), (66, 136, 56), (52, 116, 46))

def draw_char(cv, sx, sy):
    # personaje estilo bloque (Steve-like): piernas, torso, cabeza
    rect(cv, sx-5, sy-10, 4, 10, (40, 44, 92))      # pierna izq
    rect(cv, sx+1, sy-10, 4, 10, (40, 44, 92))      # pierna der
    rect(cv, sx-6, sy-22, 12, 12, (26, 178, 170))   # torso (camiseta turquesa)
    rect(cv, sx-7, sy-21, 3, 9, (228, 178, 120))    # brazo izq
    rect(cv, sx+4, sy-21, 3, 9, (228, 178, 120))    # brazo der
    rect(cv, sx-5, sy-33, 10, 11, (232, 188, 140))  # cabeza
    rect(cv, sx-5, sy-33, 10, 4, (74, 52, 34))       # pelo
    cv.set(sx-2, sy-27, 30, 30, 40); cv.set(sx+2, sy-27, 30, 30, 40)  # ojos

THEMES = {
    'dragon':    dict(sky=((255, 150, 70), (255, 214, 150)),  sun=(255, 236, 170), sx=540, sy=70, snow=9),
    'shaders':   dict(sky=((70, 150, 230), (180, 224, 255)),  sun=(255, 250, 210), sx=520, sy=66, snow=5),
    'medieval':  dict(sky=((250, 196, 120), (255, 232, 180)), sun=(255, 244, 200), sx=110, sy=70, snow=5),
    'cyber':     dict(sky=((60, 24, 90), (150, 60, 170)),     sun=(255, 120, 220), sx=540, sy=64, snow=9),
    'textures':  dict(sky=((86, 170, 240), (200, 235, 255)),  sun=(255, 252, 220), sx=520, sy=60, snow=5),
    'ninja':     dict(sky=((40, 44, 90), (120, 96, 180)),     sun=(220, 220, 255), sx=120, sy=64, snow=9),
    'tools':     dict(sky=((250, 180, 90), (255, 226, 160)),  sun=(255, 240, 190), sx=520, sy=70, snow=5),
    'economy':   dict(sky=((96, 190, 150), (200, 240, 210)),  sun=(255, 252, 220), sx=520, sy=64, snow=5),
    'furniture': dict(sky=((250, 200, 150), (255, 232, 200)), sun=(255, 244, 210), sx=520, sy=70, snow=9),
    'galaxy':    dict(sky=((24, 20, 60), (70, 54, 140)),      sun=(210, 200, 255), sx=520, sy=58, snow=9),
}

def gen(slug, th):
    cv = C(640, 400)
    sky(cv, th['sky'][0], th['sky'][1])
    if slug == 'galaxy':
        rnd = random.Random(99)
        for _ in range(120):
            x, y = rnd.randint(0, 639), rnd.randint(0, 150)
            cv.blend(x, y, 255, 255, 255, rnd.randint(120, 255))
    sun(cv, th['sx'], th['sy'], 26, th['sun'])
    cloud(cv, 60, 60, 3); cloud(cv, 300, 40, 2); cloud(cv, 430, 90, 2)

    rnd = random.Random(sum(ord(c) for c in slug) * 7 + 3)
    cols = rows = 11
    fi = rnd.uniform(0, 6); fj = rnd.uniform(0, 6)
    hmap = [[0]*cols for _ in range(rows)]
    for i in range(rows):
        for j in range(cols):
            v = 2.5 + 1.7*math.sin(i*0.55+fi) + 1.4*math.cos(j*0.5+fj) + rnd.uniform(-0.4, 0.4)
            hmap[i][j] = max(0, min(5, int(round(v))))

    tiles = sorted([(i, j) for i in range(rows) for j in range(cols)], key=lambda t: (t[0]+t[1], t[0]))
    # personaje sobre el tile alto más central
    best = None
    for (i, j) in tiles:
        h = hmap[i][j]
        if h >= 3:
            d = abs(i-rows//2)+abs(j-cols//2)
            if best is None or (h, -d) > best[0]:
                best = ((h, -d), i, j)
    char_tile = (best[1], best[2]) if best else None

    for (i, j) in tiles:
        h = hmap[i][j]
        name, top, sl, sr = biome(h, th['snow'])
        sx, sy = tile_screen(i, j, h)
        sideH = h*BH + 12
        if name == 'water':
            sideH = 8
            draw_cube(cv, sx, sy, sideH, top, sl, sr, (255, 255, 255), 30)
        else:
            draw_cube(cv, sx, sy, sideH, top, sl, sr)
        if name == 'grass' and rnd.random() < 0.16 and (i, j) != char_tile:
            draw_tree(cv, sx, sy)

    if char_tile:
        sx, sy = tile_screen(char_tile[0], char_tile[1], hmap[char_tile[0]][char_tile[1]])
        draw_char(cv, sx, sy)

    # barra de acento inferior con el color del sol
    for y in range(392, 400):
        for x in range(cv.w):
            cv.set(x, y, *th['sun'])
    vignette(cv, 0.55)
    cv.save(f"assets/products/{slug}.png")
    print("escena:", slug)

def gen_hero():
    global OX, OY
    cv = C(1280, 440)
    sky(cv, (255, 150, 70), (255, 224, 170))
    sun(cv, 1040, 78, 34, (255, 240, 180))
    cloud(cv, 120, 60, 4); cloud(cv, 520, 44, 3); cloud(cv, 820, 80, 3); cloud(cv, 300, 100, 2)
    OX, OY = 640, 60
    rnd = random.Random(2026)
    cols = rows = 18
    fi = rnd.uniform(0, 6); fj = rnd.uniform(0, 6)
    hmap = [[0]*cols for _ in range(rows)]
    for i in range(rows):
        for j in range(cols):
            v = 2.5 + 1.8*math.sin(i*0.5+fi) + 1.5*math.cos(j*0.45+fj) + rnd.uniform(-0.4, 0.4)
            hmap[i][j] = max(0, min(5, int(round(v))))
    tiles = sorted([(i, j) for i in range(rows) for j in range(cols)], key=lambda t: (t[0]+t[1], t[0]))
    for (i, j) in tiles:
        h = hmap[i][j]
        name, top, sl, sr = biome(h, 5)
        sx, sy = tile_screen(i, j, h)
        if sx < -60 or sx > 1340:
            continue
        sideH = h*BH + 12
        if name == 'water':
            draw_cube(cv, sx, sy, 8, top, sl, sr, (255, 255, 255), 30)
        else:
            draw_cube(cv, sx, sy, sideH, top, sl, sr)
            if name == 'grass' and rnd.random() < 0.14:
                draw_tree(cv, sx, sy)
    vignette(cv, 0.5)
    cv.save("assets/hero.png")
    print("escena: hero (banner)")
    OX, OY = 320, 92

os.makedirs("assets/products", exist_ok=True)
for slug, th in THEMES.items():
    gen(slug, th)
gen_hero()
print("OK")
