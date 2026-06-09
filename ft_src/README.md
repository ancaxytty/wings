# Floating Text+ — v5.0.0 (mejora para uso personal)

> **Crédito del autor original:** este addon es **Floating Text+** creado por **Death_Aruban**
> (MCPDL / YouTube: Death_Aruban). Todos los créditos y el archivo de *Terms and Conditions*
> se mantienen intactos.
>
> La licencia del addon **permite modificarlo SOLO para uso personal**. **No** está permitido
> redistribuirlo/re-subirlo en otras plataformas sin autorización del creador, ni quitar los
> créditos. Estas mejoras se hicieron sobre esa base **para uso personal**. Si quieres publicarlo,
> debes pedir permiso al autor original.

## Qué se añadió/mejoró en v5.0.0

- **Más partículas: de 12 → 20.** Se añadieron 8 nuevas:
  - **2 partículas custom nuevas:** `da_galaxy` (espiral galaxia morada/azul) y `da_emerald`
    (anillo esmeralda verde).
  - 6 vanilla: corazones, tótem, fuego, crítico, humo y agua.
- **Más velocidades de rotación: de 3 → 6 niveles.** Ahora el ciclo es
  `0 = estático`, `1-4 = giro (de lento a turbo)`, `5 = reversa`. Antes no se podía volver a
  detener el giro; ahora sí.
- **Animación flotante (↑↓ "bob"):** dos botones nuevos en el menú de partículas
  **Float ↑↓ ON / OFF** que hacen que el texto suba y baje suavemente.
- **Botón Reset mejorado:** ahora resetea partícula + velocidad + animación flotante.
- **Soporte de español (es_ES / es_MX)** para los nombres de entidad/huevo.
- **Arreglos:** se corrigieron varias líneas de partículas que estaban rotas en el original
  (faltaba un espacio en `~ ~ ~particle`), el wrap de partículas (la #12 no era alcanzable con
  el botón "subir") y el JSON del `manifest.json` del RP (tenía una llave `}` de más).
- **Versión** subida a `5.0.0` y `min_engine_version` a `1.16.0`.

## Cómo usar (rápido)

1. Importa el `.mcaddon` y activa **ambos** packs (BP + RP) en el mundo.
2. Consigue el menú con `/function menu` (te da el item **Menu Floating Text+**).
3. Click derecho con el Menu para activar el modo. Usa el **huevo** para invocar texto y el
   **yunque + name tag** para escribir/colorear el texto.
4. Golpea (click izquierdo) un texto para editarlo → entra a **Advanced edit → Particle**.
5. En el menú **Particle** ahora tienes: ◀ ▶ partícula, **Float ON/OFF**, **Speed** y **Reset**.

## Reempaquetar

```bash
cd ft_src
python3 _gen_ft_icons.py            # regenera iconos float_on/float_off
# luego se crean los .mcpack y el .mcaddon (ver build en el repo)
```
