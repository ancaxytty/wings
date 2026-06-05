#!/usr/bin/env python3
"""Generate the custom button icons for the WorldEdit resource pack.

Each icon is a 32x32 RGBA PNG: a rounded, colored "plate" (tile look, like the
reference image) + a simple white/accent symbol. No third-party deps (pure
python PNG writer), so it runs anywhere.

Output: WorldEditRP/textures/custom_ui/icons/<name>.png
The behavior pack references them as: textures/custom_ui/icons/<name>
"""
import math
import os
import struct
import zlib

W = H = 32
OUT_DIR = os.path.abspath(
    os.path.join(
        os.path.dirname(__file__), "..", "WorldEditRP", "textures", "custom_ui", "icons"
    )
)

WHITE = (238, 241, 247)


# ----------------------------------------------------------------------------
# PNG writer + drawing primitives
# ----------------------------------------------------------------------------
def write_png(path, pixels):
    raw = bytearray()
    for y in range(H):
        raw.append(0)
        for x in range(W):
            r, g, b, a = pixels[y * W + x]
            raw += bytes((r & 255, g & 255, b & 255, a & 255))

    def chunk(tag, data):
        return (
            struct.pack(">I", len(data))
            + tag
            + data
            + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF)
        )

    png = b"\x89PNG\r\n\x1a\n"
    png += chunk(b"IHDR", struct.pack(">IIBBBBB", W, H, 8, 6, 0, 0, 0))
    png += chunk(b"IDAT", zlib.compress(bytes(raw), 9))
    png += chunk(b"IEND", b"")
    with open(path, "wb") as f:
        f.write(png)


def new_canvas():
    return [(0, 0, 0, 0)] * (W * H)


def blend(px, x, y, col, a=1.0):
    if not (0 <= x < W and 0 <= y < H):
        return
    x = int(x)
    y = int(y)
    r, g, b = col[0], col[1], col[2]
    sa = a * (col[3] / 255.0 if len(col) > 3 else 1.0)
    if sa <= 0:
        return
    i = y * W + x
    dr, dg, db, da = px[i]
    na = sa + (da / 255.0) * (1 - sa)
    if na <= 0:
        px[i] = (0, 0, 0, 0)
        return
    nr = (r * sa + dr * (da / 255.0) * (1 - sa)) / na
    ng = (g * sa + dg * (da / 255.0) * (1 - sa)) / na
    nb = (b * sa + db * (db and (da / 255.0) or (da / 255.0)) * (1 - sa)) / na
    px[i] = (int(nr), int(ng), int(nb), int(na * 255))


def lerp(a, b, t):
    return tuple(int(a[i] + (b[i] - a[i]) * t) for i in range(3))


def rounded_mask(x, y, x0, y0, x1, y1, r):
    if x < x0 or x > x1 or y < y0 or y > y1:
        return False
    for (cx, cy) in (
        (x0 + r, y0 + r),
        (x1 - r, y0 + r),
        (x0 + r, y1 - r),
        (x1 - r, y1 - r),
    ):
        if ((x < x0 + r and y < y0 + r) and cx == x0 + r and cy == y0 + r) or \
           ((x > x1 - r and y < y0 + r) and cx == x1 - r and cy == y0 + r) or \
           ((x < x0 + r and y > y1 - r) and cx == x0 + r and cy == y1 - r) or \
           ((x > x1 - r and y > y1 - r) and cx == x1 - r and cy == y1 - r):
            if (x - cx) ** 2 + (y - cy) ** 2 > r * r:
                return False
    return True


def plate(px, color):
    """Rounded tile background with a soft gradient + border + top highlight."""
    x0, y0, x1, y1, r = 2, 2, W - 3, H - 3, 6
    top = lerp(color, (255, 255, 255), 0.18)
    bot = lerp(color, (0, 0, 0), 0.28)
    border = lerp(color, (0, 0, 0), 0.45)
    for y in range(H):
        for x in range(W):
            if not rounded_mask(x, y, x0, y0, x1, y1, r):
                continue
            edge = min(x - x0, y - y0, x1 - x, y1 - y)
            if edge <= 0:
                px[y * W + x] = border + (255,)
            else:
                t = (y - y0) / (y1 - y0)
                col = lerp(top, bot, t)
                if edge == 1:
                    col = lerp(col, (255, 255, 255), 0.25)
                px[y * W + x] = col + (255,)


