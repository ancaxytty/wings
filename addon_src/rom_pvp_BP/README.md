# ROOM PvP Zones v0.2.0 — Zonas PvP con paredes automáticas (MCPE/Bedrock)

Crea **zonas de PvP 1v1 / 2v2 / 3v3** donde **no se puede dañar la room**
(no se rompen bloques, no se construye... **solo se pueden poner lanas y telas**).
Las **paredes se construyen solas** cuando entran los jugadores. Todo con la
**Custom Commands API** (`/room:`), una **varita custom**, **formularios** y
**multi-idioma**.

## Descargar / Importar
- Paquete: `dist/rom_pvp_zones_v0.2.0.mcaddon` → ábrelo con Minecraft y activa
  **ambos** packs (BP + RP) en el mundo.
- Requisitos del mundo:
  - **Minecraft Bedrock 1.21.90+**.
  - Activa **Beta APIs** (para Custom Commands; usa `@minecraft/server 2.1.0`).

## Comandos `/room:` (15)
| Comando | Qué hace |
|---|---|
| `/room:wand` | Te da la **Varita Nether** (pos1/pos2). |
| `/room:menu` | Abre el **formulario** principal. |
| `/room:create <nombre> <1v1\|2v2\|3v3>` | Crea la zona con tu selección. |
| `/room:delete <nombre>` | Elimina una zona (y quita sus paredes). |
| `/room:edit <nombre>` | Redefine el área con tu selección actual. |
| `/room:rename <nombre> <nuevo>` | Renombra una zona. |
| `/room:setsize <nombre> <1v1\|2v2\|3v3>` | Cambia el modo. |
| `/room:info [nombre]` | Info de una zona (o lista). |
| `/room:list` | Lista todas las zonas. |
| `/room:tp <nombre>` | Te teletransporta a la zona. |
| `/room:protect <nombre>` | Activa/desactiva la protección. |
| `/room:start <nombre>` | Inicia el combate (construye paredes). |
| `/room:stop <nombre>` | Termina el combate (quita paredes). |
| `/room:language <es\|en\|fr\|pt\|de\|zh>` | Cambia el idioma. |
| `/room:help` | Ayuda. |

> Crear/editar/borrar requiere ser **OP** o tener el tag `room_admin`
> (`/tag @s add room_admin`).

## Varita
- **✦ Varita Nether ✦** (`room:zone_wand`) define el **área PvP**:
  - **Click izquierdo** (romper) = **Pos1**
  - **Click derecho** (interactuar) = **Pos2**

## Paredes automáticas
Cuando dentro de la zona hay **suficientes jugadores** (1v1=2, 2v2=4, 3v3=6),
las **paredes de cristal se construyen solas** alrededor del arena (solo donde
hay aire, sin destruir tu build). Al quedar **1 o 0 jugadores**, las paredes se
**retiran** automáticamente. También puedes forzarlo con `/room:start` y
`/room:stop`.

## Reglas dentro de la zona (anti-grief)
- ❌ **No se rompe** ningún bloque (la room no se puede romper).
- ❌ **No se construye**...
- ✅ ...**solo** se pueden poner **lanas** (`*_wool`) y **telas/alfombras** (`*_carpet`).
- ❌ Las **explosiones** no afectan a la zona.
- Los **OP / `room_admin`** pueden editar libremente.

## Multi-idioma
Mensajes y formularios en **es, en, fr, pt, de, zh**. Cambia con
`/room:language <código>` o desde el menú → Idioma.

## Estructura
- `rom_pvp_BP/` — Behavior Pack: `scripts/main.js`, item `room:zone_wand`.
- `rom_pvp_RP/` — Resource Pack: textura de la varita, iconos de UI, idiomas.
- `addon_src/_gen_rom_textures.py` — generador de texturas PNG.

## Re-empaquetar
```bash
cd addon_src
python3 _gen_rom_textures.py
zip -r -X ../dist/rom_pvp_zones_v0.2.0.mcaddon rom_pvp_BP rom_pvp_RP -x "*.py"
```
