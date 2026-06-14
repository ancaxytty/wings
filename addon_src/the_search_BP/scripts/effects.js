/**
 * The Search v0.1 PE — effects.js
 * -------------------------------------------------------------
 * Feedback al jugador: titulos / actionbar, particula custom 3D
 * (con tinte de color por cabeza) y sonidos personalizados.
 * Tambien centraliza la colocacion del bloque-cabeza.
 */

import { world, BlockPermutation, MolangVariableMap } from "@minecraft/server";
import {
  HEAD_BLOCK_ID, STATE_SKIN, STATE_SIZE, PARTICLE_FOUND,
  SOUND_FOUND, SOUND_COMPLETE, HEAD_CATALOG, clampSkin, clampSize
} from "./config.js";

/** Muestra un title + subtitle con tiempos suaves de fundido. */
export function showTitle(player, title, subtitle = "") {
  try {
    player.onScreenDisplay.setTitle(title, {
      fadeInDuration: 5,
      stayDuration: 50,
      fadeOutDuration: 12,
      subtitle
    });
  } catch (e) {}
}

/** Muestra texto dinamico en la barra de accion (parte inferior). */
export function actionBar(player, text) {
  try {
    player.onScreenDisplay.setActionBar(text);
  } catch (e) {}
}

/** Sustituye los placeholders de una plantilla de title/subtitle. */
export function applyTemplate(tpl, ctx) {
  return String(tpl)
    .replace(/\{found\}/g, ctx.found)
    .replace(/\{total\}/g, ctx.total)
    .replace(/\{head\}/g, ctx.head)
    .replace(/\{search\}/g, ctx.search)
    .replace(/\{player\}/g, ctx.player);
}

/**
 * Construye el MolangVariableMap con el color (variable.color) de la cabeza,
 * para tintar la particula 3D custom segun el skin.
 */
function colorMapForSkin(skin) {
  const rgb = HEAD_CATALOG[clampSkin(skin)].rgb;
  const map = new MolangVariableMap();
  try {
    map.setColorRGB("variable.color", { red: rgb[0], green: rgb[1], blue: rgb[2] });
  } catch (e) {}
  return map;
}

/**
 * Invoca la particula custom 3D alrededor de la cabeza (varios puntos en
 * altura para dar volumen) + un destello vanilla de remate.
 * loc debe ser el centro del bloque-cabeza.
 */
export function spawnFoundParticles(dimension, loc, skin) {
  const map = colorMapForSkin(skin);
  const points = [
    { x: loc.x, y: loc.y + 0.25, z: loc.z },
    { x: loc.x, y: loc.y + 0.60, z: loc.z },
    { x: loc.x, y: loc.y + 0.95, z: loc.z }
  ];
  for (const p of points) {
    try {
      dimension.spawnParticle(PARTICLE_FOUND, p, map);
    } catch (e) {}
  }
  try {
    dimension.spawnParticle("minecraft:totem_particle", { x: loc.x, y: loc.y + 0.7, z: loc.z });
  } catch (e) {}
}

/** Sonido custom al encontrar una cabeza. */
export function playFoundSound(player) {
  try {
    player.playSound(SOUND_FOUND, { volume: 1.0, pitch: 1.0 });
  } catch (e) {}
}

/** Sonido epico custom al completar la busqueda entera. */
export function playCompleteSound(player) {
  try {
    player.playSound(SOUND_COMPLETE, { volume: 1.0, pitch: 1.0 });
  } catch (e) {}
}

/**
 * Coloca/actualiza el bloque-cabeza con el skin y tamano indicados.
 * Devuelve true si tuvo exito.
 */
export function placeHeadBlock(dimension, x, y, z, skin, size) {
  try {
    const block = dimension.getBlock({ x, y, z });
    if (!block) return false;
    block.setPermutation(
      BlockPermutation.resolve(HEAD_BLOCK_ID, {
        [STATE_SKIN]: clampSkin(skin),
        [STATE_SIZE]: clampSize(size)
      })
    );
    return true;
  } catch (e) {
    return false;
  }
}

/** Quita un bloque-cabeza (lo convierte en aire) si efectivamente lo es. */
export function removeHeadBlock(dimId, x, y, z) {
  try {
    const dim = world.getDimension(dimId || "minecraft:overworld");
    const block = dim.getBlock({ x, y, z });
    if (block && block.typeId === HEAD_BLOCK_ID) {
      block.setType("minecraft:air");
      return true;
    }
  } catch (e) {}
  return false;
}
