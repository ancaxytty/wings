"""
Genera app.ico (icono de la app) usando SOLO la libreria estandar de Python.

Dibuja un cuadrado redondeado azul con un degradado y un triangulo de "play"
blanco, en varios tamanos (16, 32, 48, 64, 128, 256) dentro de un unico .ico.

Uso:
    python generate_icon.py
"""

from __future__ import annotations

import struct
from pathlib import Path

# Paleta (estilo PS5/azul)
TOP = (75, 149, 255)      # azul claro
BOTTOM = (28, 58, 102)    # azul oscuro
PLAY = (255, 255, 255)    # triangulo blanco


def _rounded(x: int, y: int, size: int, radius: int) -> bool:
    """True si el pixel (x,y) esta dentro del cuadrado de esquinas redondeadas."""
    r = radius
    for cx, cy in ((r, r), (size - 1 - r, r), (r, size - 1 - r), (size - 1 - r, size - 1 - r)):
        in_corner_box = (
            (x < r and y < r and (cx, cy) == (r, r))
            or (x > size - 1 - r and y < r and (cx, cy) == (size - 1 - r, r))
            or (x < r and y > size - 1 - r and (cx, cy) == (r, size - 1 - r))
            or (x > size - 1 - r and y > size - 1 - r and (cx, cy) == (size - 1 - r, size - 1 - r))
        )
        if in_corner_box:
            if (x - cx) ** 2 + (y - cy) ** 2 > r * r:
                return False
    return True


def _in_play_triangle(x: int, y: int, size: int) -> bool:
    """Triangulo de 'play' centrado."""
    # Definir el triangulo en coordenadas relativas (0..1)
    fx, fy = x / size, y / size
    # Vertices del triangulo (apuntando a la derecha)
    ax, ay = 0.36, 0.30
    bx, by = 0.36, 0.70
    cx, cy = 0.70, 0.50

    def sign(x1, y1, x2, y2, x3, y3):
        return (x1 - x3) * (y2 - y3) - (x2 - x3) * (y1 - y3)

    d1 = sign(fx, fy, ax, ay, bx, by)
    d2 = sign(fx, fy, bx, by, cx, cy)
    d3 = sign(fx, fy, cx, cy, ax, ay)
    has_neg = (d1 < 0) or (d2 < 0) or (d3 < 0)
    has_pos = (d1 > 0) or (d2 > 0) or (d3 > 0)
    return not (has_neg and has_pos)


def _render(size: int) -> bytes:
    """Devuelve pixeles BGRA (size*size), de arriba a abajo."""
    radius = max(3, size // 6)
    rows: list[bytes] = []
    for y in range(size):
        row = bytearray()
        t = y / (size - 1)
        bg = (
            int(TOP[0] + (BOTTOM[0] - TOP[0]) * t),
            int(TOP[1] + (BOTTOM[1] - TOP[1]) * t),
            int(TOP[2] + (BOTTOM[2] - TOP[2]) * t),
        )
        for x in range(size):
            if not _rounded(x, y, size, radius):
                row += bytes((0, 0, 0, 0))  # transparente
            elif _in_play_triangle(x, y, size):
                row += bytes((PLAY[2], PLAY[1], PLAY[0], 255))  # BGRA
            else:
                row += bytes((bg[2], bg[1], bg[0], 255))
        rows.append(bytes(row))
    return b"".join(rows)


def _bmp_for_ico(size: int) -> bytes:
    """BITMAPINFOHEADER + pixeles BGRA (bottom-up) + mascara AND."""
    top_down = _render(size)
    # ICO requiere bottom-up
    row_bytes = size * 4
    rows = [top_down[i * row_bytes:(i + 1) * row_bytes] for i in range(size)]
    bottom_up = b"".join(reversed(rows))

    header = struct.pack(
        "<IiiHHIIiiII",
        40,            # biSize
        size,          # biWidth
        size * 2,      # biHeight (imagen + mascara)
        1,             # biPlanes
        32,            # biBitCount
        0,             # biCompression (BI_RGB)
        len(bottom_up),
        0, 0, 0, 0,
    )
    # Mascara AND: 1 bit por pixel, filas alineadas a 4 bytes. 0 = opaco.
    mask_row = ((size + 31) // 32) * 4
    and_mask = b"\x00" * (mask_row * size)
    return header + bottom_up + and_mask


def main() -> None:
    sizes = [16, 32, 48, 64, 128, 256]
    images = [(s, _bmp_for_ico(s)) for s in sizes]

    out = bytearray()
    out += struct.pack("<HHH", 0, 1, len(images))  # ICONDIR

    offset = 6 + 16 * len(images)
    entries = bytearray()
    data = bytearray()
    for s, img in images:
        w = 0 if s >= 256 else s
        h = 0 if s >= 256 else s
        entries += struct.pack(
            "<BBBBHHII",
            w, h, 0, 0, 1, 32, len(img), offset,
        )
        data += img
        offset += len(img)

    out += entries + data
    Path("app.ico").write_bytes(out)
    print(f"app.ico generado ({len(out)} bytes, tamanos: {sizes})")


if __name__ == "__main__":
    main()
