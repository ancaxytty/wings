# The Search MCPE — Addon de búsquedas con cabezas custom

Addon de Minecraft Bedrock para crear "búsquedas" tipo caza de huevos, con **12 cabezas
custom como BLOQUES**, **hologramas**, **partículas custom por cabeza**, **title/subtitle**
y una **interfaz oscura profesional estilo CubeCraft**.

## Descargar
- **v7.2.1 (actual):** `dist/wings_search_v7.2.1.mcaddon`
- v7.1.1 · v7.1.0 · v7 · v6 · v5 · v4 · v3 · v2 · v1

Ábrelo con Minecraft (importar) y activa **ambos** packs (BP + RP).
Activa **Beta APIs / GameTest** del mundo (usa scripts `@minecraft/server`).

## Novedades v7.2.1
- **Partículas flotantes sobre las cabezas:** cada cabeza sin encontrar emite
  partículas del color de la cabeza por encima, para que se vean de lejos.
- **Romper = encontrar (y la cabeza NO se rompe):** ahora puedes hallar una cabeza
  con **clic derecho** (interactuar) o **rompiéndola** (clic izquierdo). El bloque
  no desaparece, solo cuenta como encontrada. Un **admin agachado (shift) + romper**
  sí retira la cabeza de verdad (limpieza).
- **3 animaciones 3D al encontrar una cabeza** (partículas volumétricas custom):
  - 🎃 **Dulces** — explosión de caramelos multicolor + candy corn.
  - 🌋 **Volcán** — erupción por oleadas: lava, brasas, rocas y columna de humo.
  - 🎅 **Santa** — regalos y gorros que estallan, campanas y nevada.
  Se elige por cabeza en **Cabezas** (botón Animación 3D) o en **Editar cabezas**.
  Por defecto se asigna según el tema de la cabeza (invierno→Santa, guerra→Volcán,
  resto→Dulces).

## Novedades v7.1.0
- **ARREGLO DEFINITIVO de visibilidad:** las cabezas vuelven a ser **BLOQUES**
  (estilo cabeza de Minecraft, 8px) con texturas custom. Los bloques **siempre se ven**
  (el problema era la entidad de geometría custom, que no renderizaba en algunos clientes).
- **Las cabezas NO desaparecen** al encontrarlas: quedan colocadas; solo cambia su holograma
  a §a✔ Encontrada§r. Se quitaron las **partículas ambientales** (ya no flota nada);
  las partículas solo salen al encontrar.
- **Botón RESET** (admin) en Gestionar: vuelve a marcar todas como no encontradas para
  poder buscarlas otra vez.
- **Sistema de rango (tag admin):** gestionar/colocar requiere el tag §eadmin§r
  (§f/tag @p add admin§r). Encontrar es para todos. Hay **mensajes en consola** (content log)
  al cargar, crear, resetear, eliminar y cuando alguien sin permiso intenta abrir el menú.
- **Tamaños** Pequeña/Normal/Grande/Gigante (estado de bloque + transformation) y
  **12 partículas custom** seleccionables por cabeza. Menú principal pulido.

## Novedades v7
- **ARREGLADO: las cabezas ahora SE VEN.** En la v6 la geometría con UV por cara las dejaba
  invisibles (solo partículas). Volví a una geometría **box-uv 64px** robusta + textura de
  net completo con sombreado → la cabeza se ve desde todos los ángulos.
- **Botón "Interactuar" estilo NPC** (`minecraft:interact`) + sonido al apuntarla; al estar
  cerca también sale el aviso en la barra de acción. Encontrar = pulsar Interactuar (o golpear).
- **Tamaños de cabeza**: §fPequeña · Normal · Grande · Gigante§r (se eligen en la galería y
  por cabeza en la edición; usan `minecraft:scale` por component group).
- **12 partículas custom**: Destello, Corazones, Estrellas, Nieve, Fuego, Magia, Confeti,
  Humo, Ender, Notas, Burbujas y Brillos — elegibles por cabeza.
- **Menú principal rediseñado** (cabecera, separadores y estadísticas más claras).
- Edición por cabeza ampliada: skin, **tamaño**, **partícula**, nombre y color.

## Novedades v6
- **Botón "Interactuar" estilo NPC**: las cabezas ahora son **entidades interactivas**
  (`minecraft:interact`), así aparece el botón nativo §e[Interactuar]§r al acercarte/apuntar,
  igual que con un NPC. Encontrar = pulsar Interactuar.
- **+4 cabezas nuevas** (total **16**): §2Master Chief§r (Halo), §cGod of War§r,
  §4Gears of War§r y §eBob Esponja§r.
- **Texturas de cabezas mejoradas (HD 128px)**: layout por caras, escala x2 con sombreado
  y contorno (AO), techo iluminado y caras visibles desde todos los ángulos.
- **Sistema de edición POR CABEZA** (Revisar → Gestionar → §5Editar cabezas§r): cambiar
  el §ftipo (skin)§r, poner un §fnombre personalizado§r y elegir el §fcolor de partícula§r (HEX),
  o eliminar esa cabeza.
- Sigue: title/subtitle editables, aviso de proximidad, hologramas y partículas por color.

> Las cabezas se colocan poniendo el bloque-cabeza tú mismo; al colocarlo se convierte
> en la entidad interactiva con la cabeza seleccionada y se registra en la búsqueda activa.

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