def disc(px, cx, cy, rad, col):
    for y in range(H):
        for x in range(W):
            if (x + 0.5 - cx) ** 2 + (y + 0.5 - cy) ** 2 <= rad * rad:
                blend(px, x, y, col)


def ring(px, cx, cy, rad, th, col):
    for y in range(H):
        for x in range(W):
            d = math.hypot(x + 0.5 - cx, y + 0.5 - cy)
            if rad - th <= d <= rad:
                blend(px, x, y, col)


def rect(px, x0, y0, x1, y1, col):
    for y in range(int(y0), int(y1) + 1):
        for x in range(int(x0), int(x1) + 1):
            blend(px, x, y, col)


def frame(px, x0, y0, x1, y1, th, col):
    for y in range(int(y0), int(y1) + 1):
        for x in range(int(x0), int(x1) + 1):
            if x < x0 + th or x > x1 - th or y < y0 + th or y > y1 - th:
                blend(px, x, y, col)


def line(px, x0, y0, x1, y1, col, th=2):
    n = int(max(abs(x1 - x0), abs(y1 - y0)) * 2) + 1
    rr = th / 2.0
    for i in range(n + 1):
        t = i / n
        cx = x0 + (x1 - x0) * t
        cy = y0 + (y1 - y0) * t
        for yy in range(int(cy - rr - 1), int(cy + rr + 2)):
            for xx in range(int(cx - rr - 1), int(cx + rr + 2)):
                if (xx + 0.5 - cx) ** 2 + (yy + 0.5 - cy) ** 2 <= rr * rr:
                    blend(px, xx, yy, col)


def tri(px, p0, p1, p2, col):
    xs = [p0[0], p1[0], p2[0]]
    ys = [p0[1], p1[1], p2[1]]

    def sign(ax, ay, bx, by, cx, cy):
        return (ax - cx) * (by - cy) - (bx - cx) * (ay - cy)

    for y in range(int(min(ys)), int(max(ys)) + 1):
        for x in range(int(min(xs)), int(max(xs)) + 1):
            px_, py_ = x + 0.5, y + 0.5
            d1 = sign(px_, py_, p0[0], p0[1], p1[0], p1[1])
            d2 = sign(px_, py_, p1[0], p1[1], p2[0], p2[1])
            d3 = sign(px_, py_, p2[0], p2[1], p0[0], p0[1])
            neg = (d1 < 0) or (d2 < 0) or (d3 < 0)
            pos = (d1 > 0) or (d2 > 0) or (d3 > 0)
            if not (neg and pos):
                blend(px, x, y, col)


def arrow(px, x0, y0, x1, y1, col, th=3, head=5):
    line(px, x0, y0, x1, y1, col, th)
    ang = math.atan2(y1 - y0, x1 - x0)
    for a in (ang + 2.5, ang - 2.5):
        hx = x1 + math.cos(a) * head
        hy = y1 + math.sin(a) * head
        line(px, x1, y1, hx, hy, col, th)


# ----------------------------------------------------------------------------
# Per-icon symbols
# ----------------------------------------------------------------------------
def s_tools(px):
    line(px, 9, 22, 22, 10, WHITE, 3)            # handle
    line(px, 16, 8, 24, 13, WHITE, 3)            # head right
    line(px, 13, 12, 21, 7, WHITE, 3)            # head left


def s_compass(px):
    ring(px, 16, 16, 9, 2, WHITE)
    tri(px, (16, 7), (13, 17), (19, 17), (210, 80, 80))   # north (red)
    tri(px, (16, 25), (13, 16), (19, 16), WHITE)          # south


def s_wand(px):
    line(px, 9, 23, 21, 10, WHITE, 3)
    tri(px, (22, 6), (19, 12), (25, 12), (255, 224, 120))
    blend(px, 24, 8, (255, 224, 120))


def s_bracket(px, col):
    # corner brackets + center dot (selection marker)
    rect(px, 7, 7, 13, 9, col); rect(px, 7, 7, 9, 13, col)
    rect(px, 19, 7, 25, 9, col); rect(px, 23, 7, 25, 13, col)
    rect(px, 7, 23, 13, 25, col); rect(px, 7, 19, 9, 25, col)
    rect(px, 19, 23, 25, 25, col); rect(px, 23, 19, 25, 25, col)
    disc(px, 16, 16, 3, col)


def s_pos1(px):
    s_bracket(px, (150, 255, 150))


def s_pos2(px):
    s_bracket(px, (255, 190, 120))


def s_set(px):
    rect(px, 8, 8, 23, 23, WHITE)


