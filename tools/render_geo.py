#!/usr/bin/env python3
"""Tiny pure-stdlib rasterizer to sanity-check a Bedrock poly_mesh shape.
Renders 3 orthographic views (front/side/top) with simple diffuse shading
into one PNG."""
import json, sys, math, struct, zlib

path = sys.argv[1]
out = sys.argv[2] if len(sys.argv) > 2 else "preview.png"
S = 240  # per-view size

with open(path) as f:
    geo = json.load(f)
pm = geo["minecraft:geometry"][0]["bones"][0]["poly_mesh"]
P = pm["positions"]; N = pm["normals"]
tris = [(p[0][0], p[1][0], p[2][0], p[0][1]) for p in pm["polys"]]

mn = [min(p[i] for p in P) for i in range(3)]
mx = [max(p[i] for p in P) for i in range(3)]
ext = [mx[i]-mn[i] for i in range(3)]
ctr = [(mn[i]+mx[i])/2 for i in range(3)]
scale = (S*0.85) / max(ext)

light = (0.4, 0.7, 0.55)
ll = math.sqrt(sum(c*c for c in light)); light = tuple(c/ll for c in light)

def render(axis_u, axis_v, axis_d, flip_u=1, flip_v=1):
    img = [0]*(S*S)
    zbuf = [-1e9]*(S*S)
    for (a, b, c, ni) in tris:
        pa, pb, pc = P[a], P[b], P[c]
        def proj(p):
            u = (p[axis_u]-ctr[axis_u])*scale*flip_u + S/2
            v = -(p[axis_v]-ctr[axis_v])*scale*flip_v + S/2
            d = (p[axis_d]-ctr[axis_d])
            return u, v, d
        ua, va, da = proj(pa); ub, vb, db = proj(pb); uc, vc, dc = proj(pc)
        nrm = N[ni]
        sh = max(0.15, nrm[0]*light[0]+nrm[1]*light[1]+nrm[2]*light[2])
        col = int(40 + 200*sh)
        minx = max(0, int(min(ua, ub, uc))); maxx = min(S-1, int(max(ua, ub, uc))+1)
        miny = max(0, int(min(va, vb, vc))); maxy = min(S-1, int(max(va, vb, vc))+1)
        area = (ub-ua)*(vc-va)-(uc-ua)*(vb-va)
        if abs(area) < 1e-6: continue
        inv = 1.0/area
        for y in range(miny, maxy+1):
            for x in range(minx, maxx+1):
                px, py = x+0.5, y+0.5
                w0 = ((ub-px)*(vc-py)-(uc-px)*(vb-py))*inv
                w1 = ((uc-px)*(va-py)-(ua-px)*(vc-py))*inv
                w2 = 1-w0-w1
                if w0 < 0 or w1 < 0 or w2 < 0: continue
                d = w0*da+w1*db+w2*dc
                idx = y*S+x
                if d > zbuf[idx]:
                    zbuf[idx] = d; img[idx] = col
    return img

# front: look down -Z (u=X, v=Y); side: look down -X (u=Z, v=Y); top: down -Y (u=X,v=Z)
views = [render(0,1,2, -1,1), render(2,1,0, 1,1), render(0,2,1, -1,1)]

W = S*3
rgb = bytearray(W*S*3)
for vi, v in enumerate(views):
    for y in range(S):
        for x in range(S):
            g = v[y*S+x]
            o = (y*W + vi*S + x)*3
            rgb[o]=g; rgb[o+1]=g; rgb[o+2]=g

# PNG encode
def png(w, h, rgb):
    raw = bytearray()
    for y in range(h):
        raw.append(0)
        raw += rgb[y*w*3:(y+1)*w*3]
    def chunk(typ, data):
        c = struct.pack(">I", len(data))+typ+data
        return c+struct.pack(">I", zlib.crc32(typ+data)&0xffffffff)
    sig = b"\x89PNG\r\n\x1a\n"
    ihdr = struct.pack(">IIBBBBB", w, h, 8, 2, 0, 0, 0)
    return sig+chunk(b"IHDR", ihdr)+chunk(b"IDAT", zlib.compress(bytes(raw),9))+chunk(b"IEND", b"")

with open(out, "wb") as f:
    f.write(png(W, S, rgb))
print("wrote", out, W, "x", S, "(front | side | top)")
