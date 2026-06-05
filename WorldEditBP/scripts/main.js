/*
 * WorldEdit MCPE — FIFA World Cup 2026 Edition (v0.4)
 * Addon de WorldEdit para Minecraft Bedrock / Pocket Edition.
 *
 * Edición especial FIFA World Cup 2026:
 *   - we:fifa            -> menú con 25 países para construir su bandera.
 *   - we:flag <país> [n] -> construye la bandera (muro de concreto) frente a ti.
 *   - we:flags           -> lista de países disponibles.
 *   - we:hsphere    -> esfera HUECA centrada en ti.
 *   - we:naturalize -> "naturaliza" la selección (1 capa grass, 3 dirt, resto stone).
 *   - we:smooth     -> suaviza el terreno de la selección (mapa de alturas).
 *   - we:drain      -> drena agua/lava en un radio alrededor tuyo.
 *
 * Interacción (SIN comandos de chat ";"):
 *   - Item especial de menú: BRÚJULA (minecraft:compass) -> al usarla abre el menú.
 *   - Varita: HACHA DE MADERA (minecraft:wooden_axe)
 *       * Click derecho / tocar bloque (o quitar corteza a tronco) = POS1
 *       * Romper / intentar romper un bloque                      = POS2
 *       * Agacharse + usar la varita                              = abre el menú
 *   - Comandos por:  /scriptevent we:<comando> <args>
 *       ej:  /scriptevent we:set stone   ·   /scriptevent we:stack 3
 *
 * Visual:
 *   - Caja 3D de partículas con patrón punteado (- - - -) que muestra la
 *     selección. Esquina POS1 verde, esquina POS2 naranja.
 *   - Barra de acción (actionbar) con el progreso 0% -> 100% al rellenar.
 *
 * Activación:  /tag @p add worldedit
 *   -> consola: "addon activado correctamente"
 */

import {
  world,
  system,
  BlockPermutation,
  ItemStack,
} from "@minecraft/server";
import {
  ActionFormData,
  ModalFormData,
  MessageFormData,
  FormCancelationReason,
} from "@minecraft/server-ui";

/* ------------------------------------------------------------------ */
/*  Configuración                                                      */
/* ------------------------------------------------------------------ */
const WAND = "minecraft:wooden_axe"; // varita de selección
const MENU_ITEM = "minecraft:compass"; // item especial que abre el menú
const BUILDER = "minecraft:blaze_rod"; // herramienta que construye formas donde miras
const TAG = "worldedit";
const MAX_BLOCKS = 64000; // límite de bloques por operación
const MAX_UNDO = 8; // operaciones guardadas para deshacer
const CHUNK = 1024; // bloques procesados por tick (jobs)

// Partículas para la caja de selección
const PARTICLE_EDGE = "minecraft:endrod"; // aristas (blanco)
const PARTICLE_POS1 = "minecraft:villager_happy"; // esquina POS1 (verde)
const PARTICLE_POS2 = "minecraft:basic_flame_particle"; // esquina POS2 (naranja)

const COMMON_BLOCKS = [
  "stone",
  "cobblestone",
  "dirt",
  "grass_block",
  "oak_planks",
  "glass",
  "sand",
  "gravel",
  "bricks",
  "stone_bricks",
  "quartz_block",
  "smooth_stone",
  "sea_lantern",
  "glowstone",
  "obsidian",
  "white_wool",
  "white_concrete",
  "bedrock",
  "water",
  "lava",
  "air",
];

// Direcciones para los formularios
const DIR_LABELS = [
  "Hacia donde miro",
  "Norte (-Z)",
  "Sur (+Z)",
  "Este (+X)",
  "Oeste (-X)",
  "Arriba",
  "Abajo",
];
const DIR_NAMES = [null, "north", "south", "east", "west", "up", "down"];

/* ------------------------------------------------------------------ */
/*  Estado por jugador                                                 */
/* ------------------------------------------------------------------ */
const selections = new Map(); // id -> { pos1, pos2 }
const clipboards = new Map(); // id -> { sizeX, sizeY, sizeZ, originX/Y/Z, blocks:[{dx,dy,dz,perm}] }
const undoStacks = new Map(); // id -> [ [{x,y,z,perm,dim}] ]
const activated = new Set(); // ids ya activados
const boxHidden = new Set(); // ids que ocultaron la caja de partículas
const busy = new Set(); // ids con un trabajo pesado en curso
const builderConfig = new Map(); // id -> { shape, block, radius, height, hollow }

/* ------------------------------------------------------------------ */
/*  Utilidades                                                         */
/* ------------------------------------------------------------------ */
function toBlockLoc(loc) {
  return { x: Math.floor(loc.x), y: Math.floor(loc.y), z: Math.floor(loc.z) };
}

function normalizeBlock(name) {
  if (!name) return null;
  let n = String(name).trim().toLowerCase().replace(/^"|"$/g, "");
  if (n.length === 0) return null;
  if (!n.includes(":")) n = "minecraft:" + n;
  return n;
}

function resolvePerm(name) {
  const id = normalizeBlock(name);
  if (!id) return null;
  try {
    return BlockPermutation.resolve(id);
  } catch (e) {
    return null;
  }
}

function getSel(player) {
  return selections.get(player.id);
}

function bothPos(player) {
  const s = getSel(player);
  return s && s.pos1 && s.pos2;
}

function minMax(p1, p2) {
  return {
    minX: Math.min(p1.x, p2.x),
    maxX: Math.max(p1.x, p2.x),
    minY: Math.min(p1.y, p2.y),
    maxY: Math.max(p1.y, p2.y),
    minZ: Math.min(p1.z, p2.z),
    maxZ: Math.max(p1.z, p2.z),
  };
}

function boxVolume(b) {
  return (
    (b.maxX - b.minX + 1) * (b.maxY - b.minY + 1) * (b.maxZ - b.minZ + 1)
  );
}

function msg(player, text) {
  try {
    player.sendMessage(text);
  } catch (e) {}
}

function fmt(p) {
  return `${p.x}, ${p.y}, ${p.z}`;
}

function sleep(ticks) {
  return new Promise((res) => system.runTimeout(res, ticks));
}

function launch(promise) {
  Promise.resolve(promise).catch((e) =>
    console.warn("[WorldEdit] Error de UI: " + e)
  );
}

async function showForm(player, form) {
  for (let i = 0; i < 12; i++) {
    const res = await form.show(player);
    if (res.canceled && res.cancelationReason === FormCancelationReason.UserBusy) {
      await sleep(8);
      continue;
    }
    return res;
  }
  return undefined;
}

/* ------------------------------------------------------------------ */
/*  Actionbar / progreso                                               */
/* ------------------------------------------------------------------ */
function setProgress(player, label, frac) {
  frac = Math.max(0, Math.min(1, frac));
  const total = 20;
  const filled = Math.round(frac * total);
  const bar = "§a" + "█".repeat(filled) + "§8" + "█".repeat(total - filled);
  const pct = Math.round(frac * 100);
  try {
    player.onScreenDisplay.setActionBar(`§b${label} §r[${bar}§r] §e${pct}%`);
  } catch (e) {}
}

function clearActionBarLater(player, ticks) {
  system.runTimeout(() => {
    try {
      player.onScreenDisplay.setActionBar(" ");
    } catch (e) {}
  }, ticks || 40);
}

/* ------------------------------------------------------------------ */
/*  Sistema de trabajos (jobs) por chunks -> progreso suave            */
/* ------------------------------------------------------------------ */
function startBlockJob(player, generator) {
  busy.add(player.id);
  const wrapped = (function* () {
    try {
      yield* generator;
    } catch (e) {
      console.warn("[WorldEdit] Error en job: " + e);
    } finally {
      busy.delete(player.id);
    }
  })();
  if (typeof system.runJob === "function") {
    system.runJob(wrapped);
  } else {
    // Fallback: drenar de forma síncrona (sin animación, pero funciona)
    for (const _ of wrapped) {
      /* noop */
    }
  }
}

function isBusy(player) {
  if (busy.has(player.id)) {
    msg(player, "§eEspera a que termine la operación anterior…");
    return true;
  }
  return false;
}

/* ------------------------------------------------------------------ */
/*  Undo                                                               */
/* ------------------------------------------------------------------ */
function pushUndo(player, changes) {
  if (!changes || changes.length === 0) return;
  let stack = undoStacks.get(player.id);
  if (!stack) {
    stack = [];
    undoStacks.set(player.id, stack);
  }
  stack.push(changes);
  while (stack.length > MAX_UNDO) stack.shift();
}

function doUndo(player) {
  const stack = undoStacks.get(player.id);
  if (!stack || stack.length === 0) {
    msg(player, "§cNada que deshacer.");
    return;
  }
  const changes = stack.pop();
  let restored = 0;
  for (const c of changes) {
    try {
      const block = c.dim.getBlock({ x: c.x, y: c.y, z: c.z });
      if (block) {
        block.setPermutation(c.perm);
        restored++;
      }
    } catch (e) {}
  }
  msg(player, `§a[WE] Deshecho: §f${restored}§a bloques restaurados.`);
}

/* ------------------------------------------------------------------ */
/*  Relleno genérico de una región (con progreso + undo)               */
/*  predicate(x,y,z,block) -> BlockPermutation | null                  */
/* ------------------------------------------------------------------ */
function fillRegion(player, b, predicate, label) {
  if (isBusy(player)) return;
  const volume = boxVolume(b);
  if (volume > MAX_BLOCKS) {
    return msg(
      player,
      `§cSelección demasiado grande: §f${volume}§c (máx §f${MAX_BLOCKS}§c).`
    );
  }
  const dim = player.dimension;
  const changes = [];
  let processed = 0;
  let placed = 0;

  const gen = (function* () {
    for (let x = b.minX; x <= b.maxX; x++) {
      for (let y = b.minY; y <= b.maxY; y++) {
        for (let z = b.minZ; z <= b.maxZ; z++) {
          try {
            const block = dim.getBlock({ x, y, z });
            if (block) {
              const perm = predicate(x, y, z, block);
              if (perm) {
                changes.push({ x, y, z, perm: block.permutation, dim });
                block.setPermutation(perm);
                placed++;
              }
            }
          } catch (e) {}
          processed++;
          if (processed % CHUNK === 0) {
            setProgress(player, label, processed / volume);
            yield;
          }
        }
      }
    }
    pushUndo(player, changes);
    setProgress(player, label, 1);
    msg(player, `§a[WE] ${label}: §f${placed}§a bloques.`);
    clearActionBarLater(player);
  })();

  startBlockJob(player, gen);
}

/* ------------------------------------------------------------------ */
/*  Operaciones de construcción                                        */
/* ------------------------------------------------------------------ */
function opSet(player, blockName) {
  if (!bothPos(player)) return needSel(player);
  const perm = resolvePerm(blockName);
  if (!perm) return badBlock(player, blockName);
  const s = getSel(player);
  fillRegion(player, minMax(s.pos1, s.pos2), () => perm, "Rellenando");
}

function opReplace(player, fromName, toName) {
  if (!bothPos(player)) return needSel(player);
  const fromId = normalizeBlock(fromName);
  const toPerm = resolvePerm(toName);
  if (!fromId) return badBlock(player, fromName);
  if (!toPerm) return badBlock(player, toName);
  const s = getSel(player);
  fillRegion(
    player,
    minMax(s.pos1, s.pos2),
    (x, y, z, block) => (block.typeId === fromId ? toPerm : null),
    "Reemplazando"
  );
}

function opWalls(player, blockName) {
  if (!bothPos(player)) return needSel(player);
  const perm = resolvePerm(blockName);
  if (!perm) return badBlock(player, blockName);
  const s = getSel(player);
  const b = minMax(s.pos1, s.pos2);
  fillRegion(
    player,
    b,
    (x, y, z) =>
      x === b.minX || x === b.maxX || z === b.minZ || z === b.maxZ ? perm : null,
    "Paredes"
  );
}

function opFaces(player, blockName) {
  if (!bothPos(player)) return needSel(player);
  const perm = resolvePerm(blockName);
  if (!perm) return badBlock(player, blockName);
  const s = getSel(player);
  const b = minMax(s.pos1, s.pos2);
  fillRegion(
    player,
    b,
    (x, y, z) =>
      x === b.minX ||
      x === b.maxX ||
      z === b.minZ ||
      z === b.maxZ ||
      y === b.minY ||
      y === b.maxY
        ? perm
        : null,
    "Contorno"
  );
}

function opClear(player) {
  if (!bothPos(player)) return needSel(player);
  const air = BlockPermutation.resolve("minecraft:air");
  const s = getSel(player);
  fillRegion(player, minMax(s.pos1, s.pos2), () => air, "Vaciando");
}

