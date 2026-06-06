# Wings Search — Addon de búsquedas con cabezas custom

Addon de Minecraft Bedrock que permite crear "búsquedas" tipo caza de huevos de Pascua,
pero con **cabezas custom** que llevan encima un **holograma de 3 líneas**.
La GUI usa el `server_form.json` custom con tema **oscuro** y texturas propias.

## Descargar
El addon empaquetado está en: `dist/wings_search_v1.mcaddon`
Ábrelo con Minecraft (doble clic / importar) y activa **ambos** packs (BP + RP) en tu mundo.
Activa la opción **Beta APIs / GameTest Framework** del mundo (usa scripts `@minecraft/server`).

## Uso
- Sostén una **brújula** (`minecraft:compass`) y úsala → abre el menú oscuro custom.
- **Crear**: nombre, color del holograma (`0-9`, `a-f`), comando de recompensa opcional (usa `@s`),
  y opción de colocar una cabeza en tu posición al momento.
- **Revisar**: lista de búsquedas → gestionar cada una:
  - Añadir cabeza aquí · Info · Editar (nombre/color/recompensa) · Reaparecer cabezas ·
    Teletransportar a una cabeza · Eliminar.
- **Recargar hologramas**: vuelve a generar todas las cabezas/hologramas desde los datos.
- **Encontrar**: golpea o usa (clic derecho) una cabeza → suena, partículas, recompensa y se marca como encontrada.

Los datos se guardan con `world dynamic properties`, así que persisten al reiniciar el mundo.

## Estructura
- `wings_search_BP/` — Behavior Pack (scripts + entidades `wings:head`, `wings:hologram`).
- `wings_search_RP/` — Resource Pack (UI oscura custom, modelos, texturas).
- `_gen_textures.py` — generador de las texturas PNG (sin dependencias).

## Re-empaquetar
```bash
cd addon_src
zip -r -X ../dist/wings_search_v1.mcaddon wings_search_BP wings_search_RP -x "*.py"
```
