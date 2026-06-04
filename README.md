# WorldEdit MCPE — `worldedit_mcpe_v0.1.mcaddon`

Un addon de **WorldEdit** para **Minecraft Bedrock / Pocket Edition** (PE), hecho con la
Script API (`@minecraft/server` + `@minecraft/server-ui`). Incluye una **varita**, muchos
**comandos de chat** y **formularios (menús)** para construir rápido.

> Archivo listo para importar: **`worldedit_mcpe_v0.1.mcaddon`** (en la raíz del repo).

---

## Instalación

1. Descarga **`worldedit_mcpe_v0.1.mcaddon`**.
2. Ábrelo con Minecraft (o impórtalo desde *Configuración → Almacenamiento → Importar*).
3. Crea/edita un mundo y activa el paquete de comportamiento **WorldEdit MCPE**.
4. Recomendado: activa los **Experimentos** del mundo. Para que funcionen los
   comandos de chat con `;` puede que necesites el experimento **"Beta APIs"**
   (depende de tu versión). Si no, usa el **menú** o `/scriptevent` (ver abajo).

---

## Activación

Dentro del mundo, ejecuta en el chat:

```
/tag @p worldedit
```

Esto:
- Muestra en consola: `[WorldEdit] addon activado correctamente para <jugador>`.
- Te entrega el **kit de construcción** automáticamente.
- Habilita la **varita** y todos los **comandos**.

Para desactivar: `/tag @p remove worldedit`.

---

## Cómo dar comandos (3 formas)

Hay tres maneras de usar el addon; elige la que funcione en tu versión:

1. **Chat con `;`** — escribe `;set stone`, `;kit`, etc. (necesita que tu versión
   permita leer el chat por script; si no funciona, usa las otras dos formas).
2. **Menú con formularios** — escribe `;menu`, **o agáchate y usa la varita**
   (hacha) en el aire. Funciona siempre.
3. **`/scriptevent`** — escribe `/scriptevent we:<comando> <args>`. Es estable en
   todas las versiones. Ejemplos:
   ```
   /scriptevent we:kit
   /scriptevent we:set stone
   /scriptevent we:sphere glowstone 6
   /scriptevent we:replace dirt grass_block
   ```

---

## La varita (hacha de madera)

La varita es el **hacha de madera** (`minecraft:wooden_axe`). Funciona igual en PC y en celular:

| Acción | Resultado |
|--------|-----------|
| Click derecho / **tocar** un bloque (o quitar la corteza a un tronco) | **POS1** |
| Romper / **intentar romper** un bloque | **POS2** |

La varita **no** modifica el mundo (no quita corteza ni rompe): solo marca posiciones.

---

## Comandos (prefijo `;`)

| Comando | Descripción |
|---------|-------------|
| `;menu` | Abre el **menú** con formularios |
| `;help` | Lista de comandos |
| `;kit` | Entrega el kit de construcción |
| `;wand` | Entrega la varita (hacha) |
| `;pos1` / `;pos2` | Marca POS1 / POS2 en tu posición |
| `;set <bloque>` | Rellena la selección |
| `;walls <bloque>` | Construye las paredes |
| `;outline <bloque>` | Contorno (las 6 caras) |
| `;replace <de> <a>` | Reemplaza un bloque por otro |
| `;clear` | Vacía la selección (aire) |
| `;sphere <bloque> <radio> [hollow]` | Esfera (centrada en ti) |
| `;cyl <bloque> <radio> [altura] [hollow]` | Cilindro |
| `;pyramid <bloque> <tamaño>` | Pirámide |
| `;copy` / `;paste` | Copiar / pegar la selección |
| `;undo` | Deshacer la última operación |
| `;up <n>` | Súbete `n` bloques (pone vidrio bajo tus pies) |
| `;size` | Información de la selección |

**Ejemplos:**

```
;set stone
;walls glass
;replace dirt grass_block
;sphere glowstone 6
;cyl quartz_block 5 10 hollow
;pyramid sandstone 8
```

Los nombres de bloque aceptan con o sin `minecraft:` (ej: `stone` o `minecraft:stone`).

---

## Límites y notas

- Máximo **32 768** bloques por operación (para evitar lag/crasheos).
- `;undo` guarda las últimas **8** operaciones por jugador.
- Esfera/cilindro/pirámide se construyen **centradas en tu posición**.
- Copiar/pegar usan la **esquina mínima** de la selección como origen; al pegar, esa
  esquina queda en tu posición.

---

## Estructura del proyecto

```
WorldEditBP/
├── manifest.json          # Manifiesto del paquete de comportamiento
├── pack_icon.png          # Ícono del paquete
└── scripts/
    └── main.js            # Toda la lógica del addon
build_tools/
├── make_icon.py           # Genera el pack_icon.png
└── build_mcaddon.py       # Empaqueta el .mcaddon
worldedit_mcpe_v0.1.mcaddon # Addon listo para importar
```

### Reconstruir el `.mcaddon`

```bash
python3 build_tools/build_mcaddon.py
```

---

## Solución de problemas

- **El paquete aparece como "incompatible" o los scripts no cargan.**
  Tu versión de Minecraft puede usar otra versión de los módulos de script. Edita
  `WorldEditBP/manifest.json`, en `dependencies`, y cambia las versiones de
  `@minecraft/server` y `@minecraft/server-ui` por las de tu juego
  (ver la [tabla de versiones de módulos](https://learn.microsoft.com/en-us/minecraft/creator/documents/scriptversioning)),
  luego vuelve a empaquetar con `python3 build_tools/build_mcaddon.py`.
- **Los comandos con `;` no hacen nada.** Tu versión no permite leer el chat por
  script. Usa el **menú** (`;menu` o agáchate + varita) o `/scriptevent we:<cmd>`.
- **La varita no marca posiciones.** Asegúrate de tener el tag: `/tag @p worldedit`,
  y de estar usando el **hacha de madera**.
- **"Selección demasiado grande".** El límite es 32 768 bloques por operación.

---

Hecho con la Script API de Minecraft Bedrock. Versiones de módulos por defecto:
`@minecraft/server 1.13.0`, `@minecraft/server-ui 1.3.0`, `min_engine_version 1.21.0`.
El script es **defensivo**: si un evento no existe en tu versión, usa alternativas
automáticamente (no se rompe).
