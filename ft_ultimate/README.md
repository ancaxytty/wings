# Hologram Studio — v6.4.0

Add-on de **hologramas** para Minecraft Bedrock, **100% por Script API**. Crea hologramas de
**texto**, **items flotantes** y **botones clickables** desde un menú con iconos.

## Cómo abrir el menú
1. **Varita de Hologramas** (`holo:wand`): clic derecho.
2. **Comando:** `/holo:menu` (y `/holo:wand` para la varita).
   *(en tu versión de MC, los comandos `!holo` de chat ya no existen; usa la varita o `/holo:menu`)*

## Novedades v6.4.0
- 🆕 **Botones clickables:** hologramas que **ejecutan un comando al hacer clic derecho** sobre
  ellos (requiere trucos activados). Se crean desde "Crear Botón Clickable".
- ✏️ **Editar sin mirar:** el menú **Administrar** lista todos los hologramas (texto/botón/item) y
  los editas seleccionándolos — ya no hace falta apuntar al holograma.
- ➕ **Más acciones por holograma:** Editar, Comando al clic, **Mover aquí**, **Teletransportarme**,
  **Duplicar** y Borrar.
- 🎨 **Menú con iconos** (filas horizontales tipo panel).
- 🪄 Con la **varita**, clic derecho en un holograma abre directamente su panel de administración.

> Sobre "horizontal": el sistema de formularios **estable** de Bedrock apila los botones en filas
> horizontales; no existe una rejilla de columnas en la API estable (eso solo está en la DDUI
> experimental). Con iconos quedan como botones horizontales tipo panel.

## Funciones (todas)
- **Crear Texto:** multilínea (`|` o `\n`), 14 colores, partícula, velocidad y flotar.
- **Crear Item flotante:** 20 items + ID personalizado; flota, gira y se **repone solo** si
  despawnea (registro persistente). Etiqueta de texto opcional.
- **Editar / Borrar** mirando el holograma · **Lista/Teleport** · **Borrar TODO** · **Ayuda**.
- **12 partículas custom** (arcoíris, fuego, hielo, oro, amor, ender, tóxico, galaxia,
  esmeralda, océano, lava, nieve).
- **Velocidad de órbita** de partículas: 0=quieta, 1-4=giro, 5=reversa. **Flotar ↑↓** por holograma.
- **Español** (es_ES / es_MX) e inglés.

## Compatibilidad
- APIs **estables**: `@minecraft/server 2.0.0` + `@minecraft/server-ui 2.0.0`,
  `min_engine_version 1.21.50`. Pensado para Minecraft **1.21.50 → 1.26+**.
- **No** requiere activar "Beta APIs". Asegúrate de activar el **Behavior Pack** en el mundo
  (los scripts solo corren desde el BP).

## Build
```bash
cd ft_ultimate
python3 _gen_icon.py        # icono profesional + textura transparente + icono de varita
python3 _gen_particles.py   # 12 partículas custom
# luego se empaquetan HologramStudioBP/RP en .mcpack y ambos en .mcaddon
```

## Notas técnicas
- El texto usa la entidad invisible `holo:text` (escala 0, sin gravedad, nametag siempre visible);
  el script controla nametag, partículas y posición.
- Como el nametag siempre mira a la cámara, la "velocidad" controla la **órbita de las partículas**
  (no la rotación del texto).
- Los items flotantes usan entidades `minecraft:item` congeladas; al ser items vanilla podrían
  recogerse si te metes encima (por eso van en alto) y se reponen solas si despawnean.
