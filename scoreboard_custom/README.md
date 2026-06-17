# Scoreboard Custom v0.1 — Minecraft Bedrock / MCPE

Addon profesional de **scoreboard personalizable** para Minecraft Bedrock (PE/Windows/Consola).
Incluye **Resource Pack con iconos/imágenes (glyphs)**, un **menú visual para editarlo** y una
**API de comandos `/cs:`**. Trae **6 plantillas** temáticas listas para usar.

> **Archivo para importar:** `dist/ScoreboardCustomV0.1.mcaddon`

---

## Requisitos
- **Minecraft Bedrock 1.21.90 o superior** (usa la API estable de *Custom Commands* y `@minecraft/server 2.0.0`).
- Al crear/editar el mundo activa:
  - **Behavior Pack** `Scoreboard Custom BP` y **Resource Pack** `Scoreboard Custom RP` (los dos).
  - La opción **"Beta APIs"** del mundo si tu versión lo pide para scripting.

## Instalación
1. Abre `ScoreboardCustomV0.1.mcaddon` con Minecraft (se importan los dos packs a la vez).
2. En el mundo, activa **ambos** packs (BP y RP).
3. Entra al mundo y usa `/cs:menu` o una **brújula** (`/give @s compass`) para abrir el editor.

---

## Plantillas incluidas
| Clave | Tema | Icono |
|-------|------|-------|
| `volcan`  | 🌋 Volcán (magma, oro, bajas) | volcán/fuego |
| `aire`    | Aire (cielo, velocidad)       | aire/rayo |
| `agua`    | Agua (profundidad, perlas)    | gota/gema |
| `sombra`  | Sombra (almas, poder)         | sombra/calavera |
| `luz`     | Luz (aura, brillo, vida)      | sol/estrella |
| `zombies` | Zombies (oleadas, bajas)      | zombie/espada |

Aplica una con `/cs:create volcan` (o desde el menú → **Plantillas**).

---

## API de comandos `/cs:`
Todos los comandos de administración requieren **permiso de operador** (o el tag `csadmin`).

| Comando | Descripción |
|---------|-------------|
| `/cs:menu` · `/cs:edit` | Abre el menú visual del editor |
| `/cs:create <plantilla> [titulo]` | Crea el scoreboard desde una plantilla |
| `/cs:delete` | Apaga y oculta el scoreboard |
| `/cs:toggle` | Enciende / apaga |
| `/cs:reload` | Recarga / redibuja |
| `/cs:reset` | Borra título y todas las líneas |
| `/cs:info` | Muestra la configuración actual (cualquiera) |
| `/cs:title <texto>` | Cambia el título |
| `/cs:set <línea> <texto>` | Define el texto de una línea (1 = arriba) |
| `/cs:image <línea> <icono>` | Pone un icono/imagen a una línea |
| `/cs:addline <texto> [icono]` | Añade una línea al final |
| `/cs:removeline <línea>` | Elimina una línea |

> **Sin barra (chat fallback):** si tu versión no soporta comandos custom, escribe lo mismo en el
> chat sin la barra, p. ej. `cs:create volcan` o `cs:set 2 §eMonedas §8» §f50`.

### Iconos disponibles (`<icono>`)
`none, volcano, fire, air, water, shadow, light, zombie, heart, star, coin, diamond, sword, skull, clock, crown, leaf, head, trophy, shield, bolt, gem, arrow, dot`

También puedes **incrustar iconos dentro del texto** usando `{nombre}`, por ejemplo:
`/cs:set 1 {fire} §cKills §8» §f10`

### Variables dinámicas (placeholders)
Se actualizan solas cada segundo. Como el sidebar de Bedrock es **global** (igual para todos),
estas variables son de servidor/mundo:

| Token | Valor |
|-------|-------|
| `{online}` | Jugadores conectados |
| `{day}` | Día del mundo |
| `{time}` | Hora real (HH:MM) |
| `{date}` | Fecha real (DD/MM/AAAA) |

---

## Menú visual
`/cs:menu` (o brújula) abre el editor con botones:
- **Encender/Apagar** el scoreboard.
- **Plantillas** (las 6 con su icono).
- **Editar título** (texto + icono).
- **Editar líneas** (editar/borrar cada línea, cambiar su icono).
- **Añadir línea**.
- **Ver info**, **Recargar** y **Reset total**.

---

## Nota técnica (limitación de Bedrock)
El *sidebar* nativo de Bedrock **siempre muestra el número de score a la derecha** de cada línea;
no existe API para ocultarlo. Este addon ordena las líneas con scores descendentes para que se vean
en orden. Es el comportamiento estándar de todos los scoreboards de Bedrock.

Las "imágenes" del scoreboard se logran con **glyphs** del Resource Pack
(`font/glyph_E1.png`, rango Unicode `U+E100+`), la técnica oficial para iconos en texto.

---

## Estructura del proyecto
```
scoreboard_custom/
├── ScoreboardCustom_BP/         Behavior Pack (scripts + manifest)
│   └── scripts/main.js          Motor, plantillas, menú y comandos /cs:
├── ScoreboardCustom_RP/         Resource Pack
│   ├── font/glyph_E1.png        Hoja de iconos (glyphs)
│   └── textures/custom_ui/      Iconos del menú y de plantillas
├── _gen_assets.py               Generador de PNG (sin dependencias)
├── build.sh                     Regenera assets y empaqueta el .mcaddon
└── dist/ScoreboardCustomV0.1.mcaddon
```

## Re-empaquetar
```bash
cd scoreboard_custom
./build.sh
```
