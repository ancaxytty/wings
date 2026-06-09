# Menú HORIZONTAL (cuadrícula) — OPCIONAL

Esto convierte el menú principal (formularios de botones) en una **cuadrícula de 2 columnas**
(botones en filas, horizontal) mediante un override de **JSON UI** (`server_form.json`).

> ⚠️ **Por qué es opcional:** el JSON UI depende mucho de la versión de Minecraft. Si en tu
> versión (v26.23) algo no calza, el menú podría verse raro o vacío. Por eso **no viene activado
> por defecto** — así el addon siempre funciona. Si lo activas y se ve mal, solo borra el archivo.

## Cómo activarlo
1. Copia el archivo `server_form.json` de esta carpeta a:
   `HologramStudioRP/ui/server_form.json`
   (crea la carpeta `ui` dentro del Resource Pack si no existe).
2. Reempaqueta el `.mcaddon` (o si ya lo importaste, edita el RP en
   `com.mojang/development_resource_packs/`).
3. Entra al mundo y abre el menú: ahora los botones salen en **2 columnas**.

Para cambiar el número de columnas, edita en `server_form.json`:
`"grid_dimensions": [ 2, 60 ]` → el primer número son las **columnas** (ej. `3`).

## Si el menú se ve mal o vacío
Borra `HologramStudioRP/ui/server_form.json` y vuelve a empaquetar. El menú vuelve al modo
vertical normal (que siempre funciona).

## Nota
No pude probar esto dentro de tu versión exacta de Minecraft. Si lo activas y me dices cómo se
ve (o el error del Content Log), lo ajusto para que quede perfecto y lo dejo activado por defecto.
