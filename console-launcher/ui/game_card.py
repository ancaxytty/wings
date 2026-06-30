"""A single game tile: cover art + title, with hover highlight and click-to-play."""

from __future__ import annotations

from typing import Callable

import customtkinter as ctk
from PIL import Image

from core.covers import cover_path
from core.scanner import Game
from . import theme


class GameCard(ctk.CTkFrame):
    def __init__(self, master, game: Game, on_play: Callable[[Game], None]):
        super().__init__(
            master,
            width=theme.CARD_WIDTH,
            height=theme.CARD_HEIGHT,
            corner_radius=14,
            fg_color=theme.BG_CARD,
        )
        self.game = game
        self.on_play = on_play
        self.grid_propagate(False)

        # --- Cover image ---------------------------------------------------
        img = Image.open(cover_path(game))
        cover_w = theme.CARD_WIDTH - 20
        cover_h = int(cover_w * 4 / 3)
        self._cover = ctk.CTkImage(light_image=img, dark_image=img, size=(cover_w, cover_h))

        self.img_label = ctk.CTkLabel(self, image=self._cover, text="")
        self.img_label.pack(padx=10, pady=(10, 6))

        # --- Title ---------------------------------------------------------
        self.title_label = ctk.CTkLabel(
            self,
            text=game.title,
            font=theme.FONT_CARD,
            text_color=theme.TEXT,
            wraplength=theme.CARD_WIDTH - 24,
            justify="center",
        )
        self.title_label.pack(padx=8, fill="x")

        # Make the whole card clickable + hoverable.
        for w in (self, self.img_label, self.title_label):
            w.bind("<Enter>", self._on_enter)
            w.bind("<Leave>", self._on_leave)
            w.bind("<Button-1>", self._on_click)
            w.configure(cursor="hand2")

    # ----------------------------------------------------------------- #
    def _on_enter(self, _event=None):
        self.configure(fg_color=theme.BG_CARD_HOVER)

    def _on_leave(self, _event=None):
        self.configure(fg_color=theme.BG_CARD)

    def _on_click(self, _event=None):
        self.on_play(self.game)