def s_replace(px):
    frame(px, 7, 7, 17, 17, 2, WHITE)
    rect(px, 17, 17, 25, 25, WHITE)
    arrow(px, 12, 12, 21, 21, (255, 224, 120), 2, 4)


def s_walls(px):
    frame(px, 7, 7, 25, 25, 3, WHITE)


def s_outline(px):
    frame(px, 7, 7, 25, 25, 2, WHITE)
    # cube depth lines
    line(px, 7, 7, 11, 4, WHITE, 1)
    line(px, 25, 7, 29, 4, WHITE, 1)
    line(px, 11, 4, 29, 4, WHITE, 1)


def s_hollow(px):
    frame(px, 6, 6, 26, 26, 3, WHITE)
    frame(px, 12, 12, 20, 20, 1, (255, 224, 120))


def s_sphere(px):
    disc(px, 16, 16, 9, WHITE)
    disc(px, 13, 13, 3, lerp(WHITE, (255, 255, 255), 1) + (180,) if False else (255, 255, 255, 150))


def s_hsphere(px):
    ring(px, 16, 16, 9, 3, WHITE)


def s_cylinder(px):
    rect(px, 10, 9, 22, 23, WHITE)
    disc(px, 16, 9, 6, WHITE)
    disc(px, 16, 23, 6, lerp(WHITE, (0, 0, 0), 0.2) + (255,))


def s_cone(px):
    tri(px, (16, 6), (8, 25), (24, 25), WHITE)


def s_pyramid(px):
    rect(px, 9, 22, 23, 25, WHITE)
    rect(px, 11, 17, 21, 21, WHITE)
    rect(px, 13, 12, 19, 16, WHITE)
    rect(px, 15, 8, 17, 11, WHITE)


def s_line(px):
    line(px, 8, 24, 24, 8, WHITE, 3)
    disc(px, 8, 24, 3, (150, 255, 150))
    disc(px, 24, 8, 3, (255, 190, 120))


def s_naturalize(px):
    rect(px, 7, 8, 25, 13, (110, 200, 110))
    rect(px, 7, 14, 25, 19, (165, 120, 80))
    rect(px, 7, 20, 25, 24, (150, 150, 160))


def s_smooth(px):
    prev = None
    for x in range(7, 26):
        y = 16 + int(math.sin((x - 7) / 18.0 * math.pi * 2) * 5)
        if prev:
            line(px, prev[0], prev[1], x, y, WHITE, 2)
        prev = (x, y)


def s_drain(px):
    tri(px, (16, 6), (10, 16), (22, 16), (150, 210, 255))
    disc(px, 16, 18, 6, (150, 210, 255))


def s_clear(px):
    line(px, 9, 9, 23, 23, (255, 210, 210), 4)
    line(px, 23, 9, 9, 23, (255, 210, 210), 4)


def s_copy(px):
    frame(px, 7, 7, 18, 18, 2, WHITE)
    rect(px, 15, 15, 25, 25, WHITE)


def s_paste(px):
    rect(px, 8, 9, 24, 25, WHITE)
    rect(px, 13, 6, 19, 9, (255, 224, 120))


def s_stack(px):
    rect(px, 8, 18, 24, 22, WHITE)
    rect(px, 9, 13, 23, 16, lerp(WHITE, (0, 0, 0), 0.15) + (255,))
    rect(px, 10, 8, 22, 11, lerp(WHITE, (0, 0, 0), 0.3) + (255,))


def s_rotate(px):
    ring(px, 16, 16, 8, 2, WHITE)
    # cut a gap + arrowhead
    rect(px, 16, 6, 26, 14, (0, 0, 0, 0))  # erase top-right arc area (no-op blend)
    tri(px, (22, 6), (26, 12), (18, 12), WHITE)


def s_move(px):
    arrow(px, 16, 16, 16, 7, WHITE, 2, 3)
    arrow(px, 16, 16, 16, 25, WHITE, 2, 3)
    arrow(px, 16, 16, 7, 16, WHITE, 2, 3)
    arrow(px, 16, 16, 25, 16, WHITE, 2, 3)


def s_expand(px):
    arrow(px, 16, 16, 8, 8, WHITE, 2, 3)
    arrow(px, 16, 16, 24, 8, WHITE, 2, 3)
    arrow(px, 16, 16, 8, 24, WHITE, 2, 3)
    arrow(px, 16, 16, 24, 24, WHITE, 2, 3)


