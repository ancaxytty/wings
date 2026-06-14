#!/usr/bin/env python3
import json, struct, sys, array
sys.path.insert(0, __import__("os").path.dirname(__file__))
import meshopt


def read_glb(path):
    with open(path, "rb") as f:
        data = f.read()
    magic, version, length = struct.unpack_from("<III", data, 0)
    assert magic == 0x46546C67
    offset = 12
    gltf = None
    bins = []
    while offset < length:
        clen, ctype = struct.unpack_from("<II", data, offset)
        offset += 8
        cdata = data[offset:offset + clen]
        offset += clen
        if ctype == 0x4E4F534A:
            gltf = json.loads(cdata.decode("utf-8"))
        elif ctype == 0x004E4942:
            bins.append(cdata)
    return gltf, bins[0]


def get_bufferview_bytes(gltf, bin0, bv_index):
    """Return decompressed bytes for a bufferView (handles meshopt)."""
    bv = gltf["bufferViews"][bv_index]
    ext = (bv.get("extensions") or {}).get("EXT_meshopt_compression")
    if ext is None:
        off = bv.get("byteOffset", 0)
        return bin0[off:off + bv["byteLength"]]
    # meshopt: source bytes live in buffer 0 (the BIN chunk)
    off = ext["byteOffset"]
    comp = bin0[off:off + ext["byteLength"]]
    mode = ext["mode"]
    count = ext["count"]
    stride = ext["byteStride"]
    if mode == "ATTRIBUTES":
        return meshopt.decode_vertex_buffer(count, stride, comp)
    elif mode == "TRIANGLES":
        idx = meshopt.decode_index_buffer(count, comp)
        if stride == 4:
            return array.array("I", idx).tobytes()
        else:
            return array.array("H", idx).tobytes()
    elif mode == "INDICES":
        idx = meshopt.decode_index_sequence(count, comp)
        return array.array("I", idx).tobytes()
    raise ValueError("mode " + mode)


_COMP = {5120: ("b", 1), 5121: ("B", 1), 5122: ("h", 2), 5123: ("H", 2),
         5125: ("I", 4), 5126: ("f", 4)}
_NCOMP = {"SCALAR": 1, "VEC2": 2, "VEC3": 3, "VEC4": 4, "MAT4": 16}


def read_accessor(gltf, bin0, acc_index):
    acc = gltf["accessors"][acc_index]
    raw = get_bufferview_bytes(gltf, bin0, acc["bufferView"])
    typ, size = _COMP[acc["componentType"]]
    n = _NCOMP[acc["type"]]
    count = acc["count"]
    off = acc.get("byteOffset", 0)
    arr = array.array(typ)
    arr.frombytes(raw[off:off + count * n * size])
    if n == 1:
        return list(arr)
    return [tuple(arr[i * n:(i + 1) * n]) for i in range(count)]


def main():
    path = sys.argv[1]
    gltf, bin0 = read_glb(path)
    prim = gltf["meshes"][0]["primitives"][0]

    pos = read_accessor(gltf, bin0, prim["attributes"]["POSITION"])
    # validate vs accessor min/max
    acc = gltf["accessors"][prim["attributes"]["POSITION"]]
    mins = [min(p[i] for p in pos) for i in range(3)]
    maxs = [max(p[i] for p in pos) for i in range(3)]
    print("POSITION decoded count:", len(pos))
    print("  computed min:", [round(x, 6) for x in mins])
    print("  computed max:", [round(x, 6) for x in maxs])
    print("  accessor min:", acc.get("min"))
    print("  accessor max:", acc.get("max"))
    ok = all(abs(mins[i] - acc["min"][i]) < 1e-3 and abs(maxs[i] - acc["max"][i]) < 1e-3 for i in range(3))
    print("  VERTEX DECODE OK:", ok)


if __name__ == "__main__":
    main()
