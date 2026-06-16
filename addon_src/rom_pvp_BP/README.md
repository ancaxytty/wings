# ROM PvP Zones — Addon de zonas PvP protegidas (MCPE/Bedrock)

Crea **zonas de PvP 1v1 / 2v2 / 3v3** que **no se pueden dañar** (nadie puede
romper, poner bloques ni explotar dentro), usando la **Custom Commands API**
(`/rom:...`), **varitas custom** y **formularios** con **texturas propias**.

## Descargar / Importar
- Paquete: `dist/rom_pvp_zones_v1.0.0.mcaddon` → ábrelo con Minecraft (importar)
  y activa **ambos** packs (BP + RP) en el mundo.
- Requisitos del mundo:
  - **Minecraft Bedrock 1.21.90+** (`min_engine_version`).
  - Activa la opción **Beta APIs / Crear y editar comandos** (Custom Commands)
    en la configuración del mundo (usa `@minecraft/server 2.1.0`).

## Comandos (Custom Commands API)
| Comando | Qué hace |
|---|---|
| `/rom:wand` | Te entrega las **2 varitas** (Varita Nether + Palo Marcador). |
| `/rom:menu` | Abre el **formulario** principal (crear, listar, borrar, ayuda). |
| `/rom:create <nombre> <1v1\|2v2\|3v3> [paredes]` | Crea la zona con la selección actual. `paredes=true` protege también pd1/pd2. |
| `/rom:delete <nombre>` | Elimina una zona. |
| `/rom:info [nombre]` | Info de una zona (o lista todas) y abre el formulario. |

> Crear/eliminar requiere ser **OP** o tener el tag `rom_admin`
> (`/tag @s add rom_admin`).

## Varitas
- **✦ Varita Nether ✦** (`rom:zone_wand`) → define el **área del arena**:
  - **Click izquierdo** (romper) = **Pos1**
  - **Click derecho** (interactuar) = **Pos2**
- **⚒ Palo Marcador ⚒** (`rom:wall_wand`) → define las **paredes** (opcional):
  - **Click izquierdo** = **PD1**
  - **Click derecho** = **PD2**

Ambas llevan **nombre y lore personalizados**. La Varita Nether tiene brillo
(foil). Las selecciones se guardan por jugador (persisten al reiniciar).

## Cómo crear una zona (rápido)
1. `/rom:wand`
2. Con la **Varita Nether**: izq = Pos1, der = Pos2 (esquinas opuestas).
3. *(opcional)* Con el **Palo Marcador**: izq = pd1, der = pd2.
4. `/rom:create arena1 2v2` *(o `/rom:menu` → Crear zona)*.

## Protección "sin dañar la zona"
Dentro del área (y de las paredes, si las defines) se **cancela**:
romper bloques, poner bloques y daño por **explosiones**. Los jugadores con
tag `rom_admin`/OP pueden editar. Cada zona se puede **activar/desactivar** su
protección desde el menú.

## Estructura
- `rom_pvp_BP/` — Behavior Pack: scripts (`scripts/main.js`), items custom.
- `rom_pvp_RP/` — Resource Pack: texturas de varitas, iconos de formularios, idiomas.
- `addon_src/_gen_rom_textures.py` — generador de todas las texturas PNG (sin dependencias).

## Re-empaquetar
```bash
cd addon_src
python3 _gen_rom_textures.py
zip -r -X ../dist/rom_pvp_zones_v1.0.0.mcaddon rom_pvp_BP rom_pvp_RP -x "*.py"
```
