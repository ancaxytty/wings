"""
Tarjeta de juego con animaciones.

Al pasar el ratón:
  • el fondo se aclara con una transición de color suave (interpolada),
  • aparece un borde de acento,
  • se muestra un botón ▶ "Jugar" superpuesto sobre la carátula.
Clic en cualquier parte = lanzar el juego.
"""

from __future__ import annotations

from typing import Callable

import customtkinter as ctk
from PIL import Image

from core.covers import cover_path
from core.config import CONSOLES
from core.scanner import Game
from . import theme


class GameCard(ctk.CTkFrame):
    _ANIM_STEPS = 6
    _ANIM_MS = 16

    def __init__(self, master, game: Game, on_play: Callable[[Game], None]):
        cover_w = theme.CARD_WIDTH - 20
        cover_h = int(cover_w * 4 / 3)
        super().__init__(
            master,
            width=theme.CARD_WIDTH,
            height=cover_h + 64,
            corner_radius=16,
            fg_color=theme.BG_CARD,
            border_width=0,
            border_color=theme.ACCENT,
        )
        self.game = game
        self.on_play = on_play
        self._anim_job = None
        self._hovering = False
        self.grid_propagate(False)
        self.pack_propagate(False)

        # --- Carátula + overlay -------------------------------------------
        img = Image.open(cover_path(game))
        self._cover = ctk.CTkImage(light_image=img, dark_image=img,
                                   size=(cover_w, cover_h))
        cover_holder = ctk.CTkFrame(self, fg_color="transparent",
                                    width=cover_w, height=cover_h)
        cover_holder.pack(padx=10, pady=(10, 6))
        cover_holder.pack_propagate(False)

        self.img_label = ctk.CTkLabel(cover_holder, image=self._cover, text="")
        self.img_label.place(relx=0.5, rely=0.5, anchor="center")

        # Etiqueta de consola (esquina superior)
        self.badge = ctk.CTkLabel(
            cover_holder, text=f" {game.console_id} ", font=theme.FONT_SMALL,
            text_color=theme.TEXT, fg_color=CONSOLES[game.console_id]["accent"],
            corner_radius=6,
        )
        self.badge.place(x=6, y=6)

        # Overlay "Jugar" (oculto hasta el hover)
        self.play_overlay = ctk.CTkButton(
            cover_holder, text="▶  Jugar", width=cover_w - 30, height=38,
            corner_radius=10, fg_color=theme.ACCENT, hover_color=theme.ACCENT_HOVER,
            font=theme.FONT_SUBTITLE, command=self._on_click,
        )

        # --- Título --------------------------------------------------------
        self.title_label = ctk.CTkLabel(
            self, text=game.title, font=theme.FONT_CARD, text_color=theme.TEXT,
            wraplength=theme.CARD_WIDTH - 24, justify="center",
        )
        self.title_label.pack(padx=8, fill="x")

        # Hover + clic en toda la tarjeta
        for w in (self, cover_holder, self.img_label, self.title_label, self.badge):
            w.bind("<Enter>", self._on_enter)
            w.bind("<Leave>", self._on_leave)
            w.bind("<Button-1>", self._on_click)
            w.configure(cursor="hand2")

    # ----------------------------------------------------------------- #
    def _animate(self, target_fg: str, step: int):
        try:
            current = self.cget("fg_color")
        except Exception:
            return
        t = step / self._ANIM_STEPS
        color = theme.lerp_color(theme.BG_CARD, target_fg, t)
        self.configure(fg_color=color)
        if step < self._ANIM_STEPS:
            self._anim_job = self.after(
                self._ANIM_MS, lambda: self._animate(target_fg, step + 1))

    def _start_anim(self, target_fg: str, forward: bool):
        if self._anim_job:
            self.after_cancel(self._anim_job)
            self._anim_job = None
        start = 0 if forward else self._ANIM_STEPS
        self._animate(target_fg, start)

    def _on_enter(self, _e=None):
        if self._hovering:
            return
        self._hovering = True
        self.configure(border_width=2)
        self._start_anim(theme.BG_CARD_HOVER, forward=True)
        self.play_overlay.place(relx=0.5, rely=0.92, anchor="center")

    def _on_leave(self, _e=None):
        # Solo salir si el ratón abandona realmente la tarjeta.
        x, y = self.winfo_pointerxy()
        widget = self.winfo_containing(x, y)
        if widget is not None and (widget is self or str(widget).startswith(str(self))):
            return
        self._hovering = False
        self.configure(border_width=0, fg_color=theme.BG_CARD)
        if self._anim_job:
            self.after_cancel(self._anim_job)
            self._anim_job = None
        self.play_overlay.place_forget()

    def _on_click(self, _e=None):
        self.on_play(self.game)
