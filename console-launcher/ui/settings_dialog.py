"""Modal dialog to configure the ROMs folder and each emulator executable."""

from __future__ import annotations

from tkinter import filedialog
from typing import Callable

import customtkinter as ctk

from core.config import Config, CONSOLES
from . import theme


class SettingsDialog(ctk.CTkToplevel):
    def __init__(self, master, config: Config, on_saved: Callable[[], None]):
        super().__init__(master)
        self.config_obj = config
        self.on_saved = on_saved

        self.title("Ajustes")
        self.geometry("640x460")
        self.configure(fg_color=theme.BG_DEEP)
        self.resizable(False, False)

        # Keep the dialog on top of the main window and grab focus.
        self.transient(master)
        self.after(10, self.grab_set)

        ctk.CTkLabel(
            self, text="Ajustes", font=theme.FONT_TITLE, text_color=theme.TEXT
        ).pack(anchor="w", padx=24, pady=(20, 10))

        body = ctk.CTkFrame(self, fg_color="transparent")
        body.pack(fill="both", expand=True, padx=24)

        # --- ROMs folder ---------------------------------------------------
        self.roms_var = ctk.StringVar(value=config.roms_folder)
        self._path_row(body, "Carpeta de ROMS", self.roms_var, pick_dir=True)

        # --- Emulator executables -----------------------------------------
        self.emu_vars: dict[str, ctk.StringVar] = {}
        seen_keys: set[str] = set()
        for cid, meta in CONSOLES.items():
            key = meta["emulator_key"]
            if key in seen_keys:
                continue
            seen_keys.add(key)
            var = ctk.StringVar(value=config.emulators.get(key, ""))
            self.emu_vars[key] = var
            self._path_row(body, f"Emulador {meta['name']} ({key})", var, pick_dir=False)

        # --- Buttons -------------------------------------------------------
        btn_row = ctk.CTkFrame(self, fg_color="transparent")
        btn_row.pack(fill="x", padx=24, pady=18)
        ctk.CTkButton(
            btn_row, text="Cancelar", command=self.destroy,
            fg_color=theme.BG_CARD, hover_color=theme.BG_CARD_HOVER, width=120,
        ).pack(side="right", padx=(10, 0))
        ctk.CTkButton(
            btn_row, text="Guardar", command=self._save,
            fg_color=theme.ACCENT, hover_color=theme.ACCENT_HOVER, width=120,
        ).pack(side="right")

    # ----------------------------------------------------------------- #
    def _path_row(self, parent, label: str, var: ctk.StringVar, pick_dir: bool):
        ctk.CTkLabel(
            parent, text=label, font=theme.FONT_BODY, text_color=theme.TEXT_MUTED
        ).pack(anchor="w", pady=(10, 2))

        row = ctk.CTkFrame(parent, fg_color="transparent")
        row.pack(fill="x")
        entry = ctk.CTkEntry(row, textvariable=var, font=theme.FONT_BODY)
        entry.pack(side="left", fill="x", expand=True)

        def browse():
            if pick_dir:
                path = filedialog.askdirectory(title=label)
            else:
                path = filedialog.askopenfilename(
                    title=label,
                    filetypes=[("Ejecutables", "*.exe"), ("Todos", "*.*")],
                )
            if path:
                var.set(path)
            # Re-grab focus after the native dialog closes.
            self.after(10, self.grab_set)

        ctk.CTkButton(
            row, text="Examinar", width=100, command=browse,
            fg_color=theme.BG_CARD, hover_color=theme.BG_CARD_HOVER,
        ).pack(side="left", padx=(8, 0))

    def _save(self):
        self.config_obj.roms_folder = self.roms_var.get().strip()
        for key, var in self.emu_vars.items():
            self.config_obj.emulators[key] = var.get().strip()
        self.config_obj.save()
        self.destroy()
        self.on_saved()
