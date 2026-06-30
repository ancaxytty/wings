"""Left navigation rail: filter the library by console + open settings."""

from __future__ import annotations

from typing import Callable

import customtkinter as ctk

from core.config import CONSOLES
from . import theme

ALL = "ALL"


class Sidebar(ctk.CTkFrame):
    def __init__(
        self,
        master,
        on_select: Callable[[str], None],
        on_settings: Callable[[], None],
        on_reload: Callable[[], None],
    ):
        super().__init__(master, width=220, corner_radius=0, fg_color=theme.BG_PANEL)
        self.grid_propagate(False)
        self.on_select = on_select

        self._buttons: dict[str, ctk.CTkButton] = {}
        self._active = ALL

        # Brand / logo area.
        ctk.CTkLabel(
            self,
            text="◈ NEXUS",
            font=("Roboto", 22, "bold"),
            text_color=theme.ACCENT,
        ).pack(pady=(26, 4), padx=20, anchor="w")
        ctk.CTkLabel(
            self,
            text="GAME CENTER",
            font=theme.FONT_SMALL,
            text_color=theme.TEXT_MUTED,
        ).pack(pady=(0, 22), padx=20, anchor="w")

        # Console filter buttons.
        self._add_filter(ALL, "🎮  Todos los juegos")
        for cid, meta in CONSOLES.items():
            self._add_filter(cid, f"🕹  {meta['name']}")

        # Spacer pushes the bottom actions down.
        ctk.CTkFrame(self, fg_color="transparent").pack(expand=True, fill="both")

        ctk.CTkButton(
            self, text="🔄  Re-escanear", command=on_reload,
            fg_color="transparent", hover_color=theme.BG_CARD_HOVER,
            anchor="w", font=theme.FONT_BODY, text_color=theme.TEXT,
        ).pack(fill="x", padx=12, pady=4)

        ctk.CTkButton(
            self, text="⚙  Ajustes", command=on_settings,
            fg_color="transparent", hover_color=theme.BG_CARD_HOVER,
            anchor="w", font=theme.FONT_BODY, text_color=theme.TEXT,
        ).pack(fill="x", padx=12, pady=(4, 20))

        self._refresh_active()

    # ----------------------------------------------------------------- #
    def _add_filter(self, key: str, label: str):
        btn = ctk.CTkButton(
            self,
            text=label,
            command=lambda k=key: self._select(k),
            anchor="w",
            height=40,
            corner_radius=10,
            font=theme.FONT_BODY,
            fg_color="transparent",
            hover_color=theme.BG_CARD_HOVER,
            text_color=theme.TEXT,
        )
        btn.pack(fill="x", padx=12, pady=3)
        self._buttons[key] = btn

    def _select(self, key: str):
        self._active = key
        self._refresh_active()
        self.on_select(key)

    def set_counts(self, counts: dict[str, int]):
        """Update the button labels with live game counts."""
        total = sum(counts.values())
        self._buttons[ALL].configure(text=f"🎮  Todos los juegos  ({total})")
        for cid, meta in CONSOLES.items():
            self._buttons[cid].configure(
                text=f"🕹  {meta['name']}  ({counts.get(cid, 0)})"
            )

    def _refresh_active(self):
        for key, btn in self._buttons.items():
            if key == self._active:
                btn.configure(fg_color=theme.ACCENT, hover_color=theme.ACCENT_HOVER)
            else:
                btn.configure(fg_color="transparent", hover_color=theme.BG_CARD_HOVER)