def s_contract(px):
    arrow(px, 8, 8, 14, 14, WHITE, 2, 3)
    arrow(px, 24, 8, 18, 14, WHITE, 2, 3)
    arrow(px, 8, 24, 14, 18, WHITE, 2, 3)
    arrow(px, 24, 24, 18, 18, WHITE, 2, 3)


def s_up(px):
    arrow(px, 16, 25, 16, 7, WHITE, 4, 7)


def s_undo(px):
    ring(px, 16, 17, 8, 2, WHITE)
    rect(px, 16, 6, 27, 17, (0, 0, 0, 0))
    arrow(px, 16, 9, 9, 12, WHITE, 2, 4)


def s_box(px):
    col = WHITE
    for x in range(7, 26, 4):
        rect(px, x, 7, x + 1, 8, col)
        rect(px, x, 24, x + 1, 25, col)
    for y in range(7, 26, 4):
        rect(px, 7, y, 8, y + 1, col)
        rect(px, 24, y, 25, y + 1, col)


def s_info(px):
    rect(px, 15, 7, 18, 10, WHITE)       # dot
    rect(px, 15, 13, 18, 25, WHITE)      # bar


def s_fifa(px):
    disc(px, 16, 16, 10, WHITE)
    # center + surrounding black patches (stylized)
    pent = [(16, 11), (20, 14), (18, 19), (14, 19), (12, 14)]
    tri(px, pent[0], pent[1], pent[2], (30, 30, 35))
    tri(px, pent[0], pent[2], pent[3], (30, 30, 35))
    tri(px, pent[0], pent[3], pent[4], (30, 30, 35))
    for a in range(5):
        ang = -math.pi / 2 + a * 2 * math.pi / 5
        bx = 16 + math.cos(ang) * 9
        by = 16 + math.sin(ang) * 9
        disc(px, bx, by, 1.6, (30, 30, 35))


def s_help(px):
    ring(px, 16, 12, 5, 2, WHITE)
    rect(px, 12, 12, 16, 16, (0, 0, 0, 0))
    rect(px, 15, 14, 18, 20, WHITE)      # stem
    rect(px, 15, 23, 18, 26, WHITE)      # dot


# name -> (plate color, symbol fn)
STEEL = (74, 92, 122)
PURPLE = (118, 86, 168)
GOLD = (190, 150, 64)
TEAL = (42, 116, 148)
GREEN = (56, 134, 76)
CYAN = (46, 150, 172)

ICONS = {
    "tools": (TEAL, s_tools),
    "compass": (TEAL, s_compass),
    "wand": (TEAL, s_wand),
    "pos1": ((58, 132, 70), s_pos1),
    "pos2": ((196, 120, 48), s_pos2),
    "set": (STEEL, s_set),
    "replace": (STEEL, s_replace),
    "walls": (STEEL, s_walls),
    "outline": (STEEL, s_outline),
    "hollow": ((60, 96, 150), s_hollow),
    "sphere": (PURPLE, s_sphere),
    "hsphere": (PURPLE, s_hsphere),
    "cylinder": (PURPLE, s_cylinder),
    "cone": (PURPLE, s_cone),
    "pyramid": (PURPLE, s_pyramid),
    "line": (PURPLE, s_line),
    "naturalize": (GREEN, s_naturalize),
    "smooth": (GREEN, s_smooth),
    "drain": ((50, 110, 170), s_drain),
    "clear": ((168, 56, 58), s_clear),
    "copy": (GOLD, s_copy),
    "paste": (GOLD, s_paste),
    "stack": (GOLD, s_stack),
    "rotate": (GOLD, s_rotate),
    "move": (GOLD, s_move),
    "expand": (GOLD, s_expand),
    "contract": (GOLD, s_contract),
    "up": (CYAN, s_up),
    "undo": ((196, 168, 64), s_undo),
    "box": ((92, 104, 124), s_box),
    "info": (CYAN, s_info),
    "fifa": ((44, 124, 72), s_fifa),
    "help": ((58, 110, 178), s_help),
}


def main():
    os.makedirs(OUT_DIR, exist_ok=True)
    print("Writing", len(ICONS), "icons ->", OUT_DIR)
    for name, (color, fn) in ICONS.items():
        px = new_canvas()
        plate(px, color)
        fn(px)
        write_png(os.path.join(OUT_DIR, name + ".png"), px)
        print("  +", name + ".png")
    print("Done.")


if __name__ == "__main__":
    main()