function opSphere(player, blockName, radius, hollow, center) {
  const perm = resolvePerm(blockName);
  if (!perm) return badBlock(player, blockName);
  const r = Math.max(1, Math.min(40, Math.floor(radius)));
  const c = center || toBlockLoc(player.location);
  const b = {
    minX: c.x - r,
    maxX: c.x + r,
    minY: c.y - r,
    maxY: c.y + r,
    minZ: c.z - r,
    maxZ: c.z + r,
  };
  const outer = r + 0.5;
  const inner = r - 0.5;
  fillRegion(
    player,
    b,
    (x, y, z) => {
      const d = Math.sqrt((x - c.x) ** 2 + (y - c.y) ** 2 + (z - c.z) ** 2);
      if (d > outer) return null;
      if (hollow && d < inner) return null;
      return perm;
    },
    "Esfera"
  );
}

function opCylinder(player, blockName, radius, height, hollow, center) {
  const perm = resolvePerm(blockName);
  if (!perm) return badBlock(player, blockName);
  const r = Math.max(1, Math.min(40, Math.floor(radius)));
  const h = Math.max(1, Math.min(160, Math.floor(height)));
  const c = center || toBlockLoc(player.location);
  const b = {
    minX: c.x - r,
    maxX: c.x + r,
    minY: c.y,
    maxY: c.y + h - 1,
    minZ: c.z - r,
    maxZ: c.z + r,
  };
  const outer = r + 0.5;
  const inner = r - 0.5;
  fillRegion(
    player,
    b,
    (x, y, z) => {
      const d = Math.sqrt((x - c.x) ** 2 + (z - c.z) ** 2);
      if (d > outer) return null;
      if (hollow && d < inner) return null;
      return perm;
    },
    "Cilindro"
  );
}

function opPyramid(player, blockName, size, center) {
  const perm = resolvePerm(blockName);
  if (!perm) return badBlock(player, blockName);
  const s = Math.max(1, Math.min(60, Math.floor(size)));
  const c = center || toBlockLoc(player.location);
  const b = {
    minX: c.x - s,
    maxX: c.x + s,
    minY: c.y,
    maxY: c.y + s - 1,
    minZ: c.z - s,
    maxZ: c.z + s,
  };
  fillRegion(
    player,
    b,
    (x, y, z) => {
      const half = s - 1 - (y - c.y);
      if (half < 0) return null;
      if (Math.abs(x - c.x) <= half && Math.abs(z - c.z) <= half) return perm;
      return null;
    },
    "Pirámide"
  );
}

/* ------------------------------------------------------------------ */
/*  Helpers para líquidos / terreno (v0.3)                             */
/* ------------------------------------------------------------------ */
function isLiquidId(id) {
  return (
    id === "minecraft:water" ||
    id === "minecraft:flowing_water" ||
    id === "minecraft:lava" ||
    id === "minecraft:flowing_lava"
  );
}

function isAirId(id) {
  return id === "minecraft:air";
}

function isAirOrLiquidBlock(block) {
  const id = block.typeId;
  return isAirId(id) || isLiquidId(id);
}

/* ------------------------------------------------------------------ */
/*  v0.3 · HSphere (esfera hueca)                                      */
/* ------------------------------------------------------------------ */
function opHSphere(player, blockName, radius) {
  // Atajo: una esfera hueca reutilizando opSphere con hollow = true.
  opSphere(player, blockName, radius, true);
}

/* ------------------------------------------------------------------ */
/*  v0.3 · Drain (drenar agua/lava en un radio)                        */
/* ------------------------------------------------------------------ */
function opDrain(player, radius) {
  const r = Math.max(1, Math.min(40, Math.floor(radius) || 5));
  const c = toBlockLoc(player.location);
  const b = {
    minX: c.x - r,
    maxX: c.x + r,
    minY: c.y - r,
    maxY: c.y + r,
    minZ: c.z - r,
    maxZ: c.z + r,
  };
  const air = BlockPermutation.resolve("minecraft:air");
  const outer = r + 0.5;
  fillRegion(
    player,
    b,
    (x, y, z, block) => {
      const d = Math.sqrt((x - c.x) ** 2 + (y - c.y) ** 2 + (z - c.z) ** 2);
      if (d > outer) return null;
      return isLiquidId(block.typeId) ? air : null;
    },
    "Drenando"
  );
}

/* ------------------------------------------------------------------ */
/*  v0.3 · Naturalize (1 capa grass, 3 dirt, resto stone)              */
/* ------------------------------------------------------------------ */
function opNaturalize(player) {
  if (!bothPos(player)) return needSel(player);
  if (isBusy(player)) return;
  const s = getSel(player);
  const b = minMax(s.pos1, s.pos2);
  const volume = boxVolume(b);
  if (volume > MAX_BLOCKS) {
    return msg(
      player,
      `§cSelección demasiado grande: §f${volume}§c (máx §f${MAX_BLOCKS}§c).`
    );
  }
  const dim = player.dimension;
  const GRASS = "minecraft:grass_block";
  const DIRT = "minecraft:dirt";
  const STONE = "minecraft:stone";
  const grass = BlockPermutation.resolve(GRASS);
  const dirt = BlockPermutation.resolve(DIRT);
  const stone = BlockPermutation.resolve(STONE);
  const changes = [];
  let processed = 0;
  let placed = 0;

  const gen = (function* () {
    for (let x = b.minX; x <= b.maxX; x++) {
      for (let z = b.minZ; z <= b.maxZ; z++) {
        // depth = nº de bloques sólidos contados desde la superficie (de arriba a abajo)
        let depth = 0;
        for (let y = b.maxY; y >= b.minY; y--) {
          try {
            const block = dim.getBlock({ x, y, z });
            if (block) {
              if (isAirOrLiquidBlock(block)) {
                depth = 0; // se rompe la columna: la próxima capa sólida vuelve a ser superficie
              } else {
                depth++;
                const targetId =
                  depth === 1 ? GRASS : depth <= 4 ? DIRT : STONE;
                if (block.typeId !== targetId) {
                  changes.push({ x, y, z, perm: block.permutation, dim });
                  block.setPermutation(
                    depth === 1 ? grass : depth <= 4 ? dirt : stone
                  );
                  placed++;
                }
              }
            }
          } catch (e) {}
          processed++;
          if (processed % CHUNK === 0) {
            setProgress(player, "Naturalizando", processed / volume);
            yield;
          }
        }
      }
    }
    pushUndo(player, changes);
    setProgress(player, "Naturalizando", 1);
    msg(player, `§a[WE] Naturalize: §f${placed}§a bloques.`);
    clearActionBarLater(player);
  })();

  startBlockJob(player, gen);
}

/* ------------------------------------------------------------------ */
/*  v0.3 · Smooth (suaviza el terreno con un mapa de alturas)          */
/* ------------------------------------------------------------------ */
function opSmooth(player, iterations) {
  if (!bothPos(player)) return needSel(player);
  if (isBusy(player)) return;
  const iters = Math.max(1, Math.min(10, Math.floor(iterations) || 1));
  const s = getSel(player);
  const b = minMax(s.pos1, s.pos2);
  const volume = boxVolume(b);
  if (volume > MAX_BLOCKS) {
    return msg(
      player,
      `§cSelección demasiado grande: §f${volume}§c (máx §f${MAX_BLOCKS}§c).`
    );
  }
  const dim = player.dimension;
  const sizeX = b.maxX - b.minX + 1;
  const sizeZ = b.maxZ - b.minZ + 1;
  const grass = BlockPermutation.resolve("minecraft:grass_block");
  const dirt = BlockPermutation.resolve("minecraft:dirt");
  const air = BlockPermutation.resolve("minecraft:air");
  const idx = (x, z) => (x - b.minX) * sizeZ + (z - b.minZ);
  let height = new Float64Array(sizeX * sizeZ);
  const surf = new Array(sizeX * sizeZ); // permutación de la superficie
  const sub = new Array(sizeX * sizeZ); // permutación justo debajo
  const changes = [];
  let processed = 0;
  let placed = 0;
  const total = volume * 2; // fase lectura + fase escritura (aprox.)

  const gen = (function* () {
    // Fase 1: construir el mapa de alturas (y material) de cada columna
    for (let x = b.minX; x <= b.maxX; x++) {
      for (let z = b.minZ; z <= b.maxZ; z++) {
        let top = b.minY - 1;
        let surfPerm = grass;
        let subPerm = dirt;
        for (let y = b.maxY; y >= b.minY; y--) {
          try {
            const block = dim.getBlock({ x, y, z });
            if (block && !isAirOrLiquidBlock(block)) {
              top = y;
              surfPerm = block.permutation;
              const below = dim.getBlock({ x, y: y - 1, z });
              subPerm =
                below && !isAirOrLiquidBlock(below) ? below.permutation : dirt;
              break;
            }
          } catch (e) {}
          processed++;
          if (processed % CHUNK === 0) {
            setProgress(player, "Suavizando", processed / total);
            yield;
          }
        }
        const i = idx(x, z);
        height[i] = top;
        surf[i] = surfPerm;
        sub[i] = subPerm;
      }
    }

    // Fase 2: desenfoque (box blur 3x3) del mapa de alturas, N iteraciones
    for (let it = 0; it < iters; it++) {
      const nh = new Float64Array(sizeX * sizeZ);
      for (let xi = 0; xi < sizeX; xi++) {
        for (let zi = 0; zi < sizeZ; zi++) {
          let sum = 0;
          let cnt = 0;
          for (let dx = -1; dx <= 1; dx++) {
            for (let dz = -1; dz <= 1; dz++) {
              const nx = xi + dx;
              const nz = zi + dz;
              if (nx < 0 || nx >= sizeX || nz < 0 || nz >= sizeZ) continue;
              sum += height[nx * sizeZ + nz];
              cnt++;
            }
          }
          nh[xi * sizeZ + zi] = sum / cnt;
        }
      }
      height = nh;
      yield;
    }

    // Fase 3: reconstruir las columnas con las nuevas alturas
    for (let x = b.minX; x <= b.maxX; x++) {
      for (let z = b.minZ; z <= b.maxZ; z++) {
        const i = idx(x, z);
        let newTop = Math.round(height[i]);
        if (newTop > b.maxY) newTop = b.maxY;
        if (newTop < b.minY - 1) newTop = b.minY - 1;
        const surfPerm = surf[i] || grass;
        const subPerm = sub[i] || dirt;
        for (let y = b.minY; y <= b.maxY; y++) {
          try {
            const block = dim.getBlock({ x, y, z });
            if (block) {
              let want = null;
              if (y > newTop) {
                // por encima de la superficie: quitar sólido sobrante
                if (!isAirOrLiquidBlock(block)) want = air;
              } else if (y === newTop) {
                // superficie: rellenar si está vacío
                if (isAirOrLiquidBlock(block)) want = surfPerm;
              } else {
                // bajo la superficie: rellenar huecos
                if (isAirOrLiquidBlock(block)) want = subPerm;
              }
              if (want) {
                changes.push({ x, y, z, perm: block.permutation, dim });
                block.setPermutation(want);
                placed++;
              }
            }
          } catch (e) {}
          processed++;
          if (processed % CHUNK === 0) {
            setProgress(player, "Suavizando", processed / total);
            yield;
          }
        }
      }
    }
    pushUndo(player, changes);
    setProgress(player, "Suavizando", 1);
    msg(player, `§a[WE] Smooth x§f${iters}§a: §f${placed}§a bloques.`);
    clearActionBarLater(player);
  })();

  startBlockJob(player, gen);
}

/* ================================================================== */
/*  FIFA WORLD CUP 2026 EDITION · Banderas de países (bloques)         */
/*  Cada bandera se construye como un MURO vertical de concreto frente */
/*  al jugador (mirando hacia donde quieres que aparezca).             */
/* ================================================================== */
const FLAG_W = 24; // ancho base (relación ~3:2)
const FLAG_H = 16; // alto base

// char -> bloque (concreto de colores, se ve igual en cualquier modo)
const FLAG_PALETTE = {
  W: "minecraft:white_concrete",
  R: "minecraft:red_concrete",
  B: "minecraft:blue_concrete",
  L: "minecraft:light_blue_concrete",
  G: "minecraft:green_concrete",
  Y: "minecraft:yellow_concrete",
  K: "minecraft:black_concrete",
  O: "minecraft:orange_concrete",
  N: "minecraft:brown_concrete",
  A: "minecraft:gray_concrete",
  E: "minecraft:light_gray_concrete",
};

