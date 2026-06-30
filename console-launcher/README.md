# 🎮 Nexus Game Center

Un **lanzador multi-emulador** de escritorio con una interfaz moderna y oscura
inspirada en la PS5 / Nintendo Switch, construido en **Python + CustomTkinter**.

Detecta automáticamente tus juegos de **PS1, PS2 y PSP**, los organiza por
consola, muestra una cuadrícula dinámica de carátulas y lanza el emulador
externo correspondiente (**DuckStation**, **PCSX2**, **PPSSPP**) con un clic.

> ⚠️ Este programa **no incluye** emuladores ni juegos. Debes tener los
> emuladores instalados y usar únicamente copias de seguridad de juegos que
> poseas legalmente.

---

## ✨ Características

- Interfaz fluida y oscura (CustomTkinter) estilo consola moderna.
- **Lanzador** que ejecuta emuladores externos vía `subprocess`.
- **Cuadrícula responsiva** de carátulas que se reajusta al tamaño de la ventana.
- **Escáner automático** de la carpeta `ROMS` que clasifica los juegos por consola.
- Generación de **carátulas placeholder** (degradado + título) cuando no hay imagen.
- Barra lateral con filtros por consola + contador de juegos y buscador en vivo.
- Diálogo de **Ajustes** para configurar rutas (se guardan en `launcher_config.json`).

---

## 📂 Estructura del proyecto

```
console-launcher/
├── main.py                  # Punto de entrada
├── requirements.txt
├── build_exe.py             # Empaqueta a .exe con PyInstaller
├── core/
│   ├── config.py            # Carga/guarda rutas (JSON persistente)
│   ├── scanner.py           # Escanea ROMS y clasifica por consola
│   ├── launcher.py          # Lanza el emulador con subprocess
│   └── covers.py            # Carga o genera carátulas (Pillow)
└── ui/
    ├── theme.py             # Colores y fuentes
    ├── game_card.py         # Tarjeta de juego (carátula + título)
    ├── sidebar.py           # Barra lateral / filtros
    ├── settings_dialog.py   # Ventana de ajustes
    └── app.py               # Ventana principal + cuadrícula
```

---

## 🚀 Instalación y ejecución

```bash
# 1. (Opcional) crea un entorno virtual
python -m venv .venv
# Windows:
.venv\Scripts\activate
# macOS/Linux:
source .venv/bin/activate

# 2. Instala dependencias
pip install -r requirements.txt

# 3. Ejecuta
python main.py
```

La primera vez abre **⚙ Ajustes** y configura:

- **Carpeta de ROMS** (ej. `D:\ROMS`)
- Ruta de **DuckStation** (`duckstation-qt-x64-ReleaseLTCG.exe`)
- Ruta de **PCSX2** (`pcsx2-qt.exe`)
- Ruta de **PPSSPP** (`PPSSPPWindows64.exe`)

---

## 🗂 Cómo organizar tu carpeta ROMS

La forma **más fiable** es usar sub-carpetas con el nombre de la consola
(la extensión `.iso` es ambigua entre PS2 y PSP, por eso conviene separarlas):

```
ROMS/
├── PS1/
│   ├── Crash Bandicoot.cue
│   └── Crash Bandicoot.bin
├── PS2/
│   ├── God of War II.iso
│   └── GTA San Andreas.iso
└── PSP/
    ├── God of War - Ghost of Sparta.iso
    └── Daxter.cso
```

Se aceptan alias de carpeta como `psx`, `playstation`, `playstation2`, etc.

### Carátulas

Para usar tus propias carátulas, coloca una imagen con el **mismo nombre** que
la ROM (o dentro de una carpeta `covers/`):

```
PS2/God of War II.iso
PS2/God of War II.png        ← carátula
# o
PS2/covers/God of War II.jpg
```

Si no hay imagen, el programa genera una carátula con degradado y el título.

---

## 📦 Cómo convertirlo en un `.exe` con PyInstaller

CustomTkinter incluye archivos de datos (temas) que **deben empaquetarse**,
así que no basta con `--onefile` a secas. Usa el script incluido:

```bash
pip install pyinstaller
python build_exe.py
```

O ejecuta el comando manualmente (Windows, una sola línea):

```bash
pyinstaller --noconsole --onefile --name "NexusGameCenter" ^
  --collect-all customtkinter ^
  --collect-all PIL ^
  main.py
```

> En macOS/Linux usa `\` en lugar de `^` para los saltos de línea, o ponlo todo
> en una sola línea.

El ejecutable quedará en la carpeta **`dist/`**.

| Flag | Para qué sirve |
|------|----------------|
| `--noconsole` | Oculta la ventana negra de terminal (app de GUI). |
| `--onefile` | Genera un único `.exe` autocontenido. |
| `--collect-all customtkinter` | Incluye los temas/recursos de CustomTkinter (clave). |
| `--collect-all PIL` | Asegura que Pillow se empaquete completo. |
| `--name` | Nombre del ejecutable resultante. |
| `--icon app.ico` | (Opcional) icono personalizado. |

El archivo `launcher_config.json` y la carpeta `cache/` se crean **junto al
.exe** la primera vez que lo ejecutes, por lo que la configuración persiste.
