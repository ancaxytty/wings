# Logros Custom — Addon de logros (achievements) profesional

Addon de Minecraft Bedrock para crear un sistema de **logros** con **imágenes** (medallas),
totalmente **editable**, que se abre con un **item especial con textura custom** y usa una
**UI custom de ServerForm** (no el formulario simple de Minecraft).

## Descargar
- **v1.0.0 (actual):** `dist/logros_v1.mcaddon`

Ábrelo con Minecraft (importar) y activa **ambos** packs (BP + RP) en tu mundo.
Activa **Beta APIs / GameTest** del mundo (usa scripts `@minecraft/server`).

## Qué incluye
- **Item especial** `logros:book` (§6Libro de Logros§r) con textura custom y efecto "encantado".
  Se entrega automáticamente al entrar por primera vez. Úsalo (clic derecho / mantener) para abrir el menú.
  También puedes abrirlo escribiendo **`!logros`** en el chat.
- **Menú "Ver Logros"** con una **galería de medallas con imagen**: las desbloqueadas salen a color
  y las bloqueadas en gris con candado. Cada logro tiene su **detalle** (descripción, puntos, fecha, recompensa).
- **Barra de progreso** y **puntos** acumulados por jugador.
- **ServerForm custom**: el `resources/ui/server_form.json` reemplaza el fondo del formulario por
  un panel oscuro profesional (nineslice con bordes de acento), así no es el formulario plano por defecto.
- **Todo editable por admins** (tag `admin`): crear, editar, borrar logros (título, descripción,
  icono/imagen, puntos y comando de recompensa), **otorgar** logros a uno/varios/todos los jugadores,
  **reiniciar progreso** y **restaurar** los logros de ejemplo.
- **12 medallas** con símbolos distintos: Estrella, Pico, Espada, Escudo, Corona, Diamante,
  Trofeo, Corazón, Rayo, Llama, Hoja y Calavera.

## Uso rápido
1. Entra al mundo: recibes el **Libro de Logros** (o usa `/give @s logros:book`).
2. Úsalo para abrir el menú → **Ver Logros** para la galería con imágenes.
3. Para gestionar, ponte el rango admin: `/tag @p add admin` y abre **Administrar**.

## Para mapmakers (command blocks)
Desbloquea/maneja logros desde un command block ejecutándose **como el jugador**:
```
/scriptevent logros:give <id_del_logro>
/scriptevent logros:revoke <id_del_logro>
/scriptevent logros:reset
/scriptevent logros:open
```
El `id` de cada logro se ve en **Administrar → Editar Logros**. Ejemplo con `/execute`:
```
/execute as @a[tag=ganador] run scriptevent logros:give campeon
```

## Logros de ejemplo (editables)
`primeros_pasos`, `minero`, `guerrero`, `defensor`, `realeza`, `joyero`, `campeon`, `amistad`.
Puedes editarlos o borrarlos desde el menú de admin; los datos se guardan con dynamic properties
(persisten al reiniciar el mundo).

## Estructura
- `logros_BP/` — Behavior Pack: `scripts/main.js` (sistema de logros + ServerForms), `items/book.json` (item custom).
- `logros_RP/` — Resource Pack: `ui/server_form.json` (UI custom), `textures/ui/logros/*` (medallas y botones),
  `textures/items/logros_book.png` (item), `texts/` (es/en).
- `_gen_logros_textures.py` — generador procedural de todas las texturas PNG (sin dependencias).

## Re-empaquetar
```bash
cd addon_src
python3 _gen_logros_textures.py
zip -r -X ../dist/logros_v1.mcaddon logros_BP logros_RP -x "*.py"
```
