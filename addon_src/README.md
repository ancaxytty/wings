# The Search MCPE — Addon de búsquedas con cabezas custom

Addon de Minecraft Bedrock para crear "búsquedas" tipo caza de huevos de Pascua,
pero con **12 cabezas custom temáticas**, **hologramas** de 3 líneas y **partículas custom**.
La GUI usa el `server_form.json` custom con tema **oscuro** y título **The Search MCPE**.

## Descargar
- **v2 (actual):** `dist/wings_search_v2.mcaddon`
- v1: `dist/wings_search_v1.mcaddon`

Ábrelo con Minecraft (importar) y activa **ambos** packs (BP + RP) en tu mundo.
Activa la opción **Beta APIs / GameTest** del mundo (usa scripts `@minecraft/server`).

## Novedades v2
- **12 cabezas custom** con sus imágenes: Halloween, Navidad, Santa, Frozen, Olaf,
  Fantasma, Esqueleto, Reno, Muñeco de Nieve, Regalo, Zombie y Bruja.
  (una entidad `wings:head` con propiedad `wings:skin` + render controller).
- **Varita de Búsqueda** (`wings:wand`) para elegir y colocar cabezas:
  - **Agáchate + usar** → abre el menú **The Search MCPE**.
  - **Usar en el aire** → galería de cabezas (eliges la cabeza de la varita).
  - **Usar sobre un bloque** → coloca la cabeza seleccionada en la búsqueda activa.
- **Partículas custom 3D** (`wings:found`) cuando encuentras una cabeza.
- **Llama de antorcha** (`wings:torch`) flotando sobre las cabezas **no encontradas**.
- Título del formulario principal cambiado a **The Search MCPE**.

## Uso
- Consigue la **Varita de Búsqueda** (creativo / `/give @s wings:wand`) o usa una **brújula** para el menú.
- Crea una búsqueda → se marca como activa → elige una cabeza en la galería →
  coloca cabezas con la varita por el mundo.
- **Crear / Revisar / Editar / Info / Eliminar / Teletransportar / Reaparecer** desde la GUI.
- **Golpea o usa** una cabeza para encontrarla (sonido + partículas 3D + recompensa opcional).
- Los datos se guardan con dynamic properties (persisten al reiniciar el mundo).

## Estructura
- `wings_search_BP/` — Behavior Pack (scripts, entidades, item varita).
- `wings_search_RP/` — Resource Pack (UI oscura, modelos, render controller, texturas, partículas, idiomas).
- `_gen_textures.py` — generador de todas las texturas PNG (sin dependencias).

## Re-empaquetar
```bash
cd addon_src
python3 _gen_textures.py
zip -r -X ../dist/wings_search_v2.mcaddon wings_search_BP wings_search_RP -x "*.py"
```