function makeGrid(W, H, fill) {
  const g = [];
  for (let y = 0; y < H; y++) g.push(new Array(W).fill(fill));
  return g;
}
// Franjas horizontales (de arriba a abajo)
function bandsH(colors, W, H) {
  const g = makeGrid(W, H, colors[0]);
  for (let y = 0; y < H; y++) {
    const i = Math.min(colors.length - 1, Math.floor((y * colors.length) / H));
    for (let x = 0; x < W; x++) g[y][x] = colors[i];
  }
  return g;
}
// Franjas verticales (de izquierda a derecha)
function bandsV(colors, W, H) {
  const g = makeGrid(W, H, colors[0]);
  for (let x = 0; x < W; x++) {
    const i = Math.min(colors.length - 1, Math.floor((x * colors.length) / W));
    for (let y = 0; y < H; y++) g[y][x] = colors[i];
  }
  return g;
}
// Franjas verticales con proporciones: segs = [["R",0.25],["W",0.5],["R",0.25]]
function bandsVProp(segs, W, H) {
  const last = segs[segs.length - 1][0];
  const g = makeGrid(W, H, last);
  for (let x = 0; x < W; x++) {
    let acc = 0;
    let ch = last;
    const f = (x + 0.5) / W;
    for (const seg of segs) {
      acc += seg[1];
      if (f <= acc) { ch = seg[0]; break; }
    }
    for (let y = 0; y < H; y++) g[y][x] = ch;
  }
  return g;
}
// Franjas horizontales con proporciones
function bandsHProp(segs, W, H) {
  const last = segs[segs.length - 1][0];
  const g = makeGrid(W, H, last);
  for (let y = 0; y < H; y++) {
    let acc = 0;
    let ch = last;
    const f = (y + 0.5) / H;
    for (const seg of segs) {
      acc += seg[1];
      if (f <= acc) { ch = seg[0]; break; }
    }
    for (let x = 0; x < W; x++) g[y][x] = ch;
  }
  return g;
}
function overlayDisc(g, color, cxF, cyF, rF) {
  const H = g.length;
  const W = g[0].length;
  const cx = W * cxF;
  const cy = H * cyF;
  const r = Math.min(W, H) * rF;
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++)
      if (Math.hypot(x + 0.5 - cx, y + 0.5 - cy) <= r) g[y][x] = color;
  return g;
}
// Cruz centrada que llega a los bordes (St. George / Inglaterra)
function fullCross(field, cross, W, H, t) {
  const g = makeGrid(W, H, field);
  const cy = (H - t) / 2;
  const cx = (W - t) / 2;
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++)
      if ((y >= cy && y < cy + t) || (x >= cx && x < cx + t)) g[y][x] = cross;
  return g;
}
// Cruz que NO llega a los bordes (Suiza)
function plusCross(field, cross, W, H, t, armF) {
  const g = makeGrid(W, H, field);
  const cxA = (W - t) / 2;
  const cyA = (H - t) / 2;
  const ccx = W / 2;
  const ccy = H / 2;
  const halfV = H * armF;
  const halfH = W * armF;
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const onV = x >= cxA && x < cxA + t && Math.abs(y + 0.5 - ccy) <= halfV;
      const onH = y >= cyA && y < cyA + t && Math.abs(x + 0.5 - ccx) <= halfH;
      if (onV || onH) g[y][x] = cross;
    }
  return g;
}
// Cruz nórdica (Dinamarca)
function nordic(field, cross, W, H, t) {
  const g = makeGrid(W, H, field);
  const vx = Math.floor(W * 0.34);
  const cyA = Math.floor((H - t) / 2);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++)
      if ((x >= vx && x < vx + t) || (y >= cyA && y < cyA + t)) g[y][x] = cross;
  return g;
}
// Estrella de 5 puntas (point-in-polygon)
function starPoly(cx, cy, rO, rI, pts, rot) {
  const v = [];
  for (let i = 0; i < pts * 2; i++) {
    const r = i % 2 === 0 ? rO : rI;
    const a = rot + (i * Math.PI) / pts;
    v.push([cx + r * Math.sin(a), cy - r * Math.cos(a)]);
  }
  return v;
}
function inPoly(x, y, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i][0];
    const yi = poly[i][1];
    const xj = poly[j][0];
    const yj = poly[j][1];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi)
      inside = !inside;
  }
  return inside;
}
function overlayStar(g, color, cxF, cyF, rF, rot) {
  const H = g.length;
  const W = g[0].length;
  const cx = W * cxF;
  const cy = H * cyF;
  const rO = Math.min(W, H) * rF;
  const poly = starPoly(cx, cy, rO, rO * 0.42, 5, rot || 0);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++)
      if (inPoly(x + 0.5, y + 0.5, poly)) g[y][x] = color;
  return g;
}

/* --- Banderas con diseño propio --- */
function flagUSA(W, H) {
  const g = makeGrid(W, H, "R");
  for (let y = 0; y < H; y++) {
    const stripe = Math.floor((y * 13) / H) % 2 === 0 ? "R" : "W";
    for (let x = 0; x < W; x++) g[y][x] = stripe;
  }
  const cw = Math.floor(W * 0.42);
  const chh = Math.floor(H * 0.54);
  for (let y = 0; y < chh; y++)
    for (let x = 0; x < cw; x++)
      g[y][x] = x % 2 === 0 && y % 2 === 0 ? "W" : "B"; // estrellas punteadas
  return g;
}
function flagBrazil(W, H) {
  const g = makeGrid(W, H, "G");
  const cx = (W - 1) / 2;
  const cy = (H - 1) / 2;
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const d = Math.abs(x - cx) / (W * 0.46) + Math.abs(y - cy) / (H * 0.46);
      if (d <= 1) g[y][x] = "Y"; // rombo amarillo
    }
  overlayDisc(g, "B", 0.5, 0.5, 0.17); // círculo azul
  return g;
}
function flagKorea(W, H) {
  const g = makeGrid(W, H, "W");
  const cx = W * 0.5;
  const cy = H * 0.5;
  const r = Math.min(W, H) * 0.22;
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++)
      if (Math.hypot(x + 0.5 - cx, y + 0.5 - cy) <= r)
        g[y][x] = y + 0.5 < cy ? "R" : "B"; // taegeuk simplificado
  const m = Math.max(1, Math.floor(Math.min(W, H) * 0.08));
  const pad = Math.floor(Math.min(W, H) * 0.12);
  const corners = [
    [pad, pad],
    [W - pad - m, pad],
    [pad, H - pad - m],
    [W - pad - m, H - pad - m],
  ];
  for (const c of corners)
    for (let y = c[1]; y < c[1] + m; y++)
      for (let x = c[0]; x < c[0] + m; x++)
        if (y >= 0 && y < H && x >= 0 && x < W) g[y][x] = "K"; // trigramas
  return g;
}
function flagCroatia(W, H) {
  const g = bandsH(["R", "W", "B"], W, H);
  const cw = Math.floor(W * 0.18);
  const ch = Math.floor(H * 0.34);
  const sx = Math.floor((W - cw) / 2);
  const sy = Math.floor(H * 0.16);
  for (let y = 0; y < ch; y++)
    for (let x = 0; x < cw; x++) {
      const gx = sx + x;
      const gy = sy + y;
      if (gy >= 0 && gy < H && gx >= 0 && gx < W)
        g[gy][gx] = (x + y) % 2 === 0 ? "R" : "W"; // tablero
    }
  return g;
}
function flagUruguay(W, H) {
  const g = makeGrid(W, H, "W");
  for (let y = 0; y < H; y++) {
    const stripe = Math.floor((y * 9) / H) % 2 === 0 ? "W" : "L";
    for (let x = 0; x < W; x++) g[y][x] = stripe;
  }
  const cw = Math.floor(W * 0.4);
  const chh = Math.floor(H * 0.55);
  for (let y = 0; y < chh; y++) for (let x = 0; x < cw; x++) g[y][x] = "W"; // cantón
  overlayDisc(g, "Y", 0.2, 0.28, 0.12); // sol
  return g;
}

/* --- Registro de países (FIFA World Cup 2026) --- */
const FIFA_FLAGS = {
  usa: { name: "Estados Unidos", aliases: ["eeuu", "estadosunidos", "usa"], render: flagUSA },
  canada: { name: "Canadá", aliases: ["canada"], render: (W, H) => { const g = bandsVProp([["R", 0.27], ["W", 0.46], ["R", 0.27]], W, H); overlayStar(g, "R", 0.5, 0.5, 0.2, 0); return g; } },
  mexico: { name: "México", aliases: ["mexico"], render: (W, H) => { const g = bandsV(["G", "W", "R"], W, H); overlayDisc(g, "N", 0.5, 0.5, 0.1); return g; } },
  brazil: { name: "Brasil", aliases: ["brasil", "brazil"], render: flagBrazil },
  argentina: { name: "Argentina", aliases: ["argentina"], render: (W, H) => { const g = bandsH(["L", "W", "L"], W, H); overlayDisc(g, "Y", 0.5, 0.5, 0.11); return g; } },
  france: { name: "Francia", aliases: ["francia", "france"], render: (W, H) => bandsV(["B", "W", "R"], W, H) },
  germany: { name: "Alemania", aliases: ["alemania", "germany"], render: (W, H) => bandsH(["K", "R", "Y"], W, H) },
  spain: { name: "España", aliases: ["espana", "spain"], render: (W, H) => bandsHProp([["R", 0.25], ["Y", 0.5], ["R", 0.25]], W, H) },
  england: { name: "Inglaterra", aliases: ["inglaterra", "england"], render: (W, H) => fullCross("W", "R", W, H, Math.max(2, Math.floor(H * 0.16))) },
  portugal: { name: "Portugal", aliases: ["portugal"], render: (W, H) => { const g = bandsVProp([["G", 0.4], ["R", 0.6]], W, H); overlayDisc(g, "Y", 0.4, 0.5, 0.1); return g; } },
  netherlands: { name: "Países Bajos", aliases: ["paisesbajos", "holanda", "netherlands"], render: (W, H) => bandsH(["R", "W", "B"], W, H) },
  italy: { name: "Italia", aliases: ["italia", "italy"], render: (W, H) => bandsV(["G", "W", "R"], W, H) },
  belgium: { name: "Bélgica", aliases: ["belgica", "belgium"], render: (W, H) => bandsV(["K", "Y", "R"], W, H) },
  croatia: { name: "Croacia", aliases: ["croacia", "croatia"], render: flagCroatia },
  uruguay: { name: "Uruguay", aliases: ["uruguay"], render: flagUruguay },
  japan: { name: "Japón", aliases: ["japon", "japan"], render: (W, H) => { const g = makeGrid(W, H, "W"); overlayDisc(g, "R", 0.5, 0.5, 0.18); return g; } },
  korea: { name: "Corea del Sur", aliases: ["corea", "coreadelsur", "korea"], render: flagKorea },
  morocco: { name: "Marruecos", aliases: ["marruecos", "morocco"], render: (W, H) => { const g = makeGrid(W, H, "R"); overlayStar(g, "G", 0.5, 0.5, 0.2, 0); return g; } },
  senegal: { name: "Senegal", aliases: ["senegal"], render: (W, H) => { const g = bandsV(["G", "Y", "R"], W, H); overlayStar(g, "G", 0.5, 0.5, 0.16, 0); return g; } },
  nigeria: { name: "Nigeria", aliases: ["nigeria"], render: (W, H) => bandsV(["G", "W", "G"], W, H) },
  colombia: { name: "Colombia", aliases: ["colombia"], render: (W, H) => bandsHProp([["Y", 0.5], ["B", 0.25], ["R", 0.25]], W, H) },
  switzerland: { name: "Suiza", aliases: ["suiza", "switzerland"], render: (W, H) => plusCross("R", "W", W, H, Math.max(2, Math.floor(H * 0.16)), 0.22) },
  denmark: { name: "Dinamarca", aliases: ["dinamarca", "denmark"], render: (W, H) => nordic("R", "W", W, H, Math.max(2, Math.floor(H * 0.16))) },
  poland: { name: "Polonia", aliases: ["polonia", "poland"], render: (W, H) => bandsH(["W", "R"], W, H) },
  ghana: { name: "Ghana", aliases: ["ghana"], render: (W, H) => { const g = bandsH(["R", "Y", "G"], W, H); overlayStar(g, "K", 0.5, 0.5, 0.14, 0); return g; } },
};

