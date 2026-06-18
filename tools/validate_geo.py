#!/usr/bin/env python3
import json, sys, math

path = sys.argv[1]
with open(path) as f:
    geo = json.load(f)

g = geo["minecraft:geometry"][0]
desc = g["description"]
bone = g["bones"][0]
pm = bone["poly_mesh"]
P = pm["positions"]; N = pm["normals"]; U = pm["uvs"]; polys = pm["polys"]
print("format_version:", geo["format_version"])
print("identifier:", desc["identifier"])
print("positions/normals/uvs:", len(P), len(N), len(U))
print("polys:", len(polys))
print("normalized_uvs:", pm.get("normalized_uvs"))

bad = 0
nonzero_area = 0
edge_sum = 0.0; edge_n = 0
sizes = [3, 4]
for poly in polys:
    if len(poly) not in sizes:
        bad += 1; continue
    for (pi, ni, ui) in poly:
        if not (0 <= pi < len(P)) or not (0 <= ni < len(N)) or not (0 <= ui < len(U)):
            bad += 1
    if len(poly) == 3:
        a = P[poly[0][0]]; b = P[poly[1][0]]; c = P[poly[2][0]]
        for (u, v) in ((a, b), (b, c), (c, a)):
            edge_sum += math.dist(u, v); edge_n += 1
        # area
        ux, uy, uz = b[0]-a[0], b[1]-a[1], b[2]-a[2]
        vx, vy, vz = c[0]-a[0], c[1]-a[1], c[2]-a[2]
        cxp = (uy*vz-uz*vy, uz*vx-ux*vz, ux*vy-uy*vx)
        if math.sqrt(sum(t*t for t in cxp)) > 1e-6:
            nonzero_area += 1

mn = [min(p[i] for p in P) for i in range(3)]
mx = [max(p[i] for p in P) for i in range(3)]
print("bbox px:", [round(mn[i],2) for i in range(3)], "->", [round(mx[i],2) for i in range(3)])
print("bad index refs:", bad)
print("non-degenerate tris:", nonzero_area, "/", len(polys))
print("avg edge (px):", round(edge_sum/edge_n, 3))
nb = sum(1 for n in N if abs(math.sqrt(n[0]**2+n[1]**2+n[2]**2)-1.0) > 0.05)
print("non-unit normals:", nb, "/", len(N))
print("VALID:", bad == 0 and nonzero_area > 0.9*len(polys))
