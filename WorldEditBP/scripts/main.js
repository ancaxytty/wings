/*
 * WorldEdit MCPE v0.2
 * Addon de WorldEdit para Minecraft Bedrock / Pocket Edition.
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
 * Activación:  /tag @p worldedit
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

function opSphere(player, blockName, radius, hollow) {
  const perm = resolvePerm(blockName);
  if (!perm) return badBlock(player, blockName);
  const r = Math.max(1, Math.min(40, Math.floor(radius)));
  const c = toBlockLoc(player.location);
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

function opCylinder(player, blockName, radius, height, hollow) {
  const perm = resolvePerm(blockName);
  if (!perm) return badBlock(player, blockName);
  const r = Math.max(1, Math.min(40, Math.floor(radius)));
  const h = Math.max(1, Math.min(160, Math.floor(height)));
  const c = toBlockLoc(player.location);
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

function opPyramid(player, blockName, size) {
  const perm = resolvePerm(blockName);
  if (!perm) return badBlock(player, blockName);
  const s = Math.max(1, Math.min(60, Math.floor(size)));
  const c = toBlockLoc(player.location);
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

function opUp(player, n) {
  const steps = Math.max(1, Math.min(256, Math.floor(n) || 1));
  const c = toBlockLoc(player.location);
  const targetY = c.y + steps;
  try {
    const dim = player.dimension;
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
  const inv = player.getComponent("minecraft:inventory");
  if (!inv || !inv.container) return;
  giveMenuItem(player, true);
  const items = [
    [WAND, 1],
    ["minecraft:stone", 64],
    ["minecraft:cobblestone", 64],
    ["minecraft:oak_planks", 64],
    ["minecraft:glass", 64],
    ["minecraft:white_concrete", 64],
    ["minecraft:sand", 64],
    ["minecraft:dirt", 64],
    ["minecraft:bricks", 64],
    ["minecraft:quartz_block", 64],
    ["minecraft:glowstone", 64],
    ["minecraft:obsidian", 64],
  ];
  for (const [id, amount] of items) {
    try {
      inv.container.addItem(new ItemStack(id, amount));
    } catch (e) {}
  }
  msg(player, "§a[WE] §fKit entregado. §7Varita=hacha · Menú=brújula");
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
/*  Formularios (UI)                                                   */
/* ------------------------------------------------------------------ */
async function openMenu(player) {
  if (!player.hasTag(TAG)) {
    return msg(player, "§cActiva WorldEdit con §e/tag @p worldedit§c.");
  }
  const form = new ActionFormData()
    .title("§b§lWorldEdit MCPE v0.2")
    .body("§7Elige una herramienta:")
    .button("§2Obtener Kit", "textures/items/diamond_pickaxe")
    .button("§2Item de Menú (Brújula)", "textures/items/compass_item")
    .button("§2Varita (Hacha)", "textures/items/wood_axe")
    .button("Set / Rellenar", "textures/blocks/stone")
    .button("Replace / Reemplazar", "textures/blocks/sandstone_normal")
    .button("Walls / Paredes", "textures/blocks/brick")
    .button("Outline / Contorno", "textures/blocks/glass")
    .button("Sphere / Esfera", "textures/items/snowball")
    .button("Cylinder / Cilindro", "textures/blocks/log_oak")
    .button("Pyramid / Pirámide", "textures/blocks/sandstone_carved")
    .button("§cClear / Vaciar", "textures/blocks/barrier")
    .button("Copy / Copiar", "textures/ui/copy")
    .button("Paste / Pegar", "textures/ui/paste")
    .button("Stack / Multiplicar", "textures/ui/MCoin")
    .button("Rotate / Rotar", "textures/ui/refresh")
    .button("Move / Mover", "textures/ui/arrow_right")
    .button("Expand / Expandir", "textures/ui/plus")
    .button("Contract / Contraer", "textures/ui/minus")
    .button("§eUndo / Deshacer", "textures/ui/undo")
    .button("Mostrar/Ocultar caja", "textures/ui/magnifyingGlass")
    .button("Info / Selección", "textures/ui/infobulb")
    .button("Ayuda", "textures/ui/help");

  const res = await showForm(player, form);
  if (!res || res.canceled) return;
  switch (res.selection) {
    case 0: giveKit(player); break;
    case 1: giveMenuItem(player); break;
    case 2: giveWand(player); break;
    case 3: await pickBlockThen(player, "Set / Rellenar", (blk) => opSet(player, blk)); break;
    case 4: await replaceForm(player); break;
    case 5: await pickBlockThen(player, "Walls / Paredes", (blk) => opWalls(player, blk)); break;
    case 6: await pickBlockThen(player, "Outline / Contorno", (blk) => opFaces(player, blk)); break;
    case 7: await sphereForm(player); break;
    case 8: await cylinderForm(player); break;
    case 9: await pyramidForm(player); break;
    case 10: opClear(player); break;
    case 11: opCopy(player); break;
    case 12: opPaste(player); break;
    case 13: await stackForm(player); break;
    case 14: await rotateForm(player); break;
    case 15: await moveForm(player); break;
    case 16: await expandForm(player); break;
    case 17: await contractForm(player); break;
    case 18: doUndo(player); break;
    case 19: toggleBox(player); break;
    case 20: opSize(player); break;
    case 21: await helpForm(player); break;
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
    msg(player, "§cWorldEdit no está activado. Ejecuta §e/tag @p worldedit§c.");
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

/* Activación por tag:  /tag @p worldedit */
system.runInterval(() => {
  for (const player of world.getAllPlayers()) {
    const has = player.hasTag(TAG);
    const id = player.id;
    if (has && !activated.has(id)) {
      activated.add(id);
      console.warn("[WorldEdit] addon activado correctamente para " + player.name);
      msg(player, "§a§l[WorldEdit] §r§aAddon activado correctamente!");
      msg(player, "§7Usa la §ebrújula§7 (item de menú) o §eagáchate + varita§7 para abrir el menú.");
      msg(player, "§7Comandos: §e/scriptevent we:menu§7 , §e/scriptevent we:set stone§7 …");
      msg(player, "§7Te di el §ekit§7. Varita=§ehacha§7, Menú=§ebrújula§7.");
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
  console.warn("[WorldEdit] MCPE v0.2 cargado. Activa con: /tag @p worldedit");
});

world.afterEvents.playerSpawn.subscribe((ev) => {
  if (!ev.initialSpawn) return;
  const player = ev.player;
  system.runTimeout(() => {
    msg(player, "§b§l== WorldEdit MCPE v0.2 ==");
    if (player.hasTag(TAG)) {
      msg(player, "§aActivado. Usa la §ebrújula§a o §e/scriptevent we:menu§a.");
    } else {
      msg(player, "§7Para activar ejecuta: §e/tag @p worldedit");
    }
  }, 40);
});