function resolveCountry(input) {
  const q = String(input || "").trim().toLowerCase().replace(/[\s_]/g, "");
  if (!q) return null;
  if (FIFA_FLAGS[q]) return q;
  for (const key in FIFA_FLAGS) {
    if (FIFA_FLAGS[key].aliases.indexOf(q) !== -1) return key;
  }
  return null;
}

function listFlags(player) {
  const keys = Object.keys(FIFA_FLAGS);
  const names = keys.map((k) => "§e" + FIFA_FLAGS[k].name);
  msg(player, "§6§l[FIFA 2026] §r§7Países disponibles (§f" + names.length + "§7):");
  msg(player, names.join("§7, "));
  msg(player, "§7Construye con: §e/scriptevent we:flag <país> [escala 1-3]");
}

// Construye la bandera como un muro frente al jugador.
function opFlag(player, countryInput, scale) {
  if (isBusy(player)) return;
  const key = resolveCountry(countryInput);
  if (!key) {
    msg(player, `§cPaís no reconocido: §f${countryInput}§c. Usa §ewe:flags§c para la lista.`);
    return;
  }
  const s = Math.max(1, Math.min(3, Math.floor(scale) || 1));
  const W = FLAG_W * s;
  const H = FLAG_H * s;
  const country = FIFA_FLAGS[key];
  let grid;
  try {
    grid = country.render(W, H);
  } catch (e) {
    return msg(player, "§cError generando la bandera: §f" + e);
  }
  const facing = facingCardinal(player);
  const right = { x: -facing.z, y: 0, z: facing.x };
  const base = toBlockLoc(player.location);
  const front = { x: base.x + facing.x * 2, y: base.y, z: base.z + facing.z * 2 };
  const halfW = Math.floor(W / 2);
  const dim = player.dimension;
  const permCache = {};
  const changes = [];
  let processed = 0;
  let placed = 0;
  const total = W * H;
  const label = "Bandera " + country.name;

  const gen = (function* () {
    for (let row = 0; row < H; row++) {
      for (let col = 0; col < W; col++) {
        const ch = grid[row][col];
        const id = FLAG_PALETTE[ch];
        processed++;
        if (id) {
          const x = front.x + right.x * (col - halfW);
          const y = front.y + (H - 1 - row);
          const z = front.z + right.z * (col - halfW);
          try {
            const block = dim.getBlock({ x: x, y: y, z: z });
            if (block) {
              let perm = permCache[id];
              if (!perm) {
                perm = BlockPermutation.resolve(id);
                permCache[id] = perm;
              }
              changes.push({ x: x, y: y, z: z, perm: block.permutation, dim: dim });
              block.setPermutation(perm);
              placed++;
            }
          } catch (e) {}
        }
        if (processed % CHUNK === 0) {
          setProgress(player, label, processed / total);
          yield;
        }
      }
    }
    pushUndo(player, changes);
    setProgress(player, label, 1);
    msg(
      player,
      `§6[FIFA 2026] §aBandera de §e${country.name}§a construida §7(§f${placed}§7 bloques, ${W}x${H}). §7Usa §ewe:undo§7 para deshacer.`
    );
    clearActionBarLater(player);
  })();

  startBlockJob(player, gen);
}

function opUp(player, n) {
  const steps = Math.max(1, Math.min(256, Math.floor(n) || 1));
  try {
    const dim = player.dimension;
    const c = toBlockLoc(player.location);
    const targetY = c.y + steps;
    const under = dim.getBlock({ x: c.x, y: targetY - 1, z: c.z });
    if (under) {
      const glass = BlockPermutation.resolve("minecraft:glass");
      pushUndo(player, [
        { x: c.x, y: targetY - 1, z: c.z, perm: under.permutation, dim },
      ]);
      under.setPermutation(glass);
    }
    player.teleport({ x: c.x + 0.5, y: targetY, z: c.z + 0.5 });
    msg(player, `§a[WE] Subiste §f${steps}§a bloques.`);
  } catch (e) {
    msg(player, "§cNo se pudo subir aquí.");
  }
}

/* ------------------------------------------------------------------ */
/*  Copy / Paste / Stack / Rotate / Move                               */
/* ------------------------------------------------------------------ */
function opCopy(player) {
  if (!bothPos(player)) return needSel(player);
  const s = getSel(player);
  const b = minMax(s.pos1, s.pos2);
  if (boxVolume(b) > MAX_BLOCKS) {
    return msg(player, `§cSelección demasiado grande para copiar.`);
  }
  const dim = player.dimension;
  const blocks = [];
  for (let x = b.minX; x <= b.maxX; x++) {
    for (let y = b.minY; y <= b.maxY; y++) {
      for (let z = b.minZ; z <= b.maxZ; z++) {
        try {
          const block = dim.getBlock({ x, y, z });
          if (!block) continue;
          blocks.push({
            dx: x - b.minX,
            dy: y - b.minY,
            dz: z - b.minZ,
            perm: block.permutation,
          });
        } catch (e) {}
      }
    }
  }
  clipboards.set(player.id, {
    sizeX: b.maxX - b.minX + 1,
    sizeY: b.maxY - b.minY + 1,
    sizeZ: b.maxZ - b.minZ + 1,
    originX: b.minX,
    originY: b.minY,
    originZ: b.minZ,
    blocks,
  });
  msg(player, `§a[WE] Copiado: §f${blocks.length}§a bloques.`);
}

function opPaste(player) {
  const clip = clipboards.get(player.id);
  if (!clip || clip.blocks.length === 0) {
    return msg(player, "§cPortapapeles vacío. Usa Copy primero.");
  }
  if (isBusy(player)) return;
  const base = toBlockLoc(player.location);
  const dim = player.dimension;
  const changes = [];
  let processed = 0;
  let placed = 0;
  const total = clip.blocks.length;

  const gen = (function* () {
    for (const bl of clip.blocks) {
      const x = base.x + bl.dx;
      const y = base.y + bl.dy;
      const z = base.z + bl.dz;
      try {
        const block = dim.getBlock({ x, y, z });
        if (block) {
          changes.push({ x, y, z, perm: block.permutation, dim });
          block.setPermutation(bl.perm);
          placed++;
        }
      } catch (e) {}
      processed++;
      if (processed % CHUNK === 0) {
        setProgress(player, "Pegando", processed / total);
        yield;
      }
    }
    pushUndo(player, changes);
    setProgress(player, "Pegando", 1);
    msg(player, `§a[WE] Pegado: §f${placed}§a bloques.`);
    clearActionBarLater(player);
  })();

  startBlockJob(player, gen);
}

// Multiplica (apila) el portapapeles N veces en una dirección.
function opStack(player, count, dirName) {
  const clip = clipboards.get(player.id);
  if (!clip || clip.blocks.length === 0) {
    return msg(player, "§cPortapapeles vacío. Usa Copy primero, luego Stack.");
  }
  if (isBusy(player)) return;
  const n = Math.max(1, Math.min(32, Math.floor(count) || 1));
  const dir = dirVector(player, dirName);
  // tamaño de la construcción a lo largo del eje de la dirección
  const sizeAlong =
    dir.x !== 0 ? clip.sizeX : dir.z !== 0 ? clip.sizeZ : clip.sizeY;
  // origen: la esquina mínima de lo que se copió (para continuar la obra)
  const ox = clip.originX ?? toBlockLoc(player.location).x;
  const oy = clip.originY ?? toBlockLoc(player.location).y;
  const oz = clip.originZ ?? toBlockLoc(player.location).z;

  const total = clip.blocks.length * n;
  if (total > MAX_BLOCKS) {
    return msg(player, `§cStack demasiado grande: §f${total}§c (máx §f${MAX_BLOCKS}§c).`);
  }
  const dim = player.dimension;
  const changes = [];
  let processed = 0;
  let placed = 0;

  const gen = (function* () {
    for (let i = 1; i <= n; i++) {
      const baseX = ox + dir.x * sizeAlong * i;
      const baseY = oy + dir.y * sizeAlong * i;
      const baseZ = oz + dir.z * sizeAlong * i;
      for (const bl of clip.blocks) {
        const x = baseX + bl.dx;
        const y = baseY + bl.dy;
        const z = baseZ + bl.dz;
        try {
          const block = dim.getBlock({ x, y, z });
          if (block) {
            changes.push({ x, y, z, perm: block.permutation, dim });
            block.setPermutation(bl.perm);
            placed++;
          }
        } catch (e) {}
        processed++;
        if (processed % CHUNK === 0) {
          setProgress(player, "Stack x" + n, processed / total);
          yield;
        }
      }
    }
    pushUndo(player, changes);
    setProgress(player, "Stack x" + n, 1);
    msg(player, `§a[WE] Stack x§f${n}§a: §f${placed}§a bloques colocados.`);
    clearActionBarLater(player);
  })();

  startBlockJob(player, gen);
}

// Rota el portapapeles alrededor del eje Y (90/180/270 grados).
function opRotate(player, degrees) {
  const clip = clipboards.get(player.id);
  if (!clip || clip.blocks.length === 0) {
    return msg(player, "§cPortapapeles vacío. Usa Copy primero.");
  }
  let deg = ((Math.round((degrees || 90) / 90) * 90) % 360 + 360) % 360;
  if (deg === 0) {
    return msg(player, "§eRotación 0°: sin cambios.");
  }
  const sx = clip.sizeX;
  const sz = clip.sizeZ;
  const out = [];
  let nsx = sx;
  let nsz = sz;
  for (const bl of clip.blocks) {
    let ndx;
    let ndz;
    if (deg === 90) {
      ndx = sz - 1 - bl.dz;
      ndz = bl.dx;
      nsx = sz;
      nsz = sx;
    } else if (deg === 180) {
      ndx = sx - 1 - bl.dx;
      ndz = sz - 1 - bl.dz;
    } else {
      // 270
      ndx = bl.dz;
      ndz = sx - 1 - bl.dx;
      nsx = sz;
      nsz = sx;
    }
    out.push({ dx: ndx, dy: bl.dy, dz: ndz, perm: bl.perm });
  }
  clip.blocks = out;
  clip.sizeX = nsx;
  clip.sizeZ = nsz;
  clipboards.set(player.id, clip);
  msg(player, `§a[WE] Portapapeles rotado §f${deg}°§a. Usa Paste para colocarlo.`);
}

// Mueve los bloques de la selección N en una dirección (rellena con aire).
function opMove(player, amount, dirName) {
  if (!bothPos(player)) return needSel(player);
  if (isBusy(player)) return;
  const amt = Math.max(1, Math.min(256, Math.floor(amount) || 1));
  const dir = dirVector(player, dirName);
  const off = { x: dir.x * amt, y: dir.y * amt, z: dir.z * amt };
  const s = getSel(player);
  const b = minMax(s.pos1, s.pos2);
  if (boxVolume(b) > MAX_BLOCKS) {
    return msg(player, `§cSelección demasiado grande para mover.`);
  }
  const dim = player.dimension;
  const air = BlockPermutation.resolve("minecraft:air");
  const captured = []; // {x,y,z,perm}
  const undoMap = new Map(); // "x,y,z" -> perm original
  let processed = 0;
  const phase1 = boxVolume(b);
  const total = phase1 * 3; // leer + limpiar + escribir (aprox)

  const key = (x, y, z) => x + "," + y + "," + z;

  const gen = (function* () {
    // Fase 1: leer origen y guardar undo del origen
    for (let x = b.minX; x <= b.maxX; x++) {
      for (let y = b.minY; y <= b.maxY; y++) {
        for (let z = b.minZ; z <= b.maxZ; z++) {
          try {
            const block = dim.getBlock({ x, y, z });
            if (block) {
              captured.push({ x, y, z, perm: block.permutation });
              undoMap.set(key(x, y, z), block.permutation);
            }
          } catch (e) {}
          processed++;
          if (processed % CHUNK === 0) {
            setProgress(player, "Moviendo", processed / total);
            yield;
          }
        }
      }
    }
    // Fase 2: guardar undo del destino (si no estaba ya)
    for (const c of captured) {
      const dx = c.x + off.x;
      const dy = c.y + off.y;
      const dz = c.z + off.z;
      const k = key(dx, dy, dz);
      if (!undoMap.has(k)) {
        try {
          const block = dim.getBlock({ x: dx, y: dy, z: dz });
          if (block) undoMap.set(k, block.permutation);
        } catch (e) {}
      }
      processed++;
      if (processed % CHUNK === 0) {
        setProgress(player, "Moviendo", processed / total);
        yield;
      }
    }
    // Fase 3a: limpiar origen (aire)
    for (const c of captured) {
      try {
        const block = dim.getBlock({ x: c.x, y: c.y, z: c.z });
        if (block) block.setPermutation(air);
      } catch (e) {}
    }
    // Fase 3b: escribir en destino
    for (const c of captured) {
      const dx = c.x + off.x;
      const dy = c.y + off.y;
      const dz = c.z + off.z;
      try {
        const block = dim.getBlock({ x: dx, y: dy, z: dz });
        if (block) block.setPermutation(c.perm);
      } catch (e) {}
      processed++;
      if (processed % CHUNK === 0) {
        setProgress(player, "Moviendo", processed / total);
        yield;
      }
    }
    // Undo + desplazar selección
    const changes = [];
    for (const [k, perm] of undoMap) {
      const [x, y, z] = k.split(",").map(Number);
      changes.push({ x, y, z, perm, dim });
    }
    pushUndo(player, changes);
    s.pos1 = { x: s.pos1.x + off.x, y: s.pos1.y + off.y, z: s.pos1.z + off.z };
    s.pos2 = { x: s.pos2.x + off.x, y: s.pos2.y + off.y, z: s.pos2.z + off.z };
    setProgress(player, "Moviendo", 1);
    msg(player, `§a[WE] Movido §f${amt}§a bloque(s).`);
    clearActionBarLater(player);
  })();

  startBlockJob(player, gen);
}

