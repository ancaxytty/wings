#!/usr/bin/env python3
"""Generador de texturas PNG (RGBA) sin dependencias externas."""
import struct, zlib, os, math

RP = "wings_search_RP"
BP = "wings_search_BP"

def write_png(path, w, h, pixels):
    """pixels: list of rows, each row list of (r,g,b,a)."""
    raw = bytearray()
    for y in range(h):
        raw.append(0)  # filter type 0
        row = pixels[y]
        for px in row:
            raw += bytes(px)
    def chunk(typ, data):
        c = struct.pack(">I", len(data)) + typ + data
        c += struct.pack(">I", zlib.crc32(typ + data) & 0xffffffff)
        return c
    sig = b"\x89PNG\r\n\x1a\n"
    ihdr = struct.pack(">IIBBBBB", w, h, 8, 6, 0, 0, 0)  # 8bit, RGBA
    idat = zlib.compress(bytes(raw), 9)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "wb") as f:
        f.write(sig + chunk(b"IHDR", ihdr) + chunk(b"IDAT", idat) + chunk(b"IEND", b""))

def blank(w, h, color=(0,0,0,0)):
    return [[list(color) for _ in range(w)] for _ in range(h)]

def fill_rounded_panel(w, h, base, border, glow=None, radius=6, alpha=235):
    img = blank(w, h)
    for y in range(h):
        for x in range(w):
            # rounded corner mask
            inside = True
            cx = min(x, w-1-x); cy = min(y, h-1-y)
            if cx < radius and cy < radius:
                dx = radius-cx; dy = radius-cy
                if dx*dx + dy*dy > radius*radius:
                    inside = False
            if not inside:
                continue
            edge = (cx < 2 or cy < 2)
            if edge:
                img[y][x] = [border[0], border[1], border[2], 255]
            else:
                # subtle vertical gradient for dark glass look
                t = y / max(1, h-1)
                r = int(base[0] * (1.0 - 0.25*t))
                g = int(base[1] * (1.0 - 0.25*t))
                b = int(base[2] * (1.0 - 0.25*t))
                img[y][x] = [r, g, b, alpha]
    # inner accent line
    if glow:
        for x in range(3, w-3):
            if 3 < h:
                img[3][x] = [glow[0], glow[1], glow[2], 180]
    return img

def make_close(hover=False):
    w=h=32
    base=(35,12,16) if not hover else (120,30,36)
    border=(90,30,34) if not hover else (200,70,76)
    x_col=(220,80,80) if not hover else (255,235,235)
    img = fill_rounded_panel(w,h,base,border,radius=7,alpha=245)
    # draw X
    for i in range(8, w-8):
        for t in (-1,0,1):
            y1=i+t
            if 0<=y1<h: img[y1][i]=[x_col[0],x_col[1],x_col[2],255]
            y2=(h-1-i)+t
            if 0<=y2<h: img[y2][i]=[x_col[0],x_col[1],x_col[2],255]
    return w,h,img

def make_bg(hover=False):
    w=h=64
    base=(20,22,30) if not hover else (40,46,66)
    border=(70,80,110) if not hover else (120,150,210)
    glow=(90,110,160) if not hover else (150,190,255)
    return w,h,fill_rounded_panel(w,h,base,border,glow=glow,radius=8,alpha=238 if not hover else 250)

def draw_disc(img, cx, cy, r, color):
    h=len(img); w=len(img[0])
    for y in range(max(0,cy-r), min(h,cy+r+1)):
        for x in range(max(0,cx-r), min(w,cx+r+1)):
            if (x-cx)**2+(y-cy)**2 <= r*r:
                img[y][x]=[color[0],color[1],color[2],color[3] if len(color)>3 else 255]

def draw_rect(img, x0,y0,x1,y1,color):
    h=len(img); w=len(img[0])
    for y in range(max(0,y0),min(h,y1)):
        for x in range(max(0,x0),min(w,x1)):
            img[y][x]=[color[0],color[1],color[2],color[3] if len(color)>3 else 255]

