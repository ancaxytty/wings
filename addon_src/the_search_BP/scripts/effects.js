/**
 * The Search v0.3 PE — effects.js
 * -------------------------------------------------------------
 * Feedback al jugador: titulos / actionbar, sonidos custom, colocacion de
 * bloques y, sobre todo, los EFECTOS DE PARTICULAS 3D:
 *   - Antorcha ambiental flotando sobre cada cabeza (pista visual).
 *   - 5 efectos tematicos al encontrar una cabeza (murcielagos, volcan,
 *     trineo de Santa, fuegos artificiales y espiral magica), varios de ellos
 *     animados por script para conseguir movimiento y direcciones reales.
 */

import { world, system, BlockPermutation, MolangVariableMap } from "@minecraft/server";
import {
  HEAD_BLOCK_ID, STATE_SKIN, STATE_SIZE,
  PARTICLE_FOUND, PARTICLE_TORCH,
  PARTICLE_BATS, PARTICLE_VOLCANO, PARTICLE_SLEIGH, PARTICLE_FIREWORKS, PARTICLE_MAGIC,
  HEAD_CATALOG, EFFECT_NAMES, clampSkin, clampSize, clampEffect
} from "./config.js";

// ----------------------------- titulos y sonidos -----------------------------

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

/** Sonido custom al encontrar una cabeza. */
export function playFoundSound(player) {
  try { player.playSound("ts.found", { volume: 1.0, pitch: 1.0 }); } catch (e) {}
}

/** Sonido epico custom al completar la busqueda entera. */
export function playCompleteSound(player) {
  try { player.playSound("ts.complete", { volume: 1.0, pitch: 1.0 }); } catch (e) {}
}

// ----------------------------- utilidades de color/particulas -----------------------------

/** MolangVariableMap con variable.color = color de la cabeza (segun skin). */
function colorMapForSkin(skin) {
  const rgb = HEAD_CATALOG[clampSkin(skin)].rgb;
  return rgbMap(rgb[0], rgb[1], rgb[2]);
}

/** MolangVariableMap con un color RGB concreto. */
function rgbMap(r, g, b) {
  const map = new MolangVariableMap();
  try { map.setColorRGB("variable.color", { red: r, green: g, blue: b }); } catch (e) {}
  return map;
}

/** Spawn de particula con proteccion ante errores (chunk no cargado, etc.). */
function safeSpawn(dimension, id, loc, map) {
  try {
    if (map) dimension.spawnParticle(id, loc, map);
    else dimension.spawnParticle(id, loc);
  } catch (e) {}
}

/**
 * Pequeno motor de animacion por ticks: ejecuta stepFn(i) cada tick durante
 * `frames` ticks y luego doneFn(). Se usa para los efectos con movimiento.
 */
function animate(frames, stepFn, doneFn) {
  let i = 0;
  const id = system.runInterval(() => {
    try { stepFn(i); } catch (e) {}
    i++;
    if (i >= frames) {
      system.clearRun(id);
      if (doneFn) { try { doneFn(); } catch (e) {} }
    }
  }, 1);
}

// ----------------------------- antorcha ambiental -----------------------------

/** Invoca la particula-antorcha flotando sobre una cabeza (pista visual). */
export function spawnTorchAbove(dimension, head) {
  const y = head.y + 1.0 + clampSize(head.size) * 0.25; // mas alto si la cabeza es grande
  safeSpawn(dimension, PARTICLE_TORCH, { x: head.x + 0.5, y, z: head.z + 0.5 });
}

// ----------------------------- efecto al encontrar -----------------------------

/**
 * Lanza el efecto 3D al encontrar una cabeza. `center` debe ser el centro del
 * bloque. effectIndex 0 = aleatorio entre los 5 disponibles.
 */
export function spawnFindEffect(dimension, center, skin, effectIndex) {
  // Destello base inmediato (siempre) tintado con el color de la cabeza.
  safeSpawn(dimension, PARTICLE_FOUND, { x: center.x, y: center.y + 0.6, z: center.z }, colorMapForSkin(skin));

  let idx = clampEffect(effectIndex);
  if (idx === 0) idx = 1 + Math.floor(Math.random() * (EFFECT_NAMES.length - 1)); // aleatorio 1..5

  switch (idx) {
    case 1: effectBats(dimension, center, skin); break;
    case 2: effectVolcano(dimension, center); break;
    case 3: effectSleigh(dimension, center); break;
    case 4: effectFireworks(dimension, center, skin); break;
    case 5: effectMagic(dimension, center, skin); break;
    default: effectFireworks(dimension, center, skin); break;
  }
}

