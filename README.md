# WorldEdit MCPE — `worldedit_mcpe_v0.2.mcaddon`

Un addon de **WorldEdit** para **Minecraft Bedrock / Pocket Edition** (PE), hecho con la
Script API (`@minecraft/server` + `@minecraft/server-ui`). Sin comandos de chat: todo se
maneja con un **item de menú**, la **varita**, **formularios** y `/scriptevent`.

> Archivo listo para importar: **`worldedit_mcpe_v0.2.mcaddon`** (en la raíz del repo).

---

## Novedades v0.2

- 🧭 **Item especial de menú (brújula):** al **usarla** abre el menú (ejecuta
  internamente `we:menu`). También: **agáchate + usa la varita**.
- 🟩 **Caja de partículas 3D** con patrón punteado `- - - -` que marca la selección.
  Esquina **POS1 verde**, esquina **POS2 naranja**. Se puede mostrar/ocultar.
- 📊 **Barra de acción (actionbar)** con el progreso **0% → 100%** al rellenar
  (operaciones grandes se procesan por partes para no trabar el juego).
- 🧱 **Nuevas herramientas:** **Stack** (multiplica una copia N veces), **Rotate**
  (90/180/270°), **Move** (mover la selección) y **Expand/Contract** (ampliar/reducir
  la selección).
- ❌ **Quitados los comandos de chat `;`** (no funcionan en el juego). Ahora se usa el
  menú o `/scriptevent`.

---

## Instalación

1. Descarga **`worldedit_mcpe_v0.2.mcaddon`**.
2. Ábrelo con Minecraft (o impórtalo desde *Configuración → Almacenamiento → Importar*).
3. Crea/edita un mundo y activa el paquete de comportamiento **WorldEdit MCPE**.
4. Activa los **Experimentos** del mundo (la **API de Beta/GameTest**), porque el addon
   usa scripts.

---

## Activación

Dentro del mundo, ejecuta en el chat:

```
/tag @p worldedit
```

Esto:
- Muestra en consola: `[WorldEdit] addon activado correctamente para <jugador>`.
- Te entrega el **kit** (incluye la **varita** = hacha, y el **item de menú** = brújula).
- Habilita todas las herramientas.

Para desactivar: `/tag @p remove worldedit`.

---

## Cómo usarlo (sin comandos de chat)

1. **Item de menú (brújula):** tenla en la mano y **úsala** (click derecho / mantener
   pulsado en móvil) para abrir el menú.
2. **Varita (hacha de madera):**
   | Acción | Resultado |
   |--------|-----------|
   | Tocar / click derecho un bloque (o quitar corteza a un tronco) | **POS1** (verde) |
   | Romper / intentar romper un bloque | **POS2** (naranja) |
   | **Agacharse + usar** la varita | Abre el **menú** |
   La varita **no** modifica el mundo: solo selecciona.
3. **`/scriptevent`** (estable en todas las versiones):
   ```
   /scriptevent we:menu
   /scriptevent we:set stone
   /scriptevent we:stack 3
   ```

---

## Menú (formularios)

El menú incluye: Kit · Item de menú · Varita · Set · Replace · Walls · Outline ·
Sphere · Cylinder · Pyramid · Clear · Copy · Paste · **Stack** · **Rotate** · **Move** ·
**Expand** · **Contract** · Undo · Mostrar/Ocultar caja · Info · Ayuda.

---

## Comandos `/scriptevent we:<cmd> <args>`

| Comando | Descripción |
|---------|-------------|
| `we:menu` | Abre el menú |
| `we:help` | Ayuda |
| `we:kit` | Entrega el kit |
| `we:item` | Entrega el item de menú (brújula) |
| `we:wand` | Entrega la varita (hacha) |
| `we:pos1` / `we:pos2` | Marca POS1 / POS2 en tu posición |
| `we:set <bloque>` | Rellena la selección |
| `we:walls <bloque>` | Paredes |
| `we:outline <bloque>` | Contorno (6 caras) |
| `we:replace <de> <a>` | Reemplaza |
| `we:clear` | Vacía (aire) |
| `we:sphere <bloque> <radio> [h]` | Esfera (centrada en ti) |
| `we:cyl <bloque> <radio> [altura] [h]` | Cilindro |
| `we:pyramid <bloque> <tamaño>` | Pirámide |
| `we:copy` / `we:paste` | Copiar / pegar |
| `we:stack <n> [dir]` | Multiplica la copia N veces en una dirección |
| `we:rotate <90\|180\|270>` | Rota la copia (eje Y) |
| `we:move <n> [dir]` | Mueve la selección |
| `we:expand <n> [dir]` | Expande la selección |
| `we:contract <n> [dir]` | Contrae la selección |
| `we:undo` | Deshacer |
| `we:up <n>` | Súbete n bloques |
| `we:box` | Mostrar/ocultar la caja de partículas |
| `we:size` | Info de la selección |

`dir` = `north` / `south` / `east` / `west` / `up` / `down` (si lo omites, usa **hacia
dónde miras**). Los bloques aceptan con o sin `minecraft:` (ej: `stone`).

**Ejemplos:**

```
/scriptevent we:set glass
/scriptevent we:replace dirt grass_block
/scriptevent we:sphere glowstone 6
/scriptevent we:stack 4 up
/scriptevent we:rotate 90
/scriptevent we:move 5
/scriptevent we:expand 10 up
```

### Stack (ejemplo pedido)
Haces **Copy** de una construcción y luego **Stack 2**: se coloca la misma construcción
**2 veces más** en línea (en la dirección elegida o hacia donde miras), continuando la obra.

---

## Límites y notas

- Máximo **64 000** bloques por operación.
- Las operaciones grandes se procesan **por partes** (≈1024 bloques/tick) mostrando el
  progreso en la actionbar; por eso no se traba el juego.
- `we:undo` guarda las últimas **8** operaciones por jugador.
- Esfera/cilindro/pirámide se construyen **centradas en tu posición**.
- La caja de partículas se oculta automáticamente si estás a más de ~110 bloques.

---

## Estructura del proyecto

```
WorldEditBP/
├── manifest.json          # Manifiesto (v0.2)
├── pack_icon.png          # Ícono del paquete
└── scripts/
    └── main.js            # Toda la lógica del addon
build_tools/
├── make_icon.py           # Genera el pack_icon.png
└── build_mcaddon.py       # Empaqueta el .mcaddon
worldedit_mcpe_v0.2.mcaddon # Addon listo para importar
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
- **El item de menú no abre nada.** Asegúrate de tener el tag (`/tag @p worldedit`) y de
  estar **usando** la brújula (no soltándola). Alternativa: `/scriptevent we:menu`.
- **La varita no marca posiciones.** Debes tener el tag y usar el **hacha de madera**.
- **No veo la caja de partículas.** Acércate a la selección, sube las partículas en
  Configuración de video, o usa `we:box` para alternarla.
- **"Selección demasiado grande".** El límite es 64 000 bloques por operación.

---

Hecho con la Script API de Minecraft Bedrock. Versiones de módulos por defecto:
`@minecraft/server 1.13.0`, `@minecraft/server-ui 1.3.0`, `min_engine_version 1.21.0`.
El script es **defensivo**: si un evento no existe en tu versión, usa alternativas
automáticamente (no se rompe).