/* ------------------------------------------------------------------ */
/*  Expand / Contract                                                  */
/* ------------------------------------------------------------------ */
function reSelect(player, b) {
  const s = getSel(player) || {};
  s.pos1 = { x: b.minX, y: b.minY, z: b.minZ };
  s.pos2 = { x: b.maxX, y: b.maxY, z: b.maxZ };
  selections.set(player.id, s);
}

function opExpand(player, amount, dirName) {
  if (!bothPos(player)) return needSel(player);
  const amt = Math.max(1, Math.min(256, Math.floor(amount) || 1));
  const dir = dirVector(player, dirName);
  const s = getSel(player);
  const b = minMax(s.pos1, s.pos2);
  if (dir.x > 0) b.maxX += amt;
  else if (dir.x < 0) b.minX -= amt;
  if (dir.y > 0) b.maxY += amt;
  else if (dir.y < 0) b.minY -= amt;
  if (dir.z > 0) b.maxZ += amt;
  else if (dir.z < 0) b.minZ -= amt;
  reSelect(player, b);
  msg(player, `§a[WE] Selección expandida §f${amt}§a. Nuevo tamaño: §f${b.maxX - b.minX + 1}x${b.maxY - b.minY + 1}x${b.maxZ - b.minZ + 1}`);
}

function opContract(player, amount, dirName) {
  if (!bothPos(player)) return needSel(player);
  const amt = Math.max(1, Math.min(256, Math.floor(amount) || 1));
  const dir = dirVector(player, dirName);
  const s = getSel(player);
  const b = minMax(s.pos1, s.pos2);
  if (dir.x > 0) b.maxX = Math.max(b.minX, b.maxX - amt);
  else if (dir.x < 0) b.minX = Math.min(b.maxX, b.minX + amt);
  if (dir.y > 0) b.maxY = Math.max(b.minY, b.maxY - amt);
  else if (dir.y < 0) b.minY = Math.min(b.maxY, b.minY + amt);
  if (dir.z > 0) b.maxZ = Math.max(b.minZ, b.maxZ - amt);
  else if (dir.z < 0) b.minZ = Math.min(b.maxZ, b.minZ + amt);
  reSelect(player, b);
  msg(player, `§a[WE] Selección contraída §f${amt}§a. Nuevo tamaño: §f${b.maxX - b.minX + 1}x${b.maxY - b.minY + 1}x${b.maxZ - b.minZ + 1}`);
}

function opSize(player) {
  const s = getSel(player);
  if (!s || !s.pos1 || !s.pos2) {
    return msg(
      player,
      "§eSelección incompleta. POS1: " +
        (s && s.pos1 ? fmt(s.pos1) : "§c—") +
        " §ePOS2: " +
        (s && s.pos2 ? fmt(s.pos2) : "§c—")
    );
  }
  const b = minMax(s.pos1, s.pos2);
  msg(player, "§b[WE] Selección:");
  msg(player, `  §7POS1: §f${fmt(s.pos1)}`);
  msg(player, `  §7POS2: §f${fmt(s.pos2)}`);
  msg(player, `  §7Tamaño: §f${b.maxX - b.minX + 1} x ${b.maxY - b.minY + 1} x ${b.maxZ - b.minZ + 1}`);
  msg(player, `  §7Volumen: §f${boxVolume(b)}§7 bloques`);
}

/* ------------------------------------------------------------------ */
/*  Helpers de mensajes / direcciones                                  */
/* ------------------------------------------------------------------ */
function needSel(player) {
  msg(player, "§cMarca POS1 y POS2 primero (varita: tocar=POS1, romper=POS2).");
}
function badBlock(player, name) {
  msg(player, `§cBloque inválido: §f${name}`);
}

function facingCardinal(player) {
  let v = { x: 0, y: 0, z: 1 };
  try {
    v = player.getViewDirection();
  } catch (e) {}
  if (Math.abs(v.x) >= Math.abs(v.z)) {
    return v.x >= 0 ? { x: 1, y: 0, z: 0 } : { x: -1, y: 0, z: 0 };
  }
  return v.z >= 0 ? { x: 0, y: 0, z: 1 } : { x: 0, y: 0, z: -1 };
}

function dirVector(player, name) {
  if (!name) return facingCardinal(player);
  switch (String(name).toLowerCase()) {
    case "up":
    case "arriba":
      return { x: 0, y: 1, z: 0 };
    case "down":
    case "abajo":
      return { x: 0, y: -1, z: 0 };
    case "north":
    case "norte":
      return { x: 0, y: 0, z: -1 };
    case "south":
    case "sur":
      return { x: 0, y: 0, z: 1 };
    case "east":
    case "este":
      return { x: 1, y: 0, z: 0 };
    case "west":
    case "oeste":
      return { x: -1, y: 0, z: 0 };
    case "back":
    case "atras": {
      const f = facingCardinal(player);
      return { x: -f.x, y: -f.y, z: -f.z };
    }
    default:
      return facingCardinal(player);
  }
}

/* ------------------------------------------------------------------ */
/*  Selección con la varita                                            */
/* ------------------------------------------------------------------ */
function getMainhandId(player) {
  try {
    const eq = player.getComponent("minecraft:equippable");
    if (eq && typeof eq.getEquipment === "function") {
      const it = eq.getEquipment("Mainhand");
      if (it) return it.typeId;
    }
  } catch (e) {}
  try {
    const inv = player.getComponent("minecraft:inventory");
    const slot = player.selectedSlotIndex ?? player.selectedSlot ?? 0;
    const it = inv && inv.container ? inv.container.getItem(slot) : undefined;
    if (it) return it.typeId;
  } catch (e) {}
  return undefined;
}

function setPos1(player, loc) {
  let s = selections.get(player.id);
  if (!s) {
    s = {};
    selections.set(player.id, s);
  }
  s.pos1 = { x: loc.x, y: loc.y, z: loc.z };
  boxHidden.delete(player.id);
  msg(player, `§d[WE] §aPOS1 §7→ §f${fmt(s.pos1)}`);
}

function setPos2(player, loc) {
  let s = selections.get(player.id);
  if (!s) {
    s = {};
    selections.set(player.id, s);
  }
  s.pos2 = { x: loc.x, y: loc.y, z: loc.z };
  boxHidden.delete(player.id);
  msg(player, `§d[WE] §bPOS2 §7→ §f${fmt(s.pos2)}`);
}

function toggleBox(player) {
  if (boxHidden.has(player.id)) {
    boxHidden.delete(player.id);
    msg(player, "§a[WE] Caja de selección: §fVISIBLE");
  } else {
    boxHidden.add(player.id);
    msg(player, "§a[WE] Caja de selección: §fOCULTA");
  }
}

/* ------------------------------------------------------------------ */
/*  Items                                                              */
/* ------------------------------------------------------------------ */
function giveKit(player) {
  // Solo entrega las HERRAMIENTAS (varita + item de menú). Ya no entrega
  // bloques: los bloques los consigue/pone el jugador por su cuenta.
  const inv = player.getComponent("minecraft:inventory");
  if (!inv || !inv.container) return;
  giveMenuItem(player, true);
  try {
    inv.container.addItem(new ItemStack(WAND, 1));
  } catch (e) {}
  msg(player, "§a[WE] §fHerramientas entregadas. §7Varita=hacha · Menú=brújula");
}

function giveWand(player) {
  const inv = player.getComponent("minecraft:inventory");
  if (!inv || !inv.container) return;
  try {
    inv.container.addItem(new ItemStack(WAND, 1));
    msg(player, "§a[WE] §fVarita entregada (hacha de madera).");
    msg(player, "§7Tocar = §aPOS1§7 · Romper = §bPOS2 · Agacharse+usar = menú");
  } catch (e) {}
}

function giveMenuItem(player, silent) {
  const inv = player.getComponent("minecraft:inventory");
  if (!inv || !inv.container) return;
  try {
    const it = new ItemStack(MENU_ITEM, 1);
    try {
      it.nameTag = "§b§lWorldEdit Menú";
    } catch (e) {}
    try {
      it.setLore(["§7Úsala para abrir", "§7el menú de WorldEdit"]);
    } catch (e) {}
    inv.container.addItem(it);
    if (!silent) {
      msg(player, "§a[WE] §fItem de menú entregado (brújula). Úsalo para abrir el menú.");
    }
  } catch (e) {}
}

/* ------------------------------------------------------------------ */
/*  Caja de partículas 3D (patrón punteado - - - -)                    */
/* ------------------------------------------------------------------ */
function spawnP(dim, id, x, y, z) {
  try {
    dim.spawnParticle(id, { x, y, z });
  } catch (e) {}
}

// Dibuja una arista punteada entre A y B.
function drawDashedEdge(dim, ax, ay, az, bx, by, bz) {
  const dx = bx - ax;
  const dy = by - ay;
  const dz = bz - az;
  const len = Math.sqrt(dx * dx + dy * dy + dz * dz);
  if (len === 0) return;
  const maxPoints = 80;
  let step = 0.25;
  if (len / step > maxPoints) step = len / maxPoints;
  const ux = dx / len;
  const uy = dy / len;
  const uz = dz / len;
  const dash = 0.5; // longitud de raya y de hueco
  for (let t = 0; t <= len; t += step) {
    // patrón "- - - -": dibuja media unidad, salta media unidad
    if (Math.floor(t / dash) % 2 === 0) {
      spawnP(dim, PARTICLE_EDGE, ax + ux * t, ay + uy * t, az + uz * t);
    }
  }
}

function drawSelectionBox(player) {
  const s = getSel(player);
  if (!s || !s.pos1 || !s.pos2) return;
  if (boxHidden.has(player.id)) return;
  const dim = player.dimension;
  const b = minMax(s.pos1, s.pos2);
  // límites exteriores (los bloques ocupan de min a max+1)
  const x0 = b.minX;
  const x1 = b.maxX + 1;
  const y0 = b.minY;
  const y1 = b.maxY + 1;
  const z0 = b.minZ;
  const z1 = b.maxZ + 1;

  // No dibujar si está demasiado lejos (rendimiento)
  const pc = player.location;
  const cx = (x0 + x1) / 2;
  const cy = (y0 + y1) / 2;
  const cz = (z0 + z1) / 2;
  const distSq = (pc.x - cx) ** 2 + (pc.y - cy) ** 2 + (pc.z - cz) ** 2;
  if (distSq > 110 * 110) return;

  // 12 aristas del cubo
  // inferiores (y0)
  drawDashedEdge(dim, x0, y0, z0, x1, y0, z0);
  drawDashedEdge(dim, x0, y0, z1, x1, y0, z1);
  drawDashedEdge(dim, x0, y0, z0, x0, y0, z1);
  drawDashedEdge(dim, x1, y0, z0, x1, y0, z1);
  // superiores (y1)
  drawDashedEdge(dim, x0, y1, z0, x1, y1, z0);
  drawDashedEdge(dim, x0, y1, z1, x1, y1, z1);
  drawDashedEdge(dim, x0, y1, z0, x0, y1, z1);
  drawDashedEdge(dim, x1, y1, z0, x1, y1, z1);
  // verticales
  drawDashedEdge(dim, x0, y0, z0, x0, y1, z0);
  drawDashedEdge(dim, x1, y0, z0, x1, y1, z0);
  drawDashedEdge(dim, x0, y0, z1, x0, y1, z1);
  drawDashedEdge(dim, x1, y0, z1, x1, y1, z1);

  // marcadores de esquina: POS1 verde, POS2 naranja
  spawnP(dim, PARTICLE_POS1, s.pos1.x + 0.5, s.pos1.y + 0.5, s.pos1.z + 0.5);
  spawnP(dim, PARTICLE_POS2, s.pos2.x + 0.5, s.pos2.y + 0.5, s.pos2.z + 0.5);
}

