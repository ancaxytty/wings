# Hologram Studio — v6.3.0

Add-on de **hologramas** para Minecraft Bedrock, **100% por Script API** (sin funciones ni
items de menú falsos). Crea hologramas de **texto** e **items flotantes** desde un menú.

## Cómo abrir el menú (3 formas)
1. **Varita de Hologramas** (`holo:wand`): click derecho. Es el item para abrir el menú.
2. **Chat:** escribe `!holo` (o `!ft`, `!menu`). Para la varita: `!varita`.
3. **Comando:** `/holo:menu` (y `/holo:wand`). *(los comandos `/` requieren trucos activados)*

> Al entrar al mundo recibes la varita automáticamente y un mensaje de confirmación
> `[Holo] Listo...`. Si ves ese mensaje, el script está corriendo.

## Funciones
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
