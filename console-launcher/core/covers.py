"""
Cover art handling.

For each game we try, in order:
  1. A cover next to the ROM with the same name:  God of War.iso -> God of War.png
  2. A cover inside a sibling 'covers' or 'box' folder with the same stem.
  3. A procedurally generated placeholder (gradient + title text).

Generated placeholders are cached on disk under <app>/cache/covers so the
grid loads instantly on subsequent runs.

Requires Pillow (PIL).
"""

from __future__ import annotations

import hashlib
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

from .config import app_dir, CONSOLES
from .scanner import Game

CARD_W, CARD_H = 300, 400  # 3:4 box-art ratio
_IMAGE_EXT = (".png", ".jpg", ".jpeg", ".webp")

_CACHE_DIR = app_dir() / "cache" / "covers"
_CACHE_DIR.mkdir(parents=True, exist_ok=True)


def _find_existing_cover(game: Game) -> Path | None:
    rom = Path(game.path)
    stem = rom.stem

    candidates: list[Path] = []
    # Same folder, same name.
    for ext in _IMAGE_EXT:
        candidates.append(rom.with_suffix(ext))
    # Sibling art folders.
    for folder in ("covers", "box", "boxart", "art"):
        for ext in _IMAGE_EXT:
            candidates.append(rom.parent / folder / f"{stem}{ext}")

    for c in candidates:
        if c.is_file():
            return c
    return None


def _hex_to_rgb(value: str) -> tuple[int, int, int]:
    value = value.lstrip("#")
    return tuple(int(value[i : i + 2], 16) for i in (0, 2, 4))  # type: ignore


def _vertical_gradient(top: tuple[int, int, int], bottom: tuple[int, int, int]) -> Image.Image:
    base = Image.new("RGB", (CARD_W, CARD_H), top)
    draw = ImageDraw.Draw(base)
    for y in range(CARD_H):
        t = y / (CARD_H - 1)
        r = int(top[0] + (bottom[0] - top[0]) * t)
        g = int(top[1] + (bottom[1] - top[1]) * t)
        b = int(top[2] + (bottom[2] - top[2]) * t)
        draw.line([(0, y), (CARD_W, y)], fill=(r, g, b))
    return base


def _load_font(size: int) -> ImageFont.FreeTypeFont | ImageFont.ImageFont:
    for name in ("arialbd.ttf", "Arial Bold.ttf", "DejaVuSans-Bold.ttf", "arial.ttf"):
        try:
            return ImageFont.truetype(name, size)
        except OSError:
            continue
    return ImageFont.load_default()


def _wrap(draw: ImageDraw.ImageDraw, text: str, font, max_w: int) -> list[str]:
    words, lines, cur = text.split(), [], ""
    for w in words:
        trial = f"{cur} {w}".strip()
        if draw.textlength(trial, font=font) <= max_w:
            cur = trial
        else:
            if cur:
                lines.append(cur)
            cur = w
    if cur:
        lines.append(cur)
    return lines[:4]


def _generate_placeholder(game: Game) -> Path:
    key = hashlib.md5(f"{game.console_id}:{game.title}".encode()).hexdigest()
    out = _CACHE_DIR / f"{key}.png"
    if out.exists():
        return out

    accent = _hex_to_rgb(CONSOLES[game.console_id]["accent"])
    darker = tuple(max(0, c - 60) for c in accent)
    img = _vertical_gradient(accent, darker)  # type: ignore
    draw = ImageDraw.Draw(img)

    # Console badge at the top.
    badge_font = _load_font(26)
    badge = CONSOLES[game.console_id]["name"].upper()
    draw.text((20, 18), badge, font=badge_font, fill=(255, 255, 255))

    # Title, wrapped and vertically centred-ish.
    title_font = _load_font(34)
    lines = _wrap(draw, game.title, title_font, CARD_W - 40)
    line_h = title_font.size + 8
    total_h = line_h * len(lines)
    y = (CARD_H - total_h) // 2
    for line in lines:
        w = draw.textlength(line, font=title_font)
        x = (CARD_W - w) // 2
        # subtle shadow for readability
        draw.text((x + 2, y + 2), line, font=title_font, fill=(0, 0, 0))
        draw.text((x, y), line, font=title_font, fill=(255, 255, 255))
        y += line_h

    img.save(out, "PNG")
    return out


def cover_path(game: Game) -> Path:
    """Return a path to a cover image for the game (real or generated)."""
    existing = _find_existing_cover(game)
    return existing if existing else _generate_placeholder(game)
