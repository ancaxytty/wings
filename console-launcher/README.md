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
- **Tarjetas animadas**: elevación suave, borde de acento y botón ▶ Jugar al pasar el ratón.
- **Lanzador** que ejecuta emuladores externos vía `subprocess`.
- **Cuadrícula responsiva** de carátulas que se reajusta al tamaño de la ventana.
- **Escáner automático** de la carpeta `ROMS` que clasifica los juegos por consola.
- Generación de **carátulas placeholder** (degradado + título) cuando no hay imagen.
- Barra lateral con filtros por consola + contador de juegos y buscador en vivo.
- **Ajustes con pestañas** (General · Emuladores · Apariencia):
  - Validación de rutas en vivo (✓/✗) de cada emulador.
  - 7 **temas de color** seleccionables con muestras.
  - **Tamaño de carátulas** (Pequeña / Mediana / Grande) y modo de apariencia.
  - Lanzar en **pantalla completa**, **minimizar al jugar** y **confirmar antes de lanzar**.
  - Argumentos de línea de comandos extra por emulador (avanzado).
- Icono personalizado e instalador `.bat` a prueba de fallos para generar el `.exe`.

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

### Opción A — Windows, sin tocar la terminal (recomendado)
1. **Descomprime** el `.zip` (clic derecho → *Extraer todo*). ⚠️ No ejecutes nada desde dentro del zip.
2. Entra en la carpeta `console-launcher` extraída.
3. Para **probar la app**: doble clic en **`RUN.bat`**.
4. Para **generar el `.exe`**: doble clic en **`build_exe.bat`** → el ejecutable queda en `dist\NexusGameCenter.exe`.

> Necesitas [Python 3.10+](https://www.python.org/downloads/) instalado con la
> casilla **"Add python.exe to PATH"** marcada. Los scripts detectan Python
> automáticamente, crean el entorno, instalan todo y registran cualquier error
> en `build_log.txt`.

### Opción B — Manual (cualquier sistema)
```bash
python -m venv .venv
# Windows:  .venv\Scripts\activate
# macOS/Linux:  source .venv/bin/activate
pip install -r requirements.txt
python main.py
```

La primera vez:

1. Deja los emuladores **portables** dentro de la carpeta `emulators/`
   (`emulators/duckstation`, `emulators/pcsx2`, `emulators/ppsspp`) — o ejecuta
   **`setup_emulators.bat`**, que crea las carpetas y abre las descargas oficiales.
   La app los **detecta automáticamente**, no hace falta configurar rutas.
2. Abre **⚙ Ajustes** y elige tu **carpeta de ROMS** (ej. `D:\ROMS`).

> Solo necesitas escribir una ruta de emulador a mano si quieres forzar un
> `.exe` concreto; en la pestaña **Emuladores** verás «Auto ✓» cuando lo detecta.

---

## 🎮 Sobre los emuladores (importante)

Una ROM es solo los datos del juego: **no puede ejecutarse sola**, necesita un
emulador que imite el hardware de la consola. Por eso la app **no incluye** los
emuladores (son programas grandes de terceros), pero:

- Los **detecta automáticamente** si los dejas en la carpeta `emulators/`,
  si están en el `PATH` o instalados en rutas comunes.
- Así, una vez colocados, **juegas sin configurar nada**.

> Si generas el `.exe`, mantén la carpeta `emulators/` (y tu `ROMS/`) **junto a**
> `NexusGameCenter.exe`.

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

La forma más fácil en Windows es hacer **doble clic en `build_exe.bat`** (ver
arriba). Si prefieres hacerlo a mano:

```bash
pip install pyinstaller
python build_exe.py
```

O el comando completo (Windows, una sola línea):

```bash
pyinstaller --noconsole --onefile --name "NexusGameCenter" --icon app.ico --add-data "app.ico;." --collect-all customtkinter --collect-all PIL main.py
```

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
