#!/usr/bin/env python3
"""Pure-python decoder for EXT_meshopt_compression (vertex + index codecs).

Reference: zeux/meshoptimizer vertexcodec.cpp / indexcodec.cpp (decode side).
Supports codec version 0 (the version emitted by gltfpack 1.x).
"""

K_VERTEX_HEADER = 0xA0
K_INDEX_HEADER = 0xE0
K_BYTE_GROUP_SIZE = 16
K_VERTEX_BLOCK_SIZE_BYTES = 8192
K_VERTEX_BLOCK_MAX_SIZE = 256


def _unzigzag8(v):
    return (v >> 1) ^ (0xFF if (v & 1) else 0)


def _get_vertex_block_size(vertex_size):
    result = K_VERTEX_BLOCK_SIZE_BYTES // vertex_size
    result &= ~(K_BYTE_GROUP_SIZE - 1)
    return min(result, K_VERTEX_BLOCK_MAX_SIZE)


def _decode_bytes_group(data, pos, out, out_off, bitslog2):
    """Decode one group of 16 bytes into out[out_off:out_off+16].
    Returns new pos."""
    if bitslog2 == 0:
        for i in range(16):
            out[out_off + i] = 0
        return pos
    elif bitslog2 == 1:
        data_var = pos + 4  # full-byte sentinels follow the 4 packed bytes
        bi = 0
        for k in range(4):
            byte = data[pos + k]
            for _ in range(4):
                enc = (byte >> 6) & 3
                byte = (byte << 2) & 0xFF
                if enc == 3:
                    out[out_off + bi] = data[data_var]
                    data_var += 1
                else:
                    out[out_off + bi] = enc
                bi += 1
        return data_var
    elif bitslog2 == 2:
        data_var = pos + 8
        bi = 0
        for k in range(8):
            byte = data[pos + k]
            for _ in range(2):
                enc = (byte >> 4) & 0xF
                byte = (byte << 4) & 0xFF
                if enc == 15:
                    out[out_off + bi] = data[data_var]
                    data_var += 1
                else:
                    out[out_off + bi] = enc
                bi += 1
        return data_var
    elif bitslog2 == 3:
        for i in range(16):
            out[out_off + i] = data[pos + i]
        return pos + 16
    raise ValueError("bad bitslog2")


def _decode_bytes(data, pos, out, count_aligned):
    """Decode `count_aligned` (multiple of 16) bytes into out[0:count_aligned]."""
    assert count_aligned % K_BYTE_GROUP_SIZE == 0
    group_count = count_aligned // K_BYTE_GROUP_SIZE
    header_size = (group_count + 3) // 4
    header = pos
    pos += header_size
    for g in range(group_count):
        bitslog2 = (data[header + (g >> 2)] >> ((g & 3) * 2)) & 3
        pos = _decode_bytes_group(data, pos, out, g * K_BYTE_GROUP_SIZE, bitslog2)
    return pos


def decode_vertex_buffer(vertex_count, vertex_size, data):
    """Decode an EXT_meshopt_compression ATTRIBUTES buffer.
    `data` is the compressed byte slice. Returns a bytearray of
    vertex_count*vertex_size bytes."""
    if len(data) < 1 + vertex_size:
        raise ValueError("buffer too small")
    if (data[0] & 0xF0) != K_VERTEX_HEADER:
        raise ValueError("bad vertex header 0x%02x" % data[0])
    version = data[0] & 0x0F
    if version > 0:
        raise ValueError("unsupported vertex codec version %d" % version)

    block_size = _get_vertex_block_size(vertex_size)

    out = bytearray(vertex_count * vertex_size)

    # last_vertex initialized from the tail (last vertex_size bytes)
    last_vertex = bytearray(data[len(data) - vertex_size:])

    pos = 1
    gbuf = bytearray(K_VERTEX_BLOCK_MAX_SIZE)  # decoded zigzag deltas for one byte column

    vertex_offset = 0
    while vertex_offset < vertex_count:
        bs = min(block_size, vertex_count - vertex_offset)
        bs_aligned = (bs + K_BYTE_GROUP_SIZE - 1) & ~(K_BYTE_GROUP_SIZE - 1)
        base = vertex_offset * vertex_size
        for k in range(vertex_size):
            pos = _decode_bytes(data, pos, gbuf, bs_aligned)
            p = last_vertex[k]
            o = base + k
            for i in range(bs):
                p = (p + _unzigzag8(gbuf[i])) & 0xFF
                out[o] = p
                o += vertex_size
            last_vertex[k] = p
        vertex_offset += bs
    return out


# ---------------------------------------------------------------------------
# Index codec
# ---------------------------------------------------------------------------

