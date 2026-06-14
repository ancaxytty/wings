#!/usr/bin/env python3
"""Convert a (meshopt-compressed) GLB mesh into a Minecraft Bedrock
poly_mesh geometry JSON.

Pipeline:
  1. Decode glTF accessors (handles EXT_meshopt_compression v0/v1).
  2. Drop invalid / degenerate triangles.
  3. Decimate with grid vertex-clustering to hit a triangle budget.
  4. Emit Bedrock `poly_mesh` geometry, scaled to Minecraft pixels (16 = 1 block).

Usage:
  glb_to_bedrock.py INPUT.glb OUTPUT.geo.json [--tris N] [--size PIXELS]
                    [--identifier geometry.name] [--grid R]
"""
import argparse
import json
import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from decode import read_glb, read_accessor  # noqa: E402


def cluster(positions, normals, uvs, tris, grid_res):
    """Grid vertex-clustering decimation.

    grid_res = number of cells along the longest bbox axis.
    Returns (out_positions, out_normals, out_uvs, out_tris)."""
    mn = [min(p[i] for p in positions) for i in range(3)]
    mx = [max(p[i] for p in positions) for i in range(3)]
    extent = [mx[i] - mn[i] for i in range(3)]
    longest = max(extent) or 1.0
    cell = longest / grid_res
    inv = 1.0 / cell
    dims = [max(1, int(extent[i] * inv) + 1) for i in range(3)]

    def cell_id(p):
        cx = int((p[0] - mn[0]) * inv)
        cy = int((p[1] - mn[1]) * inv)
        cz = int((p[2] - mn[2]) * inv)
        if cx >= dims[0]:
            cx = dims[0] - 1
        if cy >= dims[1]:
            cy = dims[1] - 1
        if cz >= dims[2]:
            cz = dims[2] - 1
        return (cx * dims[1] + cy) * dims[2] + cz

    # map each vertex -> cluster key, and accumulate averages per cluster
    vcell = [0] * len(positions)
    acc = {}  # key -> [px,py,pz, nx,ny,nz, u,v, count]
    for vi, p in enumerate(positions):
        k = cell_id(p)
        vcell[vi] = k
        a = acc.get(k)
        n = normals[vi]
        t = uvs[vi] if uvs else (0.0, 0.0)
        if a is None:
            acc[k] = [p[0], p[1], p[2], n[0], n[1], n[2], t[0], t[1], 1]
        else:
            a[0] += p[0]; a[1] += p[1]; a[2] += p[2]
            a[3] += n[0]; a[4] += n[1]; a[5] += n[2]
            a[6] += t[0]; a[7] += t[1]; a[8] += 1

    # assign compact indices to clusters
    key_to_idx = {}
    out_pos, out_nrm, out_uv = [], [], []
    for k, a in acc.items():
        c = a[8]
        key_to_idx[k] = len(out_pos)
        out_pos.append((a[0] / c, a[1] / c, a[2] / c))
        nx, ny, nz = a[3], a[4], a[5]
        ln = math.sqrt(nx * nx + ny * ny + nz * nz) or 1.0
        out_nrm.append((nx / ln, ny / ln, nz / ln))
        out_uv.append((a[6] / c, a[7] / c))

    # remap triangles, drop degenerates
    out_tris = []
    seen = set()
    for (ia, ib, ic) in tris:
        ka, kb, kc = key_to_idx[vcell[ia]], key_to_idx[vcell[ib]], key_to_idx[vcell[ic]]
        if ka == kb or kb == kc or ka == kc:
            continue
        # collapse exact-duplicate triangles (same 3 clusters)
        tkey = tuple(sorted((ka, kb, kc)))
        if tkey in seen:
            continue
        seen.add(tkey)
        out_tris.append((ka, kb, kc))
    return out_pos, out_nrm, out_uv, out_tris


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("input")
    ap.add_argument("output")
    ap.add_argument("--tris", type=int, default=4000, help="target triangle budget")
    ap.add_argument("--size", type=float, default=48.0,
                    help="longest dimension in Minecraft pixels (16 = 1 block)")
    ap.add_argument("--identifier", default=None)
    ap.add_argument("--grid", type=int, default=0, help="force grid resolution")
    ap.add_argument("--no-decimate", action="store_true")
    args = ap.parse_args()

    gltf, bin0 = read_glb(args.input)
    prim = gltf["meshes"][0]["primitives"][0]
    print("Decoding accessors ...", flush=True)
    positions = read_accessor(gltf, bin0, prim["attributes"]["POSITION"])
    normals = read_accessor(gltf, bin0, prim["attributes"]["NORMAL"])
    uvs = None
    if "TEXCOORD_0" in prim["attributes"]:
        uvs = read_accessor(gltf, bin0, prim["attributes"]["TEXCOORD_0"])
    idx = read_accessor(gltf, bin0, prim["indices"])

    vcount = len(positions)
    raw_tris = []
    for t in range(0, len(idx), 3):
        a, b, c = idx[t], idx[t + 1], idx[t + 2]
        if a >= vcount or b >= vcount or c >= vcount:
            continue
        if a == b or b == c or a == c:
            continue
        raw_tris.append((a, b, c))
    print("valid source triangles:", len(raw_tris), flush=True)

    if args.no_decimate:
        out_pos, out_nrm, out_uv, out_tris = _identity(positions, normals, uvs, raw_tris)
    else:
        # auto-tune grid resolution to land near the triangle budget
        if args.grid:
            res = args.grid
            out_pos, out_nrm, out_uv, out_tris = cluster(positions, normals, uvs, raw_tris, res)
            print("grid %d -> %d tris" % (res, len(out_tris)), flush=True)
        else:
            lo, hi = 8, 320
            best = None
            for _ in range(9):
                res = (lo + hi) // 2
                op, on, ou, ot = cluster(positions, normals, uvs, raw_tris, res)
                print("  try grid %d -> %d tris" % (res, len(ot)), flush=True)
                if best is None or abs(len(ot) - args.tris) < abs(len(best[3]) - args.tris):
                    best = (op, on, ou, ot, res)
                if len(ot) > args.tris:
                    hi = res - 1
                else:
                    lo = res + 1
                if lo > hi:
                    break
            out_pos, out_nrm, out_uv, out_tris = best[0], best[1], best[2], best[3]
            print("chosen grid %d -> %d tris" % (best[4], len(out_tris)), flush=True)

    write_geometry(out_pos, out_nrm, out_uv, out_tris, args, gltf)


