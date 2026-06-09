#!/usr/bin/env python3
"""Genera assets graficos de Hologram Studio (sin dependencias):
 - pack_icon.png (256x256) estilo holograma profesional
 - textures/entity/holo_blank.png (transparente, para la entidad invisible)
 - textures/items/holo_wand.png (icono de varita holografica)
PNG escrito a mano con zlib (no requiere PIL).
"""
import struct, zlib, os, math

ROOT = os.path.dirname(__file__)


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


def blank(w, h, c=(0, 0, 0, 0)):
    return [[list(c) for _ in range(w)] for _ in range(h)]


def over(img, x, y, col, a):
    if not (0 <= x < len(img[0]) and 0 <= y < len(img)):
        return
    a = max(0.0, min(1.0, a))
    if a <= 0:
        return
    bg = img[y][x]
    ba = bg[3] / 255.0
    oa = a + ba * (1 - a)
    if oa <= 0:
        return
    for i in range(3):
        img[y][x][i] = (col[i] * a + bg[i] * ba * (1 - a)) / oa
    img[y][x][3] = oa * 255


def lerp(a, b, t):
    return [a[i] + (b[i] - a[i]) * t for i in range(3)]


# ---------------------------------------------------------------- pack icon
def pack_icon(size=256):
    img = blank(size, size)
    top = (10, 12, 38)
    bot = (28, 18, 64)
    # fondo degradado vertical + viñeta
    for y in range(size):
        t = y / (size - 1)
        row = lerp(top, bot, t)
        for x in range(size):
            dx = (x - size / 2) / (size / 2)
            dy = (y - size / 2) / (size / 2)
            vig = max(0.0, 1 - (dx * dx + dy * dy) * 0.55)
            col = [row[i] * (0.6 + 0.4 * vig) for i in range(3)]
            img[y][x] = [col[0], col[1], col[2], 255]

    cx = size / 2
    cyan = (0, 220, 255)
    purple = (150, 90, 255)

    # base / emisor del holograma (elipse glow abajo)
    by = size * 0.80
    for y in range(size):
        for x in range(size):
            dx = (x - cx) / (size * 0.32)
            dy = (y - by) / (size * 0.055)
            d = dx * dx + dy * dy
            if d < 1.0:
                over(img, x, y, lerp(cyan, (255, 255, 255), 1 - d), (1 - d) * 0.9)
            elif d < 2.4:
                over(img, x, y, cyan, max(0, (2.4 - d) / 1.4) * 0.25)

    # haz de luz que sube desde el emisor
    for y in range(int(size * 0.30), int(by)):
        ty = (by - y) / (by - size * 0.30)
        halfw = size * (0.05 + 0.20 * ty)
        for x in range(int(cx - halfw), int(cx + halfw) + 1):
            edge = 1 - abs((x - cx) / halfw)
            over(img, x, y, lerp(cyan, purple, ty), edge * 0.10 * (1 - ty * 0.3))

    # barras de "texto" holografico flotando (lineas)
    bars = [
        (0.30, 0.34, 0.40),
        (0.27, 0.46, 0.34),
        (0.32, 0.58, 0.30),
    ]
    for x0f, yf, wf in bars:
        y0 = int(size * yf)
        h = int(size * 0.060)
        x0 = int(size * x0f)
        w = int(size * wf)
        for y in range(y0, y0 + h):
            ry = (y - y0) / max(1, h - 1)
            for x in range(x0, x0 + w):
                rx = (x - x0) / max(1, w - 1)
                # bordes redondeados-ish + degradado cian->morado
                if rx < 0.04 or rx > 0.96:
                    a = 0.0
                else:
                    a = 0.85
                col = lerp(cyan, purple, rx)
                # brillo superior
                col = lerp(col, (255, 255, 255), max(0, 0.5 - ry) * 0.6)
                over(img, x, y, col, a)
        # glow alrededor de la barra
        for y in range(y0 - 4, y0 + h + 4):
            for x in range(x0 - 6, x0 + w + 6):
                if y0 <= y < y0 + h and x0 <= x < x0 + w:
                    continue
                over(img, x, y, cyan, 0.06)

    # scanlines holograficas
    for y in range(int(size * 0.28), int(size * 0.66), 4):
        for x in range(size):
            over(img, x, y, (180, 240, 255), 0.05)

    # marco sutil
    for i in range(3):
        a = 0.5 - i * 0.15
        for x in range(size):
            over(img, x, i, cyan, a)
            over(img, x, size - 1 - i, cyan, a)
        for y in range(size):
            over(img, i, y, cyan, a)
            over(img, size - 1 - i, y, cyan, a)
    return img


# ---------------------------------------------------------------- wand icon
def wand_icon(size=64):
    img = blank(size, size)
    cyan = (0, 220, 255)
    purple = (160, 90, 255)
    # vara diagonal
    for t in range(0, 100):
        f = t / 100.0
        x = 14 + f * 34
        y = 50 - f * 34
        for ox in range(-2, 3):
            for oy in range(-2, 3):
                if ox * ox + oy * oy <= 4:
                    over(img, int(x + ox), int(y + oy), lerp((90, 60, 30), (60, 40, 20), f), 1.0)
    # punta brillante (estrella)
    tipx, tipy = 48, 16
    for y in range(size):
        for x in range(size):
            d = math.hypot(x - tipx, y - tipy)
            if d < 11:
                over(img, x, y, lerp((255, 255, 255), cyan, d / 11), max(0, 1 - d / 11) * 0.95)
            elif d < 18:
                over(img, x, y, purple, max(0, (18 - d) / 7) * 0.4)
    # destellos
    for (sx, sy, r) in [(20, 40, 4), (30, 50, 3), (52, 30, 3)]:
        for y in range(size):
            for x in range(size):
                d = math.hypot(x - sx, y - sy)
                if d < r:
                    over(img, x, y, cyan, max(0, 1 - d / r) * 0.8)
    return img


def main():
    icon = pack_icon(256)
    write_png(os.path.join(ROOT, "HologramStudioBP", "pack_icon.png"), 256, 256, icon)
    write_png(os.path.join(ROOT, "HologramStudioRP", "pack_icon.png"), 256, 256, icon)
    # textura transparente para la entidad invisible
    write_png(os.path.join(ROOT, "HologramStudioRP", "textures", "entity", "holo_blank.png"), 16, 16, blank(16, 16))
    # icono de varita
    write_png(os.path.join(ROOT, "HologramStudioRP", "textures", "items", "holo_wand.png"), 64, 64, wand_icon(64))
    print("OK: pack_icon (256), holo_blank (16, transparente), holo_wand (64)")


if __name__ == "__main__":
    main()