/* ------------------------------------------------------------------ */
/*  Operaciones nuevas (v0.5): Hollow, Cone, Line                      */
/* ------------------------------------------------------------------ */

// Ahueca la selección: deja una cáscara de 1 bloque y vacía el interior.
function opHollow(player) {
  if (!bothPos(player)) return needSel(player);
  const air = BlockPermutation.resolve("minecraft:air");
  const s = getSel(player);
  const b = minMax(s.pos1, s.pos2);
  fillRegion(
    player,
    b,
    (x, y, z) =>
      x > b.minX &&
      x < b.maxX &&
      y > b.minY &&
      y < b.maxY &&
      z > b.minZ &&
      z < b.maxZ
        ? air
        : null,
    "Ahuecando"
  );
}

// Cono (como la pirámide pero circular), centrado en ti.
function opCone(player, blockName, radius, height, hollow, center) {
  const perm = resolvePerm(blockName);
  if (!perm) return badBlock(player, blockName);
  const r = Math.max(1, Math.min(40, Math.floor(radius)));
  const h = Math.max(1, Math.min(160, Math.floor(height)));
  const c = center || toBlockLoc(player.location);
  const b = {
    minX: c.x - r,
    maxX: c.x + r,
    minY: c.y,
    maxY: c.y + h - 1,
    minZ: c.z - r,
    maxZ: c.z + r,
  };
  fillRegion(
    player,
    b,
    (x, y, z) => {
      const t = (y - c.y) / h; // 0 en la base, ~1 en la punta
      const rad = r * (1 - t);
      if (rad <= 0) return null;
      const d = Math.sqrt((x - c.x) ** 2 + (z - c.z) ** 2);
      if (d > rad + 0.5) return null;
      if (hollow && d < rad - 0.5) return null;
      return perm;
    },
    "Cono"
  );
}

// Línea 3D (Bresenham) entre POS1 y POS2.
function line3D(p1, p2) {
  const points = [];
  let x = p1.x,
    y = p1.y,
    z = p1.z;
  const dx = Math.abs(p2.x - x),
    dy = Math.abs(p2.y - y),
    dz = Math.abs(p2.z - z);
  const sx = p2.x > x ? 1 : -1,
    sy = p2.y > y ? 1 : -1,
    sz = p2.z > z ? 1 : -1;
  if (dx >= dy && dx >= dz) {
    let e1 = 2 * dy - dx,
      e2 = 2 * dz - dx;
    while (true) {
      points.push({ x, y, z });
      if (x === p2.x) break;
      if (e1 >= 0) {
        y += sy;
        e1 -= 2 * dx;
      }
      if (e2 >= 0) {
        z += sz;
        e2 -= 2 * dx;
      }
      e1 += 2 * dy;
      e2 += 2 * dz;
      x += sx;
    }
  } else if (dy >= dx && dy >= dz) {
    let e1 = 2 * dx - dy,
      e2 = 2 * dz - dy;
    while (true) {
      points.push({ x, y, z });
      if (y === p2.y) break;
      if (e1 >= 0) {
        x += sx;
        e1 -= 2 * dy;
      }
      if (e2 >= 0) {
        z += sz;
        e2 -= 2 * dy;
      }
      e1 += 2 * dx;
      e2 += 2 * dz;
      y += sy;
    }
  } else {
    let e1 = 2 * dy - dz,
      e2 = 2 * dx - dz;
    while (true) {
      points.push({ x, y, z });
      if (z === p2.z) break;
      if (e1 >= 0) {
        y += sy;
        e1 -= 2 * dz;
      }
      if (e2 >= 0) {
        x += sx;
        e2 -= 2 * dz;
      }
      e1 += 2 * dy;
      e2 += 2 * dx;
      z += sz;
    }
  }
  return points;
}

// Aplica una permutación a una lista de puntos (con progreso + undo).
function applyPoints(player, points, perm, label) {
  if (isBusy(player)) return;
  if (points.length === 0) return;
  if (points.length > MAX_BLOCKS) {
    return msg(
      player,
      `§cDemasiado grande: §f${points.length}§c (máx §f${MAX_BLOCKS}§c).`
    );
  }
  const dim = player.dimension;
  const changes = [];
  let processed = 0;
  let placed = 0;
  const total = points.length;
  const gen = (function* () {
    for (const p of points) {
      try {
        const block = dim.getBlock(p);
        if (block) {
          changes.push({ x: p.x, y: p.y, z: p.z, perm: block.permutation, dim });
          block.setPermutation(perm);
          placed++;
        }
      } catch (e) {}
      processed++;
      if (processed % CHUNK === 0) {
        setProgress(player, label, processed / total);
        yield;
      }
    }
    pushUndo(player, changes);
    setProgress(player, label, 1);
    msg(player, `§a[WE] ${label}: §f${placed}§a bloques.`);
    clearActionBarLater(player);
  })();
  startBlockJob(player, gen);
}

function opLine(player, blockName) {
  if (!bothPos(player)) return needSel(player);
  const perm = resolvePerm(blockName);
  if (!perm) return badBlock(player, blockName);
  const s = getSel(player);
  applyPoints(player, line3D(s.pos1, s.pos2), perm, "Línea");
}

/* ------------------------------------------------------------------ */
/*  Formularios (UI)                                                   */
/* ------------------------------------------------------------------ */
async function openMenu(player) {
  if (!player.hasTag(TAG)) {
    return msg(player, "§cActiva WorldEdit con §e/tag @p add worldedit§c.");
  }
  await showActionMenu(
    player,
    "§b§lWorldEdit §r§6\u26bd",
    "§7Selecciona una categoría:",
    [
      { label: "§a§lConstruir", icon: "set", run: () => buildMenu(player) },
      { label: "§d§lFormas", icon: "sphere", run: () => shapesMenu(player) },
      { label: "§6§lTerreno", icon: "naturalize", run: () => terrainMenu(player) },
      { label: "§e§lPortapapeles", icon: "copy", run: () => clipboardMenu(player) },
      { label: "§b§lSelección", icon: "pos1", run: () => selectionMenu(player) },
      { label: "§3§lHerramientas", icon: "tools", run: () => toolsMenu(player) },
      { label: "§6§l\u26bd FIFA 2026", icon: "fifa", run: () => fifaMenu(player) },
      { label: "§5§l\u2728 Próximamente", icon: "soon", run: () => comingSoonMenu(player) },
      { label: "§f§lAyuda", icon: "help", run: () => helpForm(player) },
    ]
  );
}

// Constructor genérico de menús de acción (ActionForm) con estilo custom.
// El prefijo "[we]" activa la skin del resource pack; items = [{label, icon, run}].
const ICON = "textures/custom_ui/icons/";
async function showActionMenu(player, title, body, items) {
  const form = new ActionFormData().title("[we]" + title).body(body || "");
  for (const it of items) {
    if (it.icon) form.button(it.label, ICON + it.icon);
    else form.button(it.label);
  }
  const res = await showForm(player, form);
  if (!res || res.canceled) return;
  const it = items[res.selection];
  if (it && it.run) await it.run();
}

async function buildMenu(player) {
  await showActionMenu(player, "§a§lConstruir", "§7Operaciones de bloques:", [
    { label: "Rellenar", icon: "set", run: () => pickBlockThen(player, "Rellenar", (b) => opSet(player, b)) },
    { label: "Reemplazar", icon: "replace", run: () => replaceForm(player) },
    { label: "Paredes", icon: "walls", run: () => pickBlockThen(player, "Paredes", (b) => opWalls(player, b)) },
    { label: "Contorno", icon: "outline", run: () => pickBlockThen(player, "Contorno", (b) => opFaces(player, b)) },
    { label: "§9Ahuecar", icon: "hollow", run: () => opHollow(player) },
    { label: "Línea", icon: "line", run: () => lineForm(player) },
    { label: "§cVaciar", icon: "clear", run: () => opClear(player) },
    { label: "§8\u2b05 Volver", icon: "back", run: () => openMenu(player) },
  ]);
}

async function shapesMenu(player) {
  await showActionMenu(player, "§d§lFormas", "§7Figuras geométricas:", [
    { label: "Esfera", icon: "sphere", run: () => sphereForm(player) },
    { label: "§9Esfera hueca", icon: "hsphere", run: () => hsphereForm(player) },
    { label: "Cilindro", icon: "cylinder", run: () => cylinderForm(player) },
    { label: "Cono", icon: "cone", run: () => coneForm(player) },
    { label: "Pirámide", icon: "pyramid", run: () => pyramidForm(player) },
    { label: "§6Constructor de Formas", icon: "wand", run: () => builderForm(player) },
    { label: "§8\u2b05 Volver", icon: "back", run: () => openMenu(player) },
  ]);
}

async function terrainMenu(player) {
  await showActionMenu(player, "§6§lTerreno", "§7Modela el terreno:", [
    { label: "Naturalizar", icon: "naturalize", run: () => opNaturalize(player) },
    { label: "Suavizar", icon: "smooth", run: () => smoothForm(player) },
    { label: "§3Drenar", icon: "drain", run: () => drainForm(player) },
    { label: "§8\u2b05 Volver", icon: "back", run: () => openMenu(player) },
  ]);
}

async function clipboardMenu(player) {
  await showActionMenu(player, "§e§lPortapapeles", "§7Copiar, pegar y transformar:", [
    { label: "Copiar", icon: "copy", run: () => opCopy(player) },
    { label: "Pegar", icon: "paste", run: () => opPaste(player) },
    { label: "Multiplicar", icon: "stack", run: () => stackForm(player) },
    { label: "Rotar", icon: "rotate", run: () => rotateForm(player) },
    { label: "Mover", icon: "move", run: () => moveForm(player) },
    { label: "§8\u2b05 Volver", icon: "back", run: () => openMenu(player) },
  ]);
}

async function selectionMenu(player) {
  await showActionMenu(player, "§b§lSelección", "§7Define y ajusta tu zona:", [
    { label: "§aMarcar POS1 (aquí)", icon: "pos1", run: () => setPos1(player, toBlockLoc(player.location)) },
    { label: "§aMarcar POS2 (aquí)", icon: "pos2", run: () => setPos2(player, toBlockLoc(player.location)) },
    { label: "Expandir", icon: "expand", run: () => expandForm(player) },
    { label: "Contraer", icon: "contract", run: () => contractForm(player) },
    { label: "§bSubir", icon: "up", run: () => upForm(player) },
    { label: "Info", icon: "info", run: () => opSize(player) },
    { label: "Caja on/off", icon: "box", run: () => toggleBox(player) },
    { label: "§eDeshacer", icon: "undo", run: () => doUndo(player) },
    { label: "§8\u2b05 Volver", icon: "back", run: () => openMenu(player) },
  ]);
}

async function toolsMenu(player) {
  await showActionMenu(player, "§3§lHerramientas", "§7Objetos del addon:", [
    { label: "Obtener herramientas", icon: "tools", run: () => giveKit(player) },
    { label: "Item de menú (brújula)", icon: "compass", run: () => giveMenuItem(player) },
    { label: "Varita (hacha)", icon: "wand", run: () => giveWand(player) },
    { label: "§6Constructor de Formas", icon: "wand", run: () => builderForm(player) },
    { label: "§8\u2b05 Volver", icon: "back", run: () => openMenu(player) },
  ]);
}

async function comingSoonMenu(player) {
  await showActionMenu(
    player,
    "§5§l\u2728 Próximamente",
    "§7Muy pronto, §f2 ediciones exclusivas§7:\n\n§6\u2728 §c§lHalloween Edition§r §7— terror, calabazas y estructuras.\n§6\u2728 §a§lChristmas Edition§r §7— nieve, regalos y árboles.\n\n§8¡Atento a las próximas versiones!",
    [
      { label: "§c\u2728 Halloween Edition (pronto)", icon: "soon", run: () => msg(player, "§c\u2728 Halloween Edition §7— ¡muy pronto!") },
      { label: "§a\u2728 Christmas Edition (pronto)", icon: "soon", run: () => msg(player, "§a\u2728 Christmas Edition §7— ¡muy pronto!") },
      { label: "§8\u2b05 Volver", icon: "back", run: () => openMenu(player) },
    ]
  );
}

