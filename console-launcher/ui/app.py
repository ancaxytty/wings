"""Main application window: sidebar + search bar + responsive cover grid."""

from __future__ import annotations

from tkinter import messagebox

import customtkinter as ctk

from core.config import Config, CONSOLES
from core.launcher import launch, LaunchError
from core.scanner import scan, flatten, Game
from . import theme
from .game_card import GameCard
from .sidebar import Sidebar, ALL
from .settings_dialog import SettingsDialog


class LauncherApp(ctk.CTk):
    def __init__(self):
        super().__init__()
        ctk.set_appearance_mode("dark")

        self.title("Nexus Game Center")
        self.geometry("1180x720")
        self.minsize(880, 560)
        self.configure(fg_color=theme.BG_DEEP)

        self.config_obj = Config.load()
        self.library: dict[str, list[Game]] = {cid: [] for cid in CONSOLES}
        self.current_filter = ALL
        self.search_text = ""
        self._cards: list[GameCard] = []
        self._last_cols = 0

        self._build_layout()
        self.reload_library()

    # ----------------------------------------------------------------- #
    #  Layout
    # ----------------------------------------------------------------- #
    def _build_layout(self):
        self.grid_columnconfigure(1, weight=1)
        self.grid_rowconfigure(0, weight=1)

        # Sidebar (column 0)
        self.sidebar = Sidebar(
            self,
            on_select=self._on_filter,
            on_settings=self._open_settings,
            on_reload=self.reload_library,
        )
        self.sidebar.grid(row=0, column=0, sticky="ns")

        # Main content (column 1)
        content = ctk.CTkFrame(self, fg_color="transparent")
        content.grid(row=0, column=1, sticky="nsew")
        content.grid_rowconfigure(1, weight=1)
        content.grid_columnconfigure(0, weight=1)

        # Top bar: title + search
        topbar = ctk.CTkFrame(content, fg_color="transparent", height=70)
        topbar.grid(row=0, column=0, sticky="ew", padx=24, pady=(20, 10))
        topbar.grid_columnconfigure(1, weight=1)

        ctk.CTkLabel(
            topbar, text="CENTRAL DE JUEGOS",
            font=theme.FONT_TITLE, text_color=theme.TEXT,
        ).grid(row=0, column=0, sticky="w")

        self.search_var = ctk.StringVar()
        self.search_var.trace_add("write", lambda *_: self._on_search())
        search = ctk.CTkEntry(
            topbar, textvariable=self.search_var, width=280, height=38,
            placeholder_text="🔎  Buscar juego...", font=theme.FONT_BODY,
        )
        search.grid(row=0, column=2, sticky="e")

        # Scrollable grid of game cards.
        self.grid_frame = ctk.CTkScrollableFrame(
            content, fg_color="transparent", corner_radius=0
        )
        self.grid_frame.grid(row=1, column=0, sticky="nsew", padx=16, pady=(0, 16))
        self.grid_frame.bind("<Configure>", self._on_grid_resize)

        # Empty-state / status label (shown when there are no games).
        self.status_label = ctk.CTkLabel(
            self.grid_frame, text="", font=theme.FONT_SUBTITLE,
            text_color=theme.TEXT_MUTED, justify="center",
        )

    # ----------------------------------------------------------------- #
    #  Data
    # ----------------------------------------------------------------- #
    def reload_library(self):
        self.library = scan(self.config_obj.roms_folder)
        counts = {cid: len(games) for cid, games in self.library.items()}
        self.sidebar.set_counts(counts)
        self._render_grid(force=True)

    def _visible_games(self) -> list[Game]:
        if self.current_filter == ALL:
            games = flatten(self.library)
        else:
            games = list(self.library.get(self.current_filter, []))
        if self.search_text:
            q = self.search_text.lower()
            games = [g for g in games if q in g.title.lower()]
        return games

    # ----------------------------------------------------------------- #
    #  Rendering
    # ----------------------------------------------------------------- #
    def _columns_for_width(self) -> int:
        width = self.grid_frame.winfo_width() or 900
        col_w = theme.CARD_WIDTH + theme.GRID_PAD
        return max(1, width // col_w)

    def _render_grid(self, force: bool = False):
        cols = self._columns_for_width()
        if not force and cols == self._last_cols:
            return
        self._last_cols = cols

        # Clear existing widgets.
        for card in self._cards:
            card.destroy()
        self._cards.clear()
        self.status_label.grid_forget()

        games = self._visible_games()

        if not games:
            self._show_empty_state()
            return

        for i in range(cols):
            self.grid_frame.grid_columnconfigure(i, weight=1)

        for idx, game in enumerate(games):
            r, c = divmod(idx, cols)
            card = GameCard(self.grid_frame, game, on_play=self._play)
            card.grid(row=r, column=c, padx=theme.GRID_PAD // 2,
                      pady=theme.GRID_PAD // 2, sticky="n")
            self._cards.append(card)

    def _show_empty_state(self):
        if not self.config_obj.roms_folder:
            msg = ("Aún no has configurado tu biblioteca.\n\n"
                   "Abre ⚙ Ajustes, elige tu carpeta ROMS y\n"
                   "las rutas de DuckStation, PCSX2 y PPSSPP.")
        elif self.search_text:
            msg = f'No hay juegos que coincidan con "{self.search_text}".'
        else:
            msg = ("No se encontraron juegos en la carpeta ROMS.\n\n"
                   "Organiza tus juegos en sub-carpetas:\n"
                   "ROMS/PS1, ROMS/PS2, ROMS/PSP")
        self.status_label.configure(text=msg)
        self.status_label.grid(row=0, column=0, pady=80)

    def _on_grid_resize(self, _event=None):
        # Debounce-ish: only re-render when the column count actually changes.
        self._render_grid(force=False)

    # ----------------------------------------------------------------- #
    #  Callbacks
    # ----------------------------------------------------------------- #
    def _on_filter(self, key: str):
        self.current_filter = key
        self._render_grid(force=True)

    def _on_search(self):
        self.search_text = self.search_var.get().strip()
        self._render_grid(force=True)

    def _open_settings(self):
        SettingsDialog(self, self.config_obj, on_saved=self.reload_library)

    def _play(self, game: Game):
        try:
            launch(game, self.config_obj)
        except LaunchError as exc:
            messagebox.showerror("No se pudo iniciar", str(exc))


def run():
    app = LauncherApp()
    app.mainloop()