def make_icon(kind):
    w=h=48
    img=blank(w,h)
    if kind=="create":  # plus / egg
        draw_disc(img,24,26,15,(110,200,120,255))
        draw_disc(img,24,26,15,(110,200,120,255))
        draw_rect(img,22,14,26,38,(245,255,245,255))
        draw_rect(img,12,24,36,28,(245,255,245,255))
    elif kind=="review":  # magnifier
        draw_disc(img,20,20,12,(120,170,240,255))
        draw_disc(img,20,20,8,(20,22,30,255))
        for i in range(0,12):
            x=28+i; y=28+i
            if x<w and y<h:
                draw_rect(img,x-1,y-1,x+3,y+3,(120,170,240,255))
    elif kind=="reload":  # circular arrows
        for a in range(40,320):
            rad=a*math.pi/180
            x=int(24+13*math.cos(rad)); y=int(24+13*math.sin(rad))
            draw_rect(img,x-2,y-2,x+2,y+2,(200,150,240,255))
        draw_rect(img,32,4,46,16,(200,150,240,255))
    elif kind=="help":  # question
        draw_disc(img,24,24,16,(230,200,90,255))
        draw_disc(img,24,24,12,(40,34,12,255))
        # question mark blocks
        draw_rect(img,20,14,30,18,(255,240,180,255))
        draw_rect(img,26,18,30,24,(255,240,180,255))
        draw_rect(img,22,24,28,28,(255,240,180,255))
        draw_rect(img,22,32,27,37,(255,240,180,255))
    elif kind=="delete":  # trash
        draw_rect(img,14,16,34,38,(200,70,76,255))
        draw_rect(img,12,12,36,16,(230,90,96,255))
        draw_rect(img,20,8,28,12,(230,90,96,255))
        for x in (19,24,29):
            draw_rect(img,x,20,x+2,34,(40,16,18,255))
    return w,h,img

def make_head():
    # 64x64 player-head-style net, golden/dark theme
    w=h=64
    img=blank(w,h,(0,0,0,0))
    gold=(196,158,72); gold_d=(150,118,52); dark=(34,30,40)
    # fill the typical head faces region of a 64x64 skin layout
    # top row faces: top [8..16,0..8], bottom[16..24,0..8]
    def face(x0,y0,size,col,cold):
        for y in range(y0,y0+size):
            for x in range(x0,x0+size):
                # slight noise
                n = ((x*7+y*13) % 5)
                c = col if n<3 else cold
                img[y][x]=[c[0],c[1],c[2],255]
    s=8
    # standard 8x8 head uv at [0,0]: arrangement used by box uv:
    # We'll just paint the whole 64x64 area used (0..32,0..16-ish) gold,
    # plus a face with eyes on the front.
    for y in range(0,16):
        for x in range(0,32):
            n=((x*5+y*11)%7)
            c=gold if n<5 else gold_d
            img[y][x]=[c[0],c[1],c[2],255]
    # front face approx region [8..16,8..16]
    for y in range(8,16):
        for x in range(8,16):
            img[y][x]=[gold[0],gold[1],gold[2],255]
    # eyes
    draw_rect(img,9,10,11,12,dark)
    draw_rect(img,13,10,15,12,dark)
    # mouth
    draw_rect(img,10,13,14,14,dark)
    return w,h,img

def make_holo():
    # fully transparent 8x8
    return 8,8,blank(8,8,(0,0,0,0))

def make_pack_icon(rp=True):
    w=h=128
    base=(18,20,28); accent=(120,160,240) if rp else (230,180,80)
    img=fill_rounded_panel(w,h,base,accent,glow=accent,radius=14,alpha=255)
    # a golden head silhouette
    draw_disc(img,64,58,30,(196,158,72,255))
    draw_rect(img,52,48,60,56,(34,30,40,255))
    draw_rect(img,68,48,76,56,(34,30,40,255))
    draw_rect(img,56,66,72,70,(34,30,40,255))
    # hologram bars on top
    draw_rect(img,40,16,88,22,(accent[0],accent[1],accent[2],255))
    draw_rect(img,48,26,80,30,(accent[0],accent[1],accent[2],200))
    return w,h,img

# ---- write everything ----
cw,ch,ci = make_close(False); write_png(f"{RP}/textures/custom_ui/close_button.png", cw,ch,ci)
cw,ch,ci = make_close(True);  write_png(f"{RP}/textures/custom_ui/close_button_hover.png", cw,ch,ci)
bw,bh,bi = make_bg(False); write_png(f"{RP}/textures/custom_ui/custom_bg.png", bw,bh,bi)
bw,bh,bi = make_bg(True);  write_png(f"{RP}/textures/custom_ui/custom_bg_hover.png", bw,bh,bi)
for k in ("create","review","reload","help","delete"):
    iw,ih,ii=make_icon(k); write_png(f"{RP}/textures/custom_ui/icon_{k}.png", iw,ih,ii)
hw,hh,hi=make_head(); write_png(f"{RP}/textures/entity/wings_head.png", hw,hh,hi)
hw,hh,hi=make_holo(); write_png(f"{RP}/textures/entity/wings_hologram.png", hw,hh,hi)
pw,ph,pi=make_pack_icon(True); write_png(f"{RP}/pack_icon.png", pw,ph,pi)
pw,ph,pi=make_pack_icon(False); write_png(f"{BP}/pack_icon.png", pw,ph,pi)
print("texturas generadas OK")