/* Constructor de Formas (item BUILDER): configura una forma y constrúyela donde mires. */
async function builderForm(player) {
  const shapes = ["Esfera", "Esfera hueca", "Cilindro", "Cono", "Pirámide"];
  const ids = ["sphere", "hsphere", "cylinder", "cone", "pyramid"];
  const form = new ModalFormData()
    .title("§lConstructor de Formas")
    .dropdown("Forma", shapes, 0)
    .dropdown("Bloque", COMMON_BLOCKS, 0)
    .textField("…o bloque personalizado", "ej: glass")
    .slider("Radio / tamaño", 1, 40, 1, 5)
    .slider("Altura (cilindro/cono)", 1, 100, 1, 8)
    .toggle("Hueco (donde aplique)", false);
  const res = await showForm(player, form);
  if (!res || res.canceled) return;
  const [shapeIdx, blkIdx, custom, radius, height, hollow] = res.formValues;
  const block = custom && custom.trim() ? custom.trim() : COMMON_BLOCKS[blkIdx];
  let shape = ids[shapeIdx];
  let hol = !!hollow;
  if (shape === "hsphere") {
    shape = "sphere";
    hol = true;
  }
  builderConfig.set(player.id, { shape, block, radius, height, hollow: hol });
  giveBuilder(player);
  msg(
    player,
    `§a[WE] Constructor listo: §f${shapes[shapeIdx]}§a (§f${block}§a). ` +
      "Usa el §6Constructor de Formas §apara construir donde mires."
  );
}

function giveBuilder(player) {
  const inv = player.getComponent("minecraft:inventory");
  if (!inv || !inv.container) return;
  try {
    const it = new ItemStack(BUILDER, 1);
    it.nameTag = "§r§6Constructor de Formas";
    inv.container.addItem(it);
  } catch (e) {}
}

function buildWithTool(player) {
  const cfg =
    builderConfig.get(player.id) || {
      shape: "sphere",
      block: "stone",
      radius: 5,
      height: 8,
      hollow: false,
    };
  let center = null;
  try {
    const hit = player.getBlockFromViewDirection({ maxDistance: 96 });
    const blk = hit && (hit.block || hit);
    if (blk && blk.location) {
      center = { x: blk.location.x, y: blk.location.y, z: blk.location.z };
    }
  } catch (e) {}
  if (!center) center = toBlockLoc(player.location);
  switch (cfg.shape) {
    case "cylinder": opCylinder(player, cfg.block, cfg.radius, cfg.height, cfg.hollow, center); break;
    case "cone": opCone(player, cfg.block, cfg.radius, cfg.height, cfg.hollow, center); break;
    case "pyramid": opPyramid(player, cfg.block, cfg.radius, center); break;
    default: opSphere(player, cfg.block, cfg.radius, cfg.hollow, center);
  }
}

async function pickBlockThen(player, title, callback) {
  const form = new ModalFormData()
    .title("§l" + title)
    .dropdown("Bloque común", COMMON_BLOCKS, 0)
    .textField("Bloque personalizado (opcional)", "ej: oak_log, lapis_block");
  const res = await showForm(player, form);
  if (!res || res.canceled) return;
  const [idx, custom] = res.formValues;
  const blk = custom && custom.trim() ? custom.trim() : COMMON_BLOCKS[idx];
  callback(blk);
}

async function fifaMenu(player) {
  if (!player.hasTag(TAG)) {
    return msg(player, "§cActiva WorldEdit con §e/tag @p add worldedit§c.");
  }
  const keys = Object.keys(FIFA_FLAGS);
  const form = new ActionFormData()
    .title("[we]§6§l\u26bd FIFA World Cup 2026")
    .body(
      "§7Elige un país y se construirá su bandera §fmirando hacia donde apuntas§7.\n§8" +
        keys.length +
        " países · usa §7§oDeshacer§8 para revertir."
    );
  for (const k of keys) {
    form.button("§f" + FIFA_FLAGS[k].name, "textures/custom_ui/flags/" + k);
  }
  form.button("§8\u2b05 Volver", "textures/custom_ui/icons/back");
  const res = await showForm(player, form);
  if (!res || res.canceled) return;
  if (res.selection === keys.length) return openMenu(player);
  const key = keys[res.selection];
  if (key) opFlag(player, key, 1);
}

async function replaceForm(player) {
  const form = new ModalFormData()
    .title("§lReplace / Reemplazar")
    .dropdown("Bloque a reemplazar (de)", COMMON_BLOCKS, 1)
    .textField("…o escribe el bloque (de)", "ej: dirt")
    .dropdown("Bloque nuevo (a)", COMMON_BLOCKS, 0)
    .textField("…o escribe el bloque (a)", "ej: stone");
  const res = await showForm(player, form);
  if (!res || res.canceled) return;
  const [fIdx, fCustom, tIdx, tCustom] = res.formValues;
  const from = fCustom && fCustom.trim() ? fCustom.trim() : COMMON_BLOCKS[fIdx];
  const to = tCustom && tCustom.trim() ? tCustom.trim() : COMMON_BLOCKS[tIdx];
  opReplace(player, from, to);
}

async function sphereForm(player) {
  const form = new ModalFormData()
    .title("§lSphere / Esfera")
    .dropdown("Bloque", COMMON_BLOCKS, 0)
    .textField("…o bloque personalizado", "ej: glass")
    .slider("Radio", 1, 40, 1, 4)
    .toggle("Hueca (hollow)", false);
  const res = await showForm(player, form);
  if (!res || res.canceled) return;
  const [idx, custom, radius, hollow] = res.formValues;
  const blk = custom && custom.trim() ? custom.trim() : COMMON_BLOCKS[idx];
  opSphere(player, blk, radius, hollow);
}

async function hsphereForm(player) {
  const form = new ModalFormData()
    .title("§lHSphere / Esfera hueca")
    .dropdown("Bloque", COMMON_BLOCKS, 0)
    .textField("…o bloque personalizado", "ej: glass")
    .slider("Radio", 1, 40, 1, 6);
  const res = await showForm(player, form);
  if (!res || res.canceled) return;
  const [idx, custom, radius] = res.formValues;
  const blk = custom && custom.trim() ? custom.trim() : COMMON_BLOCKS[idx];
  opHSphere(player, blk, radius);
}

async function smoothForm(player) {
  const form = new ModalFormData()
    .title("§lSmooth / Suavizar")
    .slider("Iteraciones (intensidad)", 1, 10, 1, 2);
  const res = await showForm(player, form);
  if (!res || res.canceled) return;
  const [iters] = res.formValues;
  opSmooth(player, iters);
}

async function drainForm(player) {
  const form = new ModalFormData()
    .title("§lDrain / Drenar")
    .slider("Radio", 1, 40, 1, 6);
  const res = await showForm(player, form);
  if (!res || res.canceled) return;
  const [radius] = res.formValues;
  opDrain(player, radius);
}

async function cylinderForm(player) {
  const form = new ModalFormData()
    .title("§lCylinder / Cilindro")
    .dropdown("Bloque", COMMON_BLOCKS, 0)
    .textField("…o bloque personalizado", "ej: stone")
    .slider("Radio", 1, 40, 1, 4)
    .slider("Altura", 1, 100, 1, 4)
    .toggle("Hueco (hollow)", false);
  const res = await showForm(player, form);
  if (!res || res.canceled) return;
  const [idx, custom, radius, height, hollow] = res.formValues;
  const blk = custom && custom.trim() ? custom.trim() : COMMON_BLOCKS[idx];
  opCylinder(player, blk, radius, height, hollow);
}

async function pyramidForm(player) {
  const form = new ModalFormData()
    .title("§lPyramid / Pirámide")
    .dropdown("Bloque", COMMON_BLOCKS, 0)
    .textField("…o bloque personalizado", "ej: sandstone")
    .slider("Tamaño (base)", 1, 50, 1, 5);
  const res = await showForm(player, form);
  if (!res || res.canceled) return;
  const [idx, custom, size] = res.formValues;
  const blk = custom && custom.trim() ? custom.trim() : COMMON_BLOCKS[idx];
  opPyramid(player, blk, size);
}

async function coneForm(player) {
  const form = new ModalFormData()
    .title("§lCone / Cono")
    .dropdown("Bloque", COMMON_BLOCKS, 0)
    .textField("…o bloque personalizado", "ej: quartz_block")
    .slider("Radio (base)", 1, 40, 1, 5)
    .slider("Altura", 1, 100, 1, 8)
    .toggle("Hueco (hollow)", false);
  const res = await showForm(player, form);
  if (!res || res.canceled) return;
  const [idx, custom, radius, height, hollow] = res.formValues;
  const blk = custom && custom.trim() ? custom.trim() : COMMON_BLOCKS[idx];
  opCone(player, blk, radius, height, hollow);
}

async function lineForm(player) {
  if (!bothPos(player)) return needSel(player);
  const form = new ModalFormData()
    .title("§lLine / Línea")
    .dropdown("Bloque", COMMON_BLOCKS, 0)
    .textField("…o bloque personalizado", "ej: glowstone");
  const res = await showForm(player, form);
  if (!res || res.canceled) return;
  const [idx, custom] = res.formValues;
  const blk = custom && custom.trim() ? custom.trim() : COMMON_BLOCKS[idx];
  opLine(player, blk);
}

async function upForm(player) {
  const form = new ModalFormData()
    .title("§lUp / Subir")
    .slider("Bloques a subir", 1, 64, 1, 1);
  const res = await showForm(player, form);
  if (!res || res.canceled) return;
  opUp(player, res.formValues[0]);
}

async function stackForm(player) {
  const form = new ModalFormData()
    .title("§lStack / Multiplicar")
    .slider("Cantidad (copias)", 1, 32, 1, 2)
    .dropdown("Dirección", DIR_LABELS, 0);
  const res = await showForm(player, form);
  if (!res || res.canceled) return;
  const [count, dirIdx] = res.formValues;
  opStack(player, count, DIR_NAMES[dirIdx]);
}

async function rotateForm(player) {
  const form = new ModalFormData()
    .title("§lRotate / Rotar")
    .dropdown("Grados", ["90°", "180°", "270°"], 0);
  const res = await showForm(player, form);
  if (!res || res.canceled) return;
  const deg = [90, 180, 270][res.formValues[0]];
  opRotate(player, deg);
}

async function moveForm(player) {
  const form = new ModalFormData()
    .title("§lMove / Mover")
    .slider("Distancia", 1, 64, 1, 1)
    .dropdown("Dirección", DIR_LABELS, 0);
  const res = await showForm(player, form);
  if (!res || res.canceled) return;
  const [amt, dirIdx] = res.formValues;
  opMove(player, amt, DIR_NAMES[dirIdx]);
}

async function expandForm(player) {
  const form = new ModalFormData()
    .title("§lExpand / Expandir")
    .slider("Cantidad", 1, 64, 1, 5)
    .dropdown("Dirección", DIR_LABELS, 0);
  const res = await showForm(player, form);
  if (!res || res.canceled) return;
  const [amt, dirIdx] = res.formValues;
  opExpand(player, amt, DIR_NAMES[dirIdx]);
}

async function contractForm(player) {
  const form = new ModalFormData()
    .title("§lContract / Contraer")
    .slider("Cantidad", 1, 64, 1, 5)
    .dropdown("Dirección", DIR_LABELS, 0);
  const res = await showForm(player, form);
  if (!res || res.canceled) return;
  const [amt, dirIdx] = res.formValues;
  opContract(player, amt, DIR_NAMES[dirIdx]);
}

async function helpForm(player) {
  const form = new MessageFormData()
    .title("§b§lWorldEdit · Ayuda")
    .body(HELP_TEXT)
    .button1("Abrir menú")
    .button2("Cerrar");
  const res = await showForm(player, form);
  if (res && !res.canceled && res.selection === 0) {
    await openMenu(player);
  }
}

