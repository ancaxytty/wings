# The Search MCPE — Addon de búsquedas con cabezas custom

Addon de Minecraft Bedrock para crear "búsquedas" tipo caza de huevos, con **12 cabezas
custom como BLOQUES**, **hologramas**, **partículas custom por cabeza**, **title/subtitle**
y una **interfaz oscura profesional estilo CubeCraft**.

## Descargar
- **v5 (actual):** `dist/wings_search_v5.mcaddon`
- v4 · v3 · v2 · v1

Ábrelo con Minecraft (importar) y activa **ambos** packs (BP + RP).
Activa **Beta APIs / GameTest** del mundo (usa scripts `@minecraft/server`).

## Novedades v5
- **Aviso de proximidad**: al acercarte mucho a una cabeza (≈3 bloques) aparece en la
  barra de acción §e❖ Interactúa para recoger {Cabeza} (x/total)§r.
- **Título con conteo**: al encontrar muestra "¡Encontraste {found} de {total} cabezas!".
- **Title y subtitle EDITABLES por búsqueda** (menú → Gestionar → §3Editar title/subtitle§r),
  con placeholders: `{found} {total} {head} {search} {player}` y colores `§{hc}` (cabeza) y `§{sc}` (búsqueda).
  Incluye vista previa al guardar.
- **Cabezas rediseñadas**: caras pixel-art más detalladas y **bloque sombreado por cara**
  (techo más claro, laterales y parte trasera más oscuros) para dar volumen real.

## Novedades v4
- **Encontrar = INTERACTUAR** (clic derecho), como abrir un cofre. Ya **no hay que romper** el bloque.
- **Varita eliminada** (daba problemas). Ahora **colocas tú mismo** el bloque-cabeza:
  el bloque que pongas toma automáticamente la **cabeza seleccionada** en el menú y se
  añade a la búsqueda activa.
- **Sistema de TITLE y SUBTITLE**: al encontrar una cabeza y al completar una búsqueda.
- **Texturas mucho más profesionales (estilo tiles de CubeCraft)**: generadas por código con
  degradados, bisel, brillo (gloss), bordes redondeados, placa y biseles de color por tema.
  Incluye el `pack_icon` (calabaza + lupa) y los tiles de cada cabeza y acción.
- **Menú principal mejorado**: estadísticas, búsqueda activa y cabeza seleccionada.
- Partículas custom **del color de cada cabeza** (`wings:found`) + **llama de antorcha** sobre las no halladas.

> Nota: las texturas se generan de forma procedural (sin acceso a generadores de IA tipo
> Nano Banana desde el entorno de build). Si generas PNGs propios con IA y los colocas en
> `wings_search_RP/textures/...`, sustituyen a las generadas sin tocar el código.

## Uso rápido
1. Abre el menú con una **brújula** (`/give @s compass`).
2. En **Cabezas** elige una de las 12 (recibes 1 bloque-cabeza).
3. **Coloca** el bloque donde quieras: toma esa cabeza y se añade a la búsqueda activa.
4. Para encontrarla, **interactúa** (clic derecho) con la cabeza → título + partículas + recompensa.
5. **Crear / Revisar / Editar / Info / Eliminar / Teletransportar / Reaparecer** desde la GUI.

Los datos se guardan con dynamic properties (persisten al reiniciar el mundo).

## Estructura
- `wings_search_BP/` — Behavior Pack (scripts, bloque `wings:head`, entidad holograma).
- `wings_search_RP/` — Resource Pack (UI oscura pro, geometría de bloque, terrain textures,
  partículas, idiomas).
- `_gen_textures.py` — generador profesional de todas las texturas PNG (sin dependencias).

## Re-empaquetar
```bash
cd addon_src
python3 _gen_textures.py
zip -r -X ../dist/wings_search_v4.mcaddon wings_search_BP wings_search_RP -x "*.py"
```
