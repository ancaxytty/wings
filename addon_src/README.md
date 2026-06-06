# The Search MCPE — Addon de búsquedas con cabezas custom

Addon de Minecraft Bedrock para crear "búsquedas" tipo caza de huevos de Pascua,
con **12 cabezas custom como BLOQUES** (tipo skull 8px), **hologramas** profesionales,
**partículas custom por cabeza** y una **varita** para colocarlas. GUI oscura: **The Search MCPE**.

## Descargar
- **v3 (actual):** `dist/wings_search_v3.mcaddon`
- v2: `dist/wings_search_v2.mcaddon` · v1: `dist/wings_search_v1.mcaddon`

Ábrelo con Minecraft (importar) y activa **ambos** packs (BP + RP).
Activa **Beta APIs / GameTest** del mundo (usa scripts `@minecraft/server`).

## Novedades v3
- **12 cabezas como BLOQUES custom** (`wings:head` con estado `wings:skin` 0–11 y permutaciones):
  Halloween, Navidad, Santa, Frozen, Olaf, Fantasma, Esqueleto, Reno, Muñeco de Nieve,
  Regalo, Zombie y Bruja. Pequeñas tipo skull (8×8×8), con sus texturas y un ligero brillo.
- **Encontrar = ROMPER el bloque** → explosión de **partículas custom del color de cada cabeza**
  (`wings:found` tintada con `variable.color`).
- **Llama de antorcha** (`wings:torch`) sobre las cabezas **no encontradas**.
- **Varita de Búsqueda** con **textura nueva nítida** (32×32):
  - **Agáchate + Varita** → menú principal.
  - **Varita en el aire** → galería de 12 cabezas (con burst de partículas al elegir).
  - **Varita sobre un bloque** → coloca el bloque-cabeza en la búsqueda activa.
- **Hologramas más profesionales** (3 líneas con estilo).
- **Menú principal mejorado**: estadísticas (búsquedas/cabezas/halladas), búsqueda activa,
  y **texturas más pro** (fondo con degradado, doble borde y esquinas decoradas).
- **pack_icon custom** temático de búsquedas (calabaza + lupa).

## Uso rápido
1. Consigue la **Varita de Búsqueda** (`/give @s wings:wand`) o usa una **brújula** para el menú.
2. Crea una búsqueda → se marca activa → elige una cabeza en la galería →
   coloca los bloques-cabeza por el mundo con la varita.
3. **Rompe** las cabezas para encontrarlas (partículas + sonido + recompensa opcional).
4. **Crear / Revisar / Editar / Info / Eliminar / Teletransportar / Reaparecer** desde la GUI.

Los datos se guardan con dynamic properties (persisten al reiniciar el mundo).

## Estructura
- `wings_search_BP/` — Behavior Pack (scripts, bloque `wings:head`, item varita, entidad holograma).
- `wings_search_RP/` — Resource Pack (UI oscura, geometría de bloque, terrain/item textures,
  render por estado, partículas, idiomas).
- `_gen_textures.py` — generador de todas las texturas PNG (sin dependencias).

## Re-empaquetar
```bash
cd addon_src
python3 _gen_textures.py
zip -r -X ../dist/wings_search_v3.mcaddon wings_search_BP wings_search_RP -x "*.py"
```