const HELP_TEXT = [
  "§7Sin comandos de chat. Usa el §bmenú§7 o §b/scriptevent§7.",
  "",
  "§eItem de menú: §fBrújula §7→ úsala para abrir el menú.",
  "§eVarita: §fHacha §7→ tocar=§aPOS1§7, romper=§bPOS2§7, agacharse+usar=menú.",
  "",
  "§b/scriptevent we:menu §7- abrir menú",
  "§b/scriptevent we:set <bloque>",
  "§b/scriptevent we:walls <bloque>",
  "§b/scriptevent we:replace <de> <a>",
  "§b/scriptevent we:sphere <bloque> <radio> [h]",
  "§b/scriptevent we:hsphere <bloque> <radio>",
  "§b/scriptevent we:cone <bloque> <radio> [altura] [h]",
  "§b/scriptevent we:line <bloque> §7(entre POS1 y POS2)",
  "§b/scriptevent we:hollow §7(ahueca la selección)",
  "§a/scriptevent we:naturalize",
  "§a/scriptevent we:smooth [iteraciones]",
  "§a/scriptevent we:drain [radio]",
  "§6/scriptevent we:fifa §7- menú FIFA World Cup 2026",
  "§6/scriptevent we:flag <país> [escala] §7- bandera",
  "§6/scriptevent we:flags §7- lista de países",
  "§b/scriptevent we:copy §7· §bwe:paste",
  "§b/scriptevent we:stack <n> [dir]",
  "§b/scriptevent we:rotate <90|180|270>",
  "§b/scriptevent we:move <n> [dir]",
  "§b/scriptevent we:expand <n> [dir]",
  "§b/scriptevent we:contract <n> [dir]",
  "§b/scriptevent we:undo §7· §bwe:box §7· §bwe:size",
  "",
  "§7dir = north/south/east/west/up/down (o vacío = hacia donde miras)",
].join("\n");

/* ------------------------------------------------------------------ */
/*  Despacho de comandos (solo /scriptevent we:<cmd>)                  */
/* ------------------------------------------------------------------ */
function executeCommand(player, raw) {
  if (!player.hasTag(TAG)) {
    msg(player, "§cWorldEdit no está activado. Ejecuta §e/tag @p add worldedit§c.");
    return;
  }
  const parts = raw.trim().split(/\s+/);
  const cmd = (parts.shift() || "").toLowerCase();
  const args = parts;

  try {
    switch (cmd) {
      case "menu":
      case "gui":
        launch(openMenu(player));
        break;
      case "help":
      case "ayuda":
        launch(helpForm(player));
        break;
      case "kit":
        giveKit(player);
        break;
      case "item":
        giveMenuItem(player);
        break;
      case "wand":
        giveWand(player);
        break;
      case "builder":
      case "tool":
        launch(builderForm(player));
        break;
      case "pos1":
        setPos1(player, toBlockLoc(player.location));
        break;
      case "pos2":
        setPos2(player, toBlockLoc(player.location));
        break;
      case "set":
      case "fill":
        if (!args[0]) return msg(player, "§cUso: we:set <bloque>");
        opSet(player, args[0]);
        break;
      case "walls":
        if (!args[0]) return msg(player, "§cUso: we:walls <bloque>");
        opWalls(player, args[0]);
        break;
      case "outline":
        if (!args[0]) return msg(player, "§cUso: we:outline <bloque>");
        opFaces(player, args[0]);
        break;
      case "replace":
        if (!args[0] || !args[1]) return msg(player, "§cUso: we:replace <de> <a>");
        opReplace(player, args[0], args[1]);
        break;
      case "clear":
      case "delete":
        opClear(player);
        break;
      case "sphere": {
        if (!args[0]) return msg(player, "§cUso: we:sphere <bloque> <radio> [h]");
        const radius = parseInt(args[1]) || 4;
        const hollow = (args[2] || "").toLowerCase().startsWith("h");
        opSphere(player, args[0], radius, hollow);
        break;
      }
      case "hsphere": {
        if (!args[0]) return msg(player, "§cUso: we:hsphere <bloque> <radio>");
        const radius = parseInt(args[1]) || 4;
        opHSphere(player, args[0], radius);
        break;
      }
      case "cyl":
      case "cylinder": {
        if (!args[0]) return msg(player, "§cUso: we:cyl <bloque> <radio> [altura] [h]");
        const radius = parseInt(args[1]) || 4;
        const height = parseInt(args[2]) || 4;
        const hollow = (args[3] || "").toLowerCase().startsWith("h");
        opCylinder(player, args[0], radius, height, hollow);
        break;
      }
      case "pyramid": {
        if (!args[0]) return msg(player, "§cUso: we:pyramid <bloque> <tamaño>");
        opPyramid(player, args[0], parseInt(args[1]) || 5);
        break;
      }
      case "cone": {
        if (!args[0]) return msg(player, "§cUso: we:cone <bloque> <radio> [altura] [h]");
        const radius = parseInt(args[1]) || 5;
        const height = parseInt(args[2]) || 8;
        const hollow = (args[3] || "").toLowerCase().startsWith("h");
        opCone(player, args[0], radius, height, hollow);
        break;
      }
      case "hollow":
        opHollow(player);
        break;
      case "line":
      case "linea":
        if (!args[0]) return msg(player, "§cUso: we:line <bloque> (usa POS1 y POS2)");
        opLine(player, args[0]);
        break;
      case "naturalize":
      case "nat":
        opNaturalize(player);
        break;
      case "smooth": {
        const iters = parseInt(args[0]) || 1;
        opSmooth(player, iters);
        break;
      }
      case "drain": {
        const radius = parseInt(args[0]) || 5;
        opDrain(player, radius);
        break;
      }
      case "flag":
      case "bandera": {
        if (!args[0])
          return msg(player, "§cUso: we:flag <país> [escala 1-3]. Lista: §ewe:flags");
        let scale = 1;
        const parts = args.slice();
        if (parts.length > 1 && /^[1-3]$/.test(parts[parts.length - 1])) {
          scale = parseInt(parts.pop());
        }
        opFlag(player, parts.join(""), scale);
        break;
      }
      case "flags":
      case "banderas":
      case "paises":
        listFlags(player);
        break;
      case "fifa":
      case "wc2026":
      case "worldcup":
        launch(fifaMenu(player));
        break;
      case "copy":
        opCopy(player);
        break;
      case "paste":
        opPaste(player);
        break;
      case "stack":
        opStack(player, parseInt(args[0]) || 1, args[1]);
        break;
      case "rotate":
        opRotate(player, parseInt(args[0]) || 90);
        break;
      case "move":
        opMove(player, parseInt(args[0]) || 1, args[1]);
        break;
      case "expand":
        opExpand(player, parseInt(args[0]) || 1, args[1]);
        break;
      case "contract":
        opContract(player, parseInt(args[0]) || 1, args[1]);
        break;
      case "undo":
        doUndo(player);
        break;
      case "up":
        opUp(player, parseInt(args[0]) || 1);
        break;
      case "box":
        toggleBox(player);
        break;
      case "size":
      case "info":
        opSize(player);
        break;
      default:
        msg(player, `§cComando desconocido: §fwe:${cmd}§c. Usa §ewe:help§c.`);
    }
  } catch (e) {
    msg(player, "§cError: §f" + e);
    console.warn("[WorldEdit] Error en '" + cmd + "': " + e + (e && e.stack ? "\n" + e.stack : ""));
  }
}

/* ------------------------------------------------------------------ */
/*  Eventos (suscripción defensiva)                                    */
/* ------------------------------------------------------------------ */
function safeSub(getSignal, handler, label) {
  try {
    const sig = getSignal();
    if (sig && typeof sig.subscribe === "function") {
      sig.subscribe(handler);
      return true;
    }
  } catch (e) {
    console.warn("[WorldEdit] No se pudo suscribir a " + label + ": " + e);
  }
  return false;
}

/* Comandos por /scriptevent we:<cmd> [args] */
safeSub(
  () => system.afterEvents.scriptEventReceive,
  (ev) => {
    const id = (ev.id || "").toLowerCase();
    if (!id.startsWith("we:") && !id.startsWith("worldedit:")) return;
    const cmd = id.split(":")[1] || "";
    const player = ev.sourceEntity;
    if (!player || player.typeId !== "minecraft:player") return;
    const raw = (cmd + " " + (ev.message || "")).trim();
    executeCommand(player, raw);
  },
  "scriptEventReceive"
);

/* Varita -> POS1 (interactuar / tocar / quitar corteza) */
const interactBeforeOk = safeSub(
  () => world.beforeEvents.playerInteractWithBlock,
  (ev) => {
    const item = ev.itemStack;
    if (!item || item.typeId !== WAND) return;
    const player = ev.player;
    if (!player.hasTag(TAG)) return;
    ev.cancel = true;
    const loc = {
      x: ev.block.location.x,
      y: ev.block.location.y,
      z: ev.block.location.z,
    };
    system.run(() => setPos1(player, loc));
  },
  "playerInteractWithBlock(before)"
);
if (!interactBeforeOk) {
  safeSub(
    () => world.afterEvents.playerInteractWithBlock,
    (ev) => {
      const item = ev.itemStack;
      if (!item || item.typeId !== WAND) return;
      const player = ev.player;
      if (!player.hasTag(TAG)) return;
      const loc = {
        x: ev.block.location.x,
        y: ev.block.location.y,
        z: ev.block.location.z,
      };
      setPos1(player, loc);
    },
    "playerInteractWithBlock(after)"
  );
}

/* Varita -> POS2 (romper / intentar romper) */
const breakBeforeOk = safeSub(
  () => world.beforeEvents.playerBreakBlock,
  (ev) => {
    const item = ev.itemStack;
    if (!item || item.typeId !== WAND) return;
    const player = ev.player;
    if (!player.hasTag(TAG)) return;
    ev.cancel = true;
    const loc = {
      x: ev.block.location.x,
      y: ev.block.location.y,
      z: ev.block.location.z,
    };
    system.run(() => setPos2(player, loc));
  },
  "playerBreakBlock(before)"
);
if (!breakBeforeOk) {
  safeSub(
    () => world.afterEvents.playerBreakBlock,
    (ev) => {
      const player = ev.player;
      const itemId =
        (ev.itemStackBeforeBreak && ev.itemStackBeforeBreak.typeId) ||
        getMainhandId(player);
      if (itemId !== WAND) return;
      if (!player.hasTag(TAG)) return;
      const loc = {
        x: ev.block.location.x,
        y: ev.block.location.y,
        z: ev.block.location.z,
      };
      setPos2(player, loc);
    },
    "playerBreakBlock(after)"
  );
}

/* Item especial (brújula) -> abre el menú; varita agachado -> menú */
safeSub(
  () => world.afterEvents.itemUse,
  (ev) => {
    const item = ev.itemStack;
    const player = ev.source;
    if (!item || !player || player.typeId !== "minecraft:player") return;
    if (!player.hasTag(TAG)) return;
    if (item.typeId === MENU_ITEM) {
      system.run(() => launch(openMenu(player)));
    } else if (item.typeId === WAND && player.isSneaking) {
      system.run(() => launch(openMenu(player)));
    } else if (item.typeId === BUILDER) {
      system.run(() => buildWithTool(player));
    }
  },
  "itemUse"
);

/* Caja de partículas: redibujar periódicamente */
system.runInterval(() => {
  for (const player of world.getAllPlayers()) {
    if (!player.hasTag(TAG)) continue;
    try {
      drawSelectionBox(player);
    } catch (e) {}
  }
}, 8);

/* Activación por tag:  /tag @p add worldedit */
system.runInterval(() => {
  for (const player of world.getAllPlayers()) {
    const has = player.hasTag(TAG);
    const id = player.id;
    if (has && !activated.has(id)) {
      activated.add(id);
      console.warn("[WorldEdit] Activado para " + player.name + ".");
      msg(player, "§b§l========== §r§b§lWorldEdit §6\u26bd§r §b§l==========");
      msg(player, "§a\u2714 Activado correctamente.");
      msg(player, "§7Abre el menú con la §ebrújula§7, o §eagáchate + usa la varita§7.");
      msg(player, "§7También: §e/scriptevent we:menu§7.");
      msg(player, "§7Te entregué la §evarita §7(hacha) y el §emenú §7(brújula). §8Los bloques los pones tú.");
      system.run(() => giveKit(player));
    } else if (!has && activated.has(id)) {
      activated.delete(id);
      boxHidden.delete(id);
      msg(player, "§e[WorldEdit] Desactivado (tag removido).");
    }
  }
}, 20);

/* Mensaje de carga */
system.run(() => {
  console.warn(
    "[WorldEdit] MCPE FIFA World Cup 2026 Edition (v0.6) cargado. " +
      "Actívalo en el mundo con: /tag @p add worldedit"
  );
});

world.afterEvents.playerSpawn.subscribe((ev) => {
  if (!ev.initialSpawn) return;
  const player = ev.player;
  system.runTimeout(() => {
    msg(player, "§b§l== WorldEdit §6\u26bd FIFA World Cup 2026 Edition §b==");
    if (player.hasTag(TAG)) {
      msg(player, "§aActivado. Usa la §ebrújula§a o §e/scriptevent we:menu§a.");
    } else {
      msg(player, "§7Para activar ejecuta: §e/tag @p add worldedit");
    }
  }, 40);
});
