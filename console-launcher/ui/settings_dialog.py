"""
Diálogo de Ajustes (moderno, con pestañas).

Pestañas:
  • General     -> carpeta ROMS, opciones de lanzamiento
  • Emuladores  -> rutas + validación en vivo (✓/✗) + argumentos avanzados
  • Apariencia  -> tema de color (con muestras) y tamaño de carátulas
"""

from __future__ import annotations

import os
from tkinter import filedialog
from typing import Callable

import customtkinter as ctk

from core.config import Config, CONSOLES
from core import emulator_finder
from . import theme


class SettingsDialog(ctk.CTkToplevel):
    def __init__(self, master, config: Config, on_saved: Callable[[], None]):
        super().__init__(master)
        self.config_obj = config
        self.on_saved = on_saved

        self.title("Ajustes")
        self.geometry("720x600")
        self.configure(fg_color=theme.BG_DEEP)
        self.resizable(False, False)
        self.transient(master)
        self.after(10, self.grab_set)

        # --- Cabecera ------------------------------------------------------
        header = ctk.CTkFrame(self, fg_color="transparent")
        header.pack(fill="x", padx=24, pady=(20, 6))
        ctk.CTkLabel(header, text="⚙  Ajustes", font=theme.FONT_TITLE,
                     text_color=theme.TEXT).pack(side="left")
        ctk.CTkLabel(header, text="Personaliza tu Game Center",
                     font=theme.FONT_SMALL, text_color=theme.TEXT_MUTED
                     ).pack(side="left", padx=(12, 0), pady=(10, 0))

        # --- Pestañas ------------------------------------------------------
        self.tabs = ctk.CTkTabview(
            self, fg_color=theme.BG_PANEL, segmented_button_fg_color=theme.BG_CARD,
            segmented_button_selected_color=theme.ACCENT,
            segmented_button_selected_hover_color=theme.ACCENT_HOVER,
            text_color=theme.TEXT, corner_radius=14,
        )
        self.tabs.pack(fill="both", expand=True, padx=24, pady=8)
        tab_general = self.tabs.add("General")
        tab_emus = self.tabs.add("Emuladores")
        tab_look = self.tabs.add("Apariencia")

        self._build_general(tab_general)
        self._build_emulators(tab_emus)
        self._build_appearance(tab_look)

        # --- Botones -------------------------------------------------------
        btn_row = ctk.CTkFrame(self, fg_color="transparent")
        btn_row.pack(fill="x", padx=24, pady=(4, 18))
        ctk.CTkButton(btn_row, text="Cancelar", command=self.destroy,
                      fg_color=theme.BG_CARD, hover_color=theme.BG_CARD_HOVER,
                      width=130, height=40).pack(side="right", padx=(10, 0))
        ctk.CTkButton(btn_row, text="💾  Guardar", command=self._save,
                      fg_color=theme.ACCENT, hover_color=theme.ACCENT_HOVER,
                      width=150, height=40, font=theme.FONT_SUBTITLE
                      ).pack(side="right")

    # ================================================================= #
    #  Pestaña: General
    # ================================================================= #
    def _build_general(self, parent):
        self._section(parent, "Biblioteca")
        self.roms_var = ctk.StringVar(value=self.config_obj.roms_folder)
        self._path_row(parent, "Carpeta de ROMS", self.roms_var,
                       pick_dir=True, validate=True, is_dir=True)

        self._section(parent, "Al iniciar un juego")
        self.fullscreen_var = ctk.BooleanVar(value=self.config_obj.launch_fullscreen)
        self.close_var = ctk.BooleanVar(value=self.config_obj.close_on_launch)
        self.confirm_var = ctk.BooleanVar(value=self.config_obj.confirm_launch)
        self._switch(parent, "Abrir el emulador en pantalla completa", self.fullscreen_var)
        self._switch(parent, "Minimizar el launcher al jugar", self.close_var)
        self._switch(parent, "Pedir confirmación antes de lanzar", self.confirm_var)

    # ================================================================= #
    #  Pestaña: Emuladores
    # ================================================================= #
    def _build_emulators(self, parent):
        ctk.CTkLabel(
            parent,
            text="No necesitas configurar nada si dejas los emuladores en la\n"
                 "carpeta «emulators». Si los encuentra solo, verás «Auto ✓».\n"
                 "Solo rellena la ruta si quieres forzar un .exe concreto.",
            font=theme.FONT_SMALL, text_color=theme.TEXT_MUTED, justify="left",
        ).pack(anchor="w", pady=(6, 4))

        self.emu_vars: dict[str, ctk.StringVar] = {}
        self.arg_vars: dict[str, ctk.StringVar] = {}
        seen: set[str] = set()
        for cid, meta in CONSOLES.items():
            key = meta["emulator_key"]
            if key in seen:
                continue
            seen.add(key)

            self._section(parent, f"{meta['name']}  ·  {key}")

            # Estado de detección automática
            auto = emulator_finder.detect(key)
            if auto:
                ctk.CTkLabel(
                    parent, text=f"Auto ✓  detectado: {auto}",
                    font=theme.FONT_SMALL, text_color=theme.OK, justify="left",
                    wraplength=600,
                ).pack(anchor="w", pady=(0, 2))
            else:
                ctk.CTkLabel(
                    parent,
                    text=f"No detectado · déjalo en  emulators/{key}",
                    font=theme.FONT_SMALL, text_color=theme.TEXT_MUTED,
                ).pack(anchor="w", pady=(0, 2))

            var = ctk.StringVar(value=self.config_obj.emulators.get(key, ""))
            self.emu_vars[key] = var
            self._path_row(parent, "Ruta manual (opcional)", var,
                           pick_dir=False, validate=True, is_dir=False)

            arg = ctk.StringVar(value=self.config_obj.emulator_args.get(key, ""))
            self.arg_vars[key] = arg
            ctk.CTkLabel(parent, text="Argumentos extra (avanzado, opcional)",
                         font=theme.FONT_SMALL, text_color=theme.TEXT_MUTED
                         ).pack(anchor="w", pady=(6, 2))
            ctk.CTkEntry(parent, textvariable=arg, font=theme.FONT_BODY,
                         placeholder_text="-nogui -batch").pack(fill="x")

    # ================================================================= #
    #  Pestaña: Apariencia
    # ================================================================= #
    def _build_appearance(self, parent):
        self._section(parent, "Tema de color")
        self.theme_var = ctk.StringVar(value=self.config_obj.color_theme)

        swatches = ctk.CTkFrame(parent, fg_color="transparent")
        swatches.pack(fill="x", pady=(2, 8))
        self._swatch_btns: dict[str, ctk.CTkButton] = {}
        for i, (name, (acc, _h, _s)) in enumerate(theme.COLOR_THEMES.items()):
            b = ctk.CTkButton(
                swatches, text="", width=46, height=34, corner_radius=10,
                fg_color=acc, hover_color=acc,
                border_width=3, border_color=theme.BG_PANEL,
                command=lambda n=name: self._pick_theme(n),
            )
            b.grid(row=i // 4, column=i % 4, padx=6, pady=6)
            self._swatch_btns[name] = b
        self._pick_theme(self.theme_var.get(), apply_preview=False)

        self.theme_name_label = ctk.CTkLabel(
            parent, text=self.theme_var.get(),
            font=theme.FONT_SUBTITLE, text_color=theme.TEXT)
        self.theme_name_label.pack(anchor="w", pady=(0, 4))

        self._section(parent, "Tamaño de las carátulas")
        self.size_var = ctk.StringVar(value=self.config_obj.card_size)
        ctk.CTkSegmentedButton(
            parent, values=list(theme.CARD_SIZES.keys()), variable=self.size_var,
            selected_color=theme.ACCENT, selected_hover_color=theme.ACCENT_HOVER,
            font=theme.FONT_BODY,
        ).pack(anchor="w", pady=4)

        self._section(parent, "Modo de apariencia")
        self.mode_var = ctk.StringVar(value=ctk.get_appearance_mode())
        ctk.CTkSegmentedButton(
            parent, values=["Dark", "Light", "System"], variable=self.mode_var,
            command=lambda v: ctk.set_appearance_mode(v),
            selected_color=theme.ACCENT, selected_hover_color=theme.ACCENT_HOVER,
            font=theme.FONT_BODY,
        ).pack(anchor="w", pady=4)

    def _pick_theme(self, name: str, apply_preview: bool = True):
        self.theme_var.set(name)
        for n, b in self._swatch_btns.items():
            b.configure(border_color=theme.TEXT if n == name else theme.BG_PANEL)
        if apply_preview and hasattr(self, "theme_name_label"):
            self.theme_name_label.configure(text=name)

    # ================================================================= #
    #  Helpers de UI
    # ================================================================= #
    def _section(self, parent, title: str):
        ctk.CTkLabel(parent, text=title.upper(), font=theme.FONT_SMALL,
                     text_color=theme.ACCENT_HOVER).pack(anchor="w", pady=(14, 2))

    def _switch(self, parent, label: str, var: ctk.BooleanVar):
        row = ctk.CTkFrame(parent, fg_color="transparent")
        row.pack(fill="x", pady=4)
        ctk.CTkSwitch(row, text=label, variable=var, font=theme.FONT_BODY,
                      progress_color=theme.ACCENT, text_color=theme.TEXT
                      ).pack(side="left")

    def _path_row(self, parent, label, var, pick_dir, validate, is_dir):
        ctk.CTkLabel(parent, text=label, font=theme.FONT_BODY,
                     text_color=theme.TEXT_MUTED).pack(anchor="w", pady=(8, 2))
        row = ctk.CTkFrame(parent, fg_color="transparent")
        row.pack(fill="x")

        status = ctk.CTkLabel(row, text="", width=22, font=("Roboto", 16, "bold"))
        status.pack(side="left", padx=(0, 4))

        entry = ctk.CTkEntry(row, textvariable=var, font=theme.FONT_BODY)
        entry.pack(side="left", fill="x", expand=True)

        def refresh(*_):
            if not validate:
                return
            p = var.get().strip()
            ok = os.path.isdir(p) if is_dir else os.path.isfile(p)
            if not p:
                status.configure(text="•", text_color=theme.TEXT_MUTED)
            elif ok:
                status.configure(text="✓", text_color=theme.OK)
            else:
                status.configure(text="✗", text_color=theme.ERR)

        var.trace_add("write", refresh)
        refresh()

        def browse():
            if pick_dir:
                path = filedialog.askdirectory(title=label)
            else:
                path = filedialog.askopenfilename(
                    title=label,
                    filetypes=[("Ejecutables", "*.exe"), ("Todos", "*.*")])
            if path:
                var.set(path)
            self.after(10, self.grab_set)

        ctk.CTkButton(row, text="Examinar", width=100, command=browse,
                      fg_color=theme.BG_CARD, hover_color=theme.BG_CARD_HOVER
                      ).pack(side="left", padx=(8, 0))

    # ================================================================= #
    def _save(self):
        self.config_obj.roms_folder = self.roms_var.get().strip()
        for key, var in self.emu_vars.items():
            self.config_obj.emulators[key] = var.get().strip()
        for key, var in self.arg_vars.items():
            self.config_obj.emulator_args[key] = var.get().strip()
        self.config_obj.color_theme = self.theme_var.get()
        self.config_obj.card_size = self.size_var.get()
        self.config_obj.launch_fullscreen = self.fullscreen_var.get()
        self.config_obj.close_on_launch = self.close_var.get()
        self.config_obj.confirm_launch = self.confirm_var.get()
        self.config_obj.save()
        self.destroy()
        self.on_saved()
