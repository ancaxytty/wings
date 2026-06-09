# Floating Text Ultimate — v6.0.0 (Scripts edition)

Fusiona los **tres** add-ons de texto flotante en **uno solo** y reemplaza toda la lógica de
`.mcfunction` por la **Script API de Bedrock** (`@minecraft/server` + `@minecraft/server-ui`):

- `Floating-Text semplice.mcaddon` (solo texto)
- `Floating-Text item.mcaddon` (texto + huevo)
- `Floating-Text_Update_4.0.0/5.0.0.mcaddon` (menú, partículas, etc.)

> **Crédito:** la base/concepto del add-on original es de **Death_Aruban**. Su licencia permite
> modificarlo **solo para uso personal**; no lo redistribuyas públicamente sin permiso ni quites
> los créditos.

## Qué incluye

- **Menú por scripts** (formularios nativos), sin items de menú ni funciones.
  - Se abre con la **Varita de Hologramas** (`ft:wand`, click derecho) o con el chat: **`!ft`**.
  - Conseguir la varita: **`!ftwand`** (también se entrega al entrar por primera vez).
- **Crear Texto flotante:** texto multilínea (`|` o `\n`), 14 colores, partícula, velocidad y flotar.
- **Crear Item flotante:** 20 items comunes + **ID personalizado**; flota y gira solo y se
  **repone automáticamente** si desaparece (registro persistente en world dynamic property).
  Opcionalmente con etiqueta de texto encima.
- **Editar / Borrar:** mira directamente el holograma y abre el menú.
- **Lista / Teletransporte:** lista todos los textos y te lleva a ellos.
- **Borrar TODO:** elimina textos e items flotantes.
- **12 partículas custom** (arcoíris, fuego, hielo, oro, amor, ender, tóxico, galaxia, esmeralda,
  océano, lava, nieve) generadas con `_gen_particles.py`, todas invocables vía `spawnParticle`.
- **Velocidad de órbita** de las partículas: `0 = quieta`, `1-4 = giro`, `5 = reversa`.
- **Animación flotar ↑↓** (bob) por holograma.
- **Español incluido** (es_ES / es_MX).

## Compatibilidad / versiones

- Depende de `@minecraft/server` **1.11.0** y `@minecraft/server-ui` **1.2.0** (APIs **estables**,
  sin "Beta APIs"). `min_engine_version` = **1.21.0**.
- Si tu Minecraft es más nuevo y el pack no carga, sube esas dos versiones en
  `FT_UltimateBP/manifest.json` (p. ej. a `2.0.0` / `2.0.0`) y reempaqueta.
- **No requiere** activar "Beta APIs / GameTest Framework".

## Cómo usar

1. Importa `dist/Floating-Text_Ultimate_v6.0.0.mcaddon` y activa **ambos** packs (BP + RP) en el mundo.
2. Entra al mundo: recibirás la **Varita**. Click derecho (o `!ft`) abre el menú.
3. ¡Crea, edita y administra hologramas!

## Build

```bash
cd ft_ultimate
python3 _gen_particles.py     # regenera las 12 partículas custom
# luego se zipean FT_UltimateBP y FT_UltimateRP a .mcpack y ambos a .mcaddon
```

## Nota técnica

- Los textos usan la entidad invisible `da:floating_text` (escala 0, sin gravedad, nametag siempre
  visible); el script controla nametag, partículas y posición.
- Como el nametag siempre mira a la cámara, la "velocidad" controla la **órbita de las partículas**
  alrededor del texto (no la rotación del texto, que es invisible).
- Los items flotantes usan entidades `minecraft:item` congeladas; al ser items vanilla **podrían
  recogerse** si te metes encima — por eso se colocan en alto. Se reponen solas si despawnean.