/** 1) Murcielagos: enjambre que se dispersa en TODAS las direcciones (3D). */
function effectBats(dimension, center, skin) {
  const base = { x: center.x, y: center.y + 0.7, z: center.z };
  safeSpawn(dimension, PARTICLE_BATS, base);
  // Segunda oleada un instante despues para dar sensacion de bandada.
  system.runTimeout(() => safeSpawn(dimension, PARTICLE_BATS, base), 4);
  try { dimension.playSound("mob.bat.takeoff", base, { volume: 1.0, pitch: 1.0 }); } catch (e) {}
}

/** 2) Volcan a punto de estallar: erupcion de lava + explosion en el climax. */
function effectVolcano(dimension, center) {
  const base = { x: center.x, y: center.y + 0.1, z: center.z };
  safeSpawn(dimension, PARTICLE_VOLCANO, base);
  try { dimension.playSound("ambient.weather.thunder", base, { volume: 0.5, pitch: 1.4 }); } catch (e) {}
  // Climax: explosion vanilla + segunda colada de lava.
  system.runTimeout(() => {
    safeSpawn(dimension, "minecraft:huge_explosion_emitter", { x: center.x, y: center.y + 1.2, z: center.z });
    safeSpawn(dimension, PARTICLE_VOLCANO, base);
    try { dimension.playSound("random.explode", base, { volume: 0.7, pitch: 0.9 }); } catch (e) {}
  }, 16);
}

/** 3) Trineo de Santa: vuela en diagonal desde el cielo hasta la cabeza. */
function effectSleigh(dimension, center) {
  const start = { x: center.x - 5.5, y: center.y + 6.5, z: center.z - 5.5 };
  const end = { x: center.x, y: center.y + 1.0, z: center.z };
  const frames = 28;
  try { dimension.playSound("random.levelup", end, { volume: 0.5, pitch: 1.6 }); } catch (e) {}
  animate(
    frames,
    (i) => {
      const t = i / frames;
      const pos = {
        x: start.x + (end.x - start.x) * t,
        y: start.y + (end.y - start.y) * t + Math.sin(t * Math.PI) * 0.6, // ligero arco
        z: start.z + (end.z - start.z) * t
      };
      safeSpawn(dimension, PARTICLE_SLEIGH, pos);
      // Estela dorada detras del trineo.
      safeSpawn(dimension, PARTICLE_SLEIGH, { x: pos.x - 0.3, y: pos.y - 0.1, z: pos.z - 0.3 });
    },
    () => {
      // Llegada: brillo dorado de "entrega".
      safeSpawn(dimension, PARTICLE_FIREWORKS, end, rgbMap(1.0, 0.84, 0.25));
      safeSpawn(dimension, "minecraft:totem_particle", end);
    }
  );
}

/** 4) Fuegos artificiales: estallidos esfericos tintados con el color de la cabeza. */
function effectFireworks(dimension, center, skin) {
  const map = colorMapForSkin(skin);
  const top = { x: center.x, y: center.y + 1.3, z: center.z };
  safeSpawn(dimension, PARTICLE_FIREWORKS, top, map);
  safeSpawn(dimension, "minecraft:huge_explosion_emitter", top);
  try { dimension.playSound("firework.large_blast", top, { volume: 1.0, pitch: 1.0 }); } catch (e) {}
  // Segundo estallido un poco mas arriba.
  system.runTimeout(() => {
    safeSpawn(dimension, PARTICLE_FIREWORKS, { x: center.x, y: center.y + 2.1, z: center.z }, colorMapForSkin(skin));
    try { dimension.playSound("firework.twinkle", top, { volume: 1.0, pitch: 1.0 }); } catch (e) {}
  }, 8);
}

/** 5) Espiral magica: doble helice que asciende girando alrededor de la cabeza. */
function effectMagic(dimension, center, skin) {
  const frames = 34;
  const radius = 0.85;
  try { dimension.playSound("beacon.activate", center, { volume: 0.5, pitch: 1.4 }); } catch (e) {}
  animate(frames, (i) => {
    const angle = i * 0.55;
    const y = center.y + 0.1 + (i / frames) * 1.8;
    const map = colorMapForSkin(skin);
    safeSpawn(dimension, PARTICLE_MAGIC, {
      x: center.x + Math.cos(angle) * radius,
      y,
      z: center.z + Math.sin(angle) * radius
    }, map);
    // Segunda hebra opuesta (180 grados) para la doble helice.
    safeSpawn(dimension, PARTICLE_MAGIC, {
      x: center.x + Math.cos(angle + Math.PI) * radius,
      y,
      z: center.z + Math.sin(angle + Math.PI) * radius
    }, colorMapForSkin(skin));
  });
}

// ----------------------------- bloques -----------------------------

/** Coloca/actualiza el bloque-cabeza con el skin y tamano indicados. */
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
