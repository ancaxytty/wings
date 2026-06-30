"""Main application window: sidebar + search bar + responsive cover grid."""

from __future__ import annotations

from tkinter import messagebox

import customtkinter as ctk

from core.config import Config, CONSOLES, resource_path
from core.launcher import launch, LaunchError
from core import emulator_finder
from core.scanner import scan, flatten, Game
from . import theme
from .game_card import GameCard
from .sidebar import Sidebar, ALL
from .settings_dialog import SettingsDialog


class LauncherApp(ctk.CTk):
    def __init__(self):
        super().__init__()
        ctk.set_appearance_mode("dark")

        self.config_obj = Config.load()
        self._apply_theme_from_config()

        self.title("Nexus Game Center")
        self.geometry("1180x720")
        self.minsize(880, 560)
        self.configure(fg_color=theme.BG_DEEP)
        self._apply_icon()

        self.library: dict[str, list[Game]] = {cid: [] for cid in CONSOLES}
        self.current_filter = ALL
        self.search_text = ""
        self._cards: list[GameCard] = []
        self._last_cols = 0

        self._build_layout()
        self.reload_library()

    def _apply_theme_from_config(self):
        """Apply the saved color theme and card size to the theme module."""
        theme.set_accent(self.config_obj.color_theme)
        theme.set_card_size(self.config_obj.card_size)

    def _apply_icon(self):
        """Set the window/taskbar icon (app.ico). Safe no-op if unavailable."""
        try:
            ico = resource_path("app.ico")
            if ico.exists():
                self.iconbitmap(default=str(ico))
        except Exception:
            pass  # icon is cosmetic; never crash over it

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

        title_box = ctk.CTkFrame(topbar, fg_color="transparent")
        title_box.grid(row=0, column=0, sticky="w")
        ctk.CTkLabel(
            title_box, text="CENTRAL DE JUEGOS",
            font=theme.FONT_TITLE, text_color=theme.TEXT,
        ).pack(anchor="w")
        ctk.CTkLabel(
            title_box, text="Tu biblioteca de PS1 · PS2 · PSP",
            font=theme.FONT_SMALL, text_color=theme.TEXT_MUTED,
        ).pack(anchor="w")

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
        self.grid_frame.grid(row=1, column=0, sticky="nsew", padx=16, pady=(0, 8))
        self.grid_frame.bind("<Configure>", self._on_grid_resize)

        # Status bar (bottom)
        statusbar = ctk.CTkFrame(content, fg_color=theme.BG_PANEL, height=30,
                                 corner_radius=0)
        statusbar.grid(row=2, column=0, sticky="ew")
        self.status_bar_label = ctk.CTkLabel(
            statusbar, text="", font=theme.FONT_SMALL,
            text_color=theme.TEXT_MUTED, anchor="w",
        )
        self.status_bar_label.pack(side="left", padx=16, pady=4)

        # Empty-state / status label (shown when there are no games).
        self.status_label = ctk.CTkLabel(
            self.grid_frame, text="", font=theme.FONT_SUBTITLE,
            text_color=theme.TEXT_MUTED, justify="center",
        )

    # ----------------------------------------------------------------- #
    #  Data
    # ----------------------------------------------------------------- #
    def reload_library(self):
        emulator_finder.clear_cache()  # re-detect emulators dropped into emulators/
        self.library = scan(self.config_obj.roms_folder)
        counts = {cid: len(games) for cid, games in self.library.items()}
        self.sidebar.set_counts(counts)
        self._update_status_bar(counts)
        self._render_grid(force=True)

    def _update_status_bar(self, counts: dict[str, int]):
        total = sum(counts.values())
        folder = self.config_obj.roms_folder or "(sin configurar)"
        self.status_bar_label.configure(
            text=f"📁 ROMS: {folder}    •    {total} juego(s) en la biblioteca"
        )

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
        SettingsDialog(self, self.config_obj, on_saved=self._on_settings_saved)

    def _on_settings_saved(self):
        """Re-apply theme/size (rebuilding the UI) then rescan the library."""
        self._apply_theme_from_config()
        # Rebuild the whole layout so the new accent/card size take effect.
        for w in self.winfo_children():
            w.destroy()
        self._cards.clear()
        self._last_cols = 0
        self._build_layout()
        self.reload_library()

    def _play(self, game: Game):
        if self.config_obj.confirm_launch:
            if not messagebox.askyesno("Confirmar", f"¿Iniciar «{game.title}»?"):
                return
        try:
            launch(game, self.config_obj)
        except LaunchError as exc:
            messagebox.showerror("No se pudo iniciar", str(exc))
            return
        if self.config_obj.close_on_launch:
            self.iconify()


def run():
    app = LauncherApp()
    app.mainloop()