def _identity(positions, normals, uvs, tris):
    nrm = normals
    uv = uvs if uvs else [(0.0, 0.0)] * len(positions)
    return list(positions), list(nrm), list(uv), tris


def write_geometry(positions, normals, uvs, tris, args, gltf):
    # --- transform to Minecraft pixel space ---
    mn = [min(p[i] for p in positions) for i in range(3)]
    mx = [max(p[i] for p in positions) for i in range(3)]
    extent = [mx[i] - mn[i] for i in range(3)]
    longest = max(extent) or 1.0
    scale = args.size / longest

    # center on X/Z, rest model on the ground (min Y -> 0); negate X for
    # glTF(right-handed) -> Bedrock(left-handed) handedness.
    cx = (mn[0] + mx[0]) * 0.5
    cz = (mn[2] + mx[2]) * 0.5

    def tx(p):
        return [
            round(-(p[0] - cx) * scale, 4),
            round((p[1] - mn[1]) * scale, 4),
            round((p[2] - cz) * scale, 4),
        ]

    out_positions = [tx(p) for p in positions]
    # normals: negate X to match position mirroring; renormalize handled implicitly
    out_normals = []
    nseen = {}
    norm_idx_map = []
    for n in normals:
        nx, ny, nz = -n[0], n[1], n[2]
        key = (round(nx, 3), round(ny, 3), round(nz, 3))
        j = nseen.get(key)
        if j is None:
            j = len(out_normals)
            nseen[key] = j
            out_normals.append([key[0], key[1], key[2]])
        norm_idx_map.append(j)

    # uvs: flip V for Bedrock, dedup
    out_uvs = []
    useen = {}
    uv_idx_map = []
    for t in uvs:
        u = round(t[0], 5)
        v = round(1.0 - t[1], 5)
        key = (u, v)
        j = useen.get(key)
        if j is None:
            j = len(out_uvs)
            useen[key] = j
            out_uvs.append([u, v])
        uv_idx_map.append(j)

    # polys: each vertex = [position_idx, normal_idx, uv_idx]
    polys = []
    for (a, b, c) in tris:
        polys.append([
            [a, norm_idx_map[a], uv_idx_map[a]],
            [b, norm_idx_map[b], uv_idx_map[b]],
            [c, norm_idx_map[c], uv_idx_map[c]],
        ])

    # visible bounds (in pixels then /16 -> blocks; Bedrock wants block units here)
    bw = max(extent[0], extent[2]) * scale / 16.0
    bh = extent[1] * scale / 16.0

    ident = args.identifier or ("geometry." + os.path.splitext(
        os.path.basename(args.input))[0].lower().replace("-", "_").replace(" ", "_"))

    tw = th = 1024
    images = gltf.get("images", [])
    geo = {
        "format_version": "1.16.0",
        "minecraft:geometry": [
            {
                "description": {
                    "identifier": ident,
                    "texture_width": tw,
                    "texture_height": th,
                    "visible_bounds_width": round(bw + 0.5, 3),
                    "visible_bounds_height": round(bh + 0.5, 3),
                    "visible_bounds_offset": [0, round(bh / 2.0, 3), 0],
                },
                "bones": [
                    {
                        "name": "root",
                        "pivot": [0, 0, 0],
                        "poly_mesh": {
                            "normalized_uvs": True,
                            "positions": out_positions,
                            "normals": out_normals,
                            "uvs": out_uvs,
                            "polys": polys,
                        },
                    }
                ],
            }
        ],
    }

    with open(args.output, "w") as f:
        json.dump(geo, f, separators=(",", ":"))
    sz = os.path.getsize(args.output)
    print("\nWROTE", args.output)
    print("  identifier :", ident)
    print("  positions  :", len(out_positions))
    print("  normals    :", len(out_normals))
    print("  uvs        :", len(out_uvs))
    print("  triangles  :", len(polys))
    print("  file size  : %.2f MB" % (sz / 1e6))
    print("  model size : %.1f x %.1f x %.1f px (%.2f x %.2f x %.2f blocks)" % (
        extent[0] * scale, extent[1] * scale, extent[2] * scale,
        extent[0] * scale / 16, extent[1] * scale / 16, extent[2] * scale / 16))


if __name__ == "__main__":
    main()
