"""
Tema central (colores, fuentes, tamaños) — estilo PS5 / Nintendo Switch.

Algunos valores (acento, tamaño de tarjeta) son DINÁMICOS: se pueden cambiar
en tiempo de ejecución desde los Ajustes mediante set_accent() / set_card_size().
Los widgets leen estos valores como atributos del módulo (theme.ACCENT, ...),
así que al reconstruir la rejilla/barra lateral toman el nuevo valor.
"""

# --------------------------------------------------------------------------- #
#  Colores base (fondo oscuro)
# --------------------------------------------------------------------------- #
BG_DEEP = "#0a0e1a"        # fondo de la ventana (casi negro azulado)
BG_PANEL = "#121829"       # barra lateral / paneles
BG_CARD = "#1a2236"        # tarjetas
BG_CARD_HOVER = "#243150"  # tarjeta al pasar el ratón
BG_INPUT = "#0f1525"

# Acento (DINÁMICO)
ACCENT = "#2f81f7"
ACCENT_HOVER = "#4b95ff"
ACCENT_SOFT = "#1c3a66"

# Texto
TEXT = "#eef2fb"
TEXT_MUTED = "#8a93a8"
OK = "#3fb950"
ERR = "#f85149"

# --------------------------------------------------------------------------- #
#  Temas de color seleccionables (nombre -> (acento, hover, soft))
# --------------------------------------------------------------------------- #
COLOR_THEMES: dict[str, tuple[str, str, str]] = {
    "Azul PlayStation": ("#2f81f7", "#4b95ff", "#1c3a66"),
    "Morado Nebulosa":  ("#8b5cf6", "#a78bfa", "#3b2a66"),
    "Verde Neón":       ("#22c55e", "#4ade80", "#16401f"),
    "Rojo Carmesí":     ("#ef4444", "#f87171", "#5a1f1f"),
    "Naranja Sunset":   ("#f97316", "#fb923c", "#5a3210"),
    "Cian Aqua":        ("#06b6d4", "#22d3ee", "#0e4a55"),
    "Rosa Magenta":     ("#ec4899", "#f472b6", "#5a1f44"),
}

# --------------------------------------------------------------------------- #
#  Tamaños de tarjeta seleccionables
# --------------------------------------------------------------------------- #
CARD_SIZES: dict[str, int] = {"Pequeña": 150, "Mediana": 180, "Grande": 220}

CARD_WIDTH = 180          # DINÁMICO
CARD_HEIGHT = 240         # se recalcula con el ancho
GRID_PAD = 18

# --------------------------------------------------------------------------- #
#  Fuentes
# --------------------------------------------------------------------------- #
FONT_BRAND = ("Roboto", 22, "bold")
FONT_TITLE = ("Roboto", 26, "bold")
FONT_SUBTITLE = ("Roboto", 15, "bold")
FONT_BODY = ("Roboto", 13)
FONT_CARD = ("Roboto", 14, "bold")
FONT_SMALL = ("Roboto", 11)
FONT_TAB = ("Roboto", 13, "bold")


# --------------------------------------------------------------------------- #
#  API dinámica
# --------------------------------------------------------------------------- #
def set_accent(theme_name: str) -> None:
    """Cambia el color de acento según un nombre de COLOR_THEMES."""
    global ACCENT, ACCENT_HOVER, ACCENT_SOFT
    if theme_name in COLOR_THEMES:
        ACCENT, ACCENT_HOVER, ACCENT_SOFT = COLOR_THEMES[theme_name]


def set_card_size(size_name: str) -> None:
    """Cambia el ancho de las tarjetas (Pequeña / Mediana / Grande)."""
    global CARD_WIDTH
    if size_name in CARD_SIZES:
        CARD_WIDTH = CARD_SIZES[size_name]


def hex_to_rgb(value: str) -> tuple[int, int, int]:
    value = value.lstrip("#")
    return tuple(int(value[i:i + 2], 16) for i in (0, 2, 4))  # type: ignore


def rgb_to_hex(rgb: tuple[int, int, int]) -> str:
    return "#%02x%02x%02x" % rgb


def lerp_color(c1: str, c2: str, t: float) -> str:
    """Interpola entre dos colores hex (t de 0 a 1). Para animaciones."""
    a, b = hex_to_rgb(c1), hex_to_rgb(c2)
    return rgb_to_hex(tuple(int(a[i] + (b[i] - a[i]) * t) for i in range(3)))  # type: ignore