def _decode_vbyte(data, pos):
    lead = data[pos]
    pos += 1
    if lead < 128:
        return lead, pos
    result = lead & 127
    shift = 7
    for _ in range(4):
        group = data[pos]
        pos += 1
        result |= (group & 127) << shift
        shift += 7
        if group < 128:
            break
    return result & 0xFFFFFFFF, pos


def _decode_index(data, pos, last):
    v, pos = _decode_vbyte(data, pos)
    d = (v >> 1) ^ (-(v & 1) & 0xFFFFFFFF)
    return (last + d) & 0xFFFFFFFF, pos


def decode_index_buffer(index_count, data, want_stats=False):
    """Decode an EXT_meshopt_compression TRIANGLES index buffer.
    Returns a list of `index_count` ints (or (list, stats) if want_stats)."""
    assert index_count % 3 == 0
    if len(data) < 1 + index_count // 3 + 16:
        raise ValueError("index buffer too small")
    if (data[0] & 0xF0) != K_INDEX_HEADER:
        raise ValueError("bad index header 0x%02x" % data[0])
    version = data[0] & 0x0F
    if version > 1:
        raise ValueError("unsupported index codec version %d" % version)

    dest = [0] * index_count

    edgefifo = [[0, 0] for _ in range(16)]
    vertexfifo = [0] * 16
    edgefifooffset = 0
    vertexfifooffset = 0
    next_v = 0
    last = 0
    fecmax = 13 if version >= 1 else 15

    code = 1
    data_pos = code + index_count // 3
    codeaux_table = len(data) - 16

    def push_edge(a, b):
        nonlocal edgefifooffset
        edgefifo[edgefifooffset & 15][0] = a
        edgefifo[edgefifooffset & 15][1] = b
        edgefifooffset += 1

    def push_vertex(v, cond=1):
        nonlocal vertexfifooffset
        vertexfifo[vertexfifooffset & 15] = v
        vertexfifooffset += cond

    for i in range(0, index_count, 3):
        codetri = data[code]
        code += 1

        if codetri < 0xF0:
            fe = codetri >> 4
            ei = (edgefifooffset - 1 - fe) & 15
            a = edgefifo[ei][0]
            b = edgefifo[ei][1]
            fec = codetri & 15

            if fec < fecmax:
                vf = vertexfifo[(vertexfifooffset - 1 - fec) & 15]
                c = next_v if fec == 0 else vf
                fec0 = 1 if fec == 0 else 0
                next_v += fec0

                dest[i] = a
                dest[i + 1] = b
                dest[i + 2] = c

                push_vertex(c, fec0)
                push_edge(c, b)
                push_edge(a, c)
            elif fec != 15:
                # version 1: fec == 13 or 14 -> recover c from vertex fifo,
                # then advance the fifo using the value following the run.
                # (does NOT read from the data stream)
                vf = vertexfifo[(vertexfifooffset - 1 - fec) & 15]
                c = vf

                dest[i] = a
                dest[i + 1] = b
                dest[i + 2] = c

                push_vertex(c, 0)
                push_edge(c, b)
                push_edge(a, c)
            else:
                # fec == 15: explicit delta-coded index
                c, data_pos = _decode_index(data, data_pos, last)
                last = c

                dest[i] = a
                dest[i + 1] = b
                dest[i + 2] = c

                push_vertex(c)
                push_edge(c, b)
                push_edge(a, c)
        else:
            if codetri < 0xFE:
                codeaux = data[codeaux_table + (codetri & 15)]
            else:
                codeaux = data[data_pos]
                data_pos += 1

            feb = codeaux >> 4
            fec = codeaux & 15

            # 0xff: first vertex 'a' is explicitly coded
            if codetri == 0xFF:
                a, data_pos = _decode_index(data, data_pos, last)
                last = a
            else:
                a = next_v
                next_v += 1

            if feb == 15:
                b, data_pos = _decode_index(data, data_pos, last)
                last = b
                feb0 = 0
            else:
                vfb = vertexfifo[(vertexfifooffset - feb) & 15]
                b = next_v if feb == 0 else vfb
                feb0 = 1 if feb == 0 else 0
                next_v += feb0

            if fec == 15:
                c, data_pos = _decode_index(data, data_pos, last)
                last = c
                fec0 = 0
            else:
                vfc = vertexfifo[(vertexfifooffset - fec) & 15]
                c = next_v if fec == 0 else vfc
                fec0 = 1 if fec == 0 else 0
                next_v += fec0

            dest[i] = a
            dest[i + 1] = b
            dest[i + 2] = c

            push_vertex(a)
            push_vertex(b, feb0 if feb != 15 else 1)
            push_vertex(c, fec0 if fec != 15 else 1)

            push_edge(b, a)
            push_edge(c, b)
            push_edge(a, c)

    if want_stats:
        return dest, {"data_pos": data_pos, "data_end": codeaux_table,
                      "next_v": next_v, "aligned": data_pos == codeaux_table}
    return dest
