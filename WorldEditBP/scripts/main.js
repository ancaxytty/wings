/*
 * WorldEdit MCPE v0.1
 * Addon de WorldEdit para Minecraft Bedrock / Pocket Edition.
 *
 * - Varita: hacha de madera (minecraft:wooden_axe)
 *     * Click derecho / tocar bloque (o quitar la corteza a un tronco) = POS1
 *     * Romper / intentar romper un bloque               = POS2
 * - Comandos de chat con prefijo ";"  (ej: ;set stone)
 * - Formularios (UI) con ;menu
 * - Activación con:  /tag @p worldedit
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
const PREFIX = ";";
const WAND = "minecraft:wooden_axe";
const TAG = "worldedit";
const MAX_BLOCKS = 32768; // límite de bloques por operación (evita crasheos)
const MAX_UNDO = 8; // operaciones guardadas para deshacer

// Bloques comunes para los menús
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

/* ------------------------------------------------------------------ */
/*  Estado por jugador                                                 */
/* ------------------------------------------------------------------ */
const selections = new Map(); // id -> { pos1, pos2 }
const clipboards = new Map(); // id -> { sizeX, sizeY, sizeZ, blocks: [{dx,dy,dz,perm}] }
const undoStacks = new Map(); // id -> [ [{x,y,z,perm,dim}] ]
const activated = new Set(); // ids ya activados (tienen el tag)

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

function regionVolume(p1, p2) {
  const b = minMax(p1, p2);
  return (
    (b.maxX - b.minX + 1) *
    (b.maxY - b.minY + 1) *
    (b.maxZ - b.minZ + 1)
  );
}

function msg(player, text) {
  try {
    player.sendMessage(text);
  } catch (e) {}
}

function sleep(ticks) {
  return new Promise((res) => system.runTimeout(res, ticks));
}

// Lanza una promesa (formularios) sin dejar rechazos sin manejar
function launch(promise) {
  Promise.resolve(promise).catch((e) =>
    console.warn("[WorldEdit] Error de UI: " + e)
  );
}

// Muestra un formulario reintentando si el jugador está ocupado (chat abierto)
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
/*  Operación genérica de relleno con registro de undo                 */
/*  predicate(x,y,z,block) -> BlockPermutation | null (null = saltar)  */
/* ------------------------------------------------------------------ */
function applyRegion(player, dim, b, predicate) {
  const volume =
    (b.maxX - b.minX + 1) * (b.maxY - b.minY + 1) * (b.maxZ - b.minZ + 1);
  if (volume > MAX_BLOCKS) {
    msg(
      player,
      `§cSelección demasiado grande: §f${volume}§c bloques (máx §f${MAX_BLOCKS}§c).`
    );
    return 0;
  }
  const changes = [];
  let count = 0;
  for (let x = b.minX; x <= b.maxX; x++) {
    for (let y = b.minY; y <= b.maxY; y++) {
      for (let z = b.minZ; z <= b.maxZ; z++) {
        try {
          const block = dim.getBlock({ x, y, z });
          if (!block) continue;
          const perm = predicate(x, y, z, block);
          if (!perm) continue;
          changes.push({ x, y, z, perm: block.permutation, dim });
          block.setPermutation(perm);
          count++;
        } catch (e) {}
      }
    }
  }
  pushUndo(player, changes);
  return count;
}

/* ------------------------------------------------------------------ */
/*  Acciones de construcción                                           */
/* ------------------------------------------------------------------ */
function opSet(player, blockName) {
  if (!bothPos(player)) return msg(player, "§cMarca POS1 y POS2 primero (varita o ;pos1 ;pos2).");
  const perm = resolvePerm(blockName);
  if (!perm) return msg(player, `§cBloque inválido: §f${blockName}`);
  const s = getSel(player);
  const b = minMax(s.pos1, s.pos2);
  const n = applyRegion(player, player.dimension, b, () => perm);
  msg(player, `§a[WE] §f${n}§a bloques colocados (§f${blockName}§a).`);
}

function opReplace(player, fromName, toName) {
  if (!bothPos(player)) return msg(player, "§cMarca POS1 y POS2 primero.");
  const fromId = normalizeBlock(fromName);
  const toPerm = resolvePerm(toName);
  if (!fromId) return msg(player, `§cBloque inválido: §f${fromName}`);
  if (!toPerm) return msg(player, `§cBloque inválido: §f${toName}`);
  const s = getSel(player);
  const b = minMax(s.pos1, s.pos2);
  const n = applyRegion(player, player.dimension, b, (x, y, z, block) =>
    block.typeId === fromId ? toPerm : null
  );
  msg(player, `§a[WE] §f${n}§a bloques reemplazados (§f${fromName}§a → §f${toName}§a).`);
}

function opWalls(player, blockName) {
  if (!bothPos(player)) return msg(player, "§cMarca POS1 y POS2 primero.");
  const perm = resolvePerm(blockName);
  if (!perm) return msg(player, `§cBloque inválido: §f${blockName}`);
  const s = getSel(player);
  const b = minMax(s.pos1, s.pos2);
  const n = applyRegion(player, player.dimension, b, (x, y, z) =>
    x === b.minX || x === b.maxX || z === b.minZ || z === b.maxZ ? perm : null
  );
  msg(player, `§a[WE] Paredes creadas: §f${n}§a bloques.`);
}

function opFaces(player, blockName) {
  if (!bothPos(player)) return msg(player, "§cMarca POS1 y POS2 primero.");
  const perm = resolvePerm(blockName);
  if (!perm) return msg(player, `§cBloque inválido: §f${blockName}`);
  const s = getSel(player);
  const b = minMax(s.pos1, s.pos2);
  const n = applyRegion(player, player.dimension, b, (x, y, z) =>
    x === b.minX ||
    x === b.maxX ||
    z === b.minZ ||
    z === b.maxZ ||
    y === b.minY ||
    y === b.maxY
      ? perm
      : null
  );
  msg(player, `§a[WE] Contorno (caras) creado: §f${n}§a bloques.`);
}

function opClear(player) {
  if (!bothPos(player)) return msg(player, "§cMarca POS1 y POS2 primero.");
  const air = BlockPermutation.resolve("minecraft:air");
  const s = getSel(player);
  const b = minMax(s.pos1, s.pos2);
  const n = applyRegion(player, player.dimension, b, () => air);
  msg(player, `§a[WE] Vaciado: §f${n}§a bloques eliminados.`);
}

function opSphere(player, blockName, radius, hollow) {
  const perm = resolvePerm(blockName);
  if (!perm) return msg(player, `§cBloque inválido: §f${blockName}`);
  const r = Math.max(1, Math.min(32, Math.floor(radius)));
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
  const n = applyRegion(player, player.dimension, b, (x, y, z) => {
    const dx = x - c.x;
    const dy = y - c.y;
    const dz = z - c.z;
    const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
    if (d > outer) return null;
    if (hollow && d < inner) return null;
    return perm;
  });
  msg(player, `§a[WE] Esfera creada (r=§f${r}§a): §f${n}§a bloques.`);
}

function opCylinder(player, blockName, radius, height, hollow) {
  const perm = resolvePerm(blockName);
  if (!perm) return msg(player, `§cBloque inválido: §f${blockName}`);
  const r = Math.max(1, Math.min(32, Math.floor(radius)));
  const h = Math.max(1, Math.min(128, Math.floor(height)));
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
  const n = applyRegion(player, player.dimension, b, (x, y, z) => {
    const dx = x - c.x;
    const dz = z - c.z;
    const d = Math.sqrt(dx * dx + dz * dz);
    if (d > outer) return null;
    if (hollow && d < inner) return null;
    return perm;
  });
  msg(player, `§a[WE] Cilindro creado (r=§f${r}§a, h=§f${h}§a): §f${n}§a bloques.`);
}

function opPyramid(player, blockName, size) {
  const perm = resolvePerm(blockName);
  if (!perm) return msg(player, `§cBloque inválido: §f${blockName}`);
  const s = Math.max(1, Math.min(48, Math.floor(size)));
  const c = toBlockLoc(player.location);
  const b = {
    minX: c.x - s,
    maxX: c.x + s,
    minY: c.y,
    maxY: c.y + s - 1,
    minZ: c.z - s,
    maxZ: c.z + s,
  };
  const n = applyRegion(player, player.dimension, b, (x, y, z) => {
    const layer = y - c.y; // 0 .. s-1
    const half = s - 1 - layer;
    if (half < 0) return null;
    if (Math.abs(x - c.x) <= half && Math.abs(z - c.z) <= half) return perm;
    return null;
  });
  msg(player, `§a[WE] Pirámide creada (tamaño §f${s}§a): §f${n}§a bloques.`);
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

function opCopy(player) {
  if (!bothPos(player)) return msg(player, "§cMarca POS1 y POS2 primero.");
  const s = getSel(player);
  const b = minMax(s.pos1, s.pos2);
  const volume = (b.maxX - b.minX + 1) * (b.maxY - b.minY + 1) * (b.maxZ - b.minZ + 1);
  if (volume > MAX_BLOCKS) {
    return msg(player, `§cSelección demasiado grande para copiar (§f${volume}§c > §f${MAX_BLOCKS}§c).`);
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
    blocks,
  });
  msg(player, `§a[WE] Copiado: §f${blocks.length}§a bloques al portapapeles.`);
}

function opPaste(player) {
  const clip = clipboards.get(player.id);
  if (!clip || clip.blocks.length === 0) {
    return msg(player, "§cPortapapeles vacío. Usa ;copy primero.");
  }
  const base = toBlockLoc(player.location);
  const dim = player.dimension;
  const changes = [];
  let count = 0;
  for (const bl of clip.blocks) {
    const x = base.x + bl.dx;
    const y = base.y + bl.dy;
    const z = base.z + bl.dz;
    try {
      const block = dim.getBlock({ x, y, z });
      if (!block) continue;
      changes.push({ x, y, z, perm: block.permutation, dim });
      block.setPermutation(bl.perm);
      count++;
    } catch (e) {}
  }
  pushUndo(player, changes);
  msg(player, `§a[WE] Pegado: §f${count}§a bloques.`);
}

function opSize(player) {
  const s = getSel(player);
  if (!s || !s.pos1 || !s.pos2) {
    return msg(player, "§eSelección incompleta. POS1: " +
      (s && s.pos1 ? fmt(s.pos1) : "§c—") + " §ePOS2: " +
      (s && s.pos2 ? fmt(s.pos2) : "§c—"));
  }
  const b = minMax(s.pos1, s.pos2);
  const vol = regionVolume(s.pos1, s.pos2);
  msg(player, "§b[WE] Selección:");
  msg(player, `  §7POS1: §f${fmt(s.pos1)}`);
  msg(player, `  §7POS2: §f${fmt(s.pos2)}`);
  msg(player, `  §7Tamaño: §f${b.maxX - b.minX + 1} x ${b.maxY - b.minY + 1} x ${b.maxZ - b.minZ + 1}`);
  msg(player, `  §7Volumen: §f${vol}§7 bloques`);
}

function fmt(p) {
  return `${p.x}, ${p.y}, ${p.z}`;
}

/* ------------------------------------------------------------------ */
/*  Selección con la varita                                            */
/* ------------------------------------------------------------------ */
function getMainhandId(player) {
  // Compatible con distintas versiones de la API
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
  const id = player.id;
  let s = selections.get(id);
  if (!s) {
    s = {};
    selections.set(id, s);
  }
  s.pos1 = { x: loc.x, y: loc.y, z: loc.z };
  msg(player, `§d[WE] §aPOS1 §7→ §f${fmt(s.pos1)}`);
}

function setPos2(player, loc) {
  const id = player.id;
  let s = selections.get(id);
  if (!s) {
    s = {};
    selections.set(id, s);
  }
  s.pos2 = { x: loc.x, y: loc.y, z: loc.z };
  msg(player, `§d[WE] §bPOS2 §7→ §f${fmt(s.pos2)}`);
}

/* ------------------------------------------------------------------ */
/*  Kit                                                                */
/* ------------------------------------------------------------------ */
function giveKit(player) {
  const inv = player.getComponent("minecraft:inventory");
  if (!inv || !inv.container) return;
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
  msg(player, "§a[WE] §fKit de construcción entregado. §7(La varita es el hacha de madera)");
}

function giveWand(player) {
  const inv = player.getComponent("minecraft:inventory");
  if (!inv || !inv.container) return;
  try {
    inv.container.addItem(new ItemStack(WAND, 1));
    msg(player, "§a[WE] §fVarita entregada (hacha de madera).");
    msg(player, "§7Click derecho/tocar = §aPOS1§7 · Romper = §bPOS2");
  } catch (e) {}
}

/* ------------------------------------------------------------------ */
/*  Formularios (UI)                                                   */
/* ------------------------------------------------------------------ */
async function openMenu(player) {
  const form = new ActionFormData()
    .title("§b§lWorldEdit MCPE")
    .body("§7Elige una herramienta:")
    .button("§2Obtener Kit", "textures/items/diamond_pickaxe")
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
    .button("§eUndo / Deshacer", "textures/ui/refresh")
    .button("Info / Selección", "textures/ui/magnifyingGlass")
    .button("Ayuda / Comandos", "textures/ui/infobulb");

  const res = await showForm(player, form);
  if (!res || res.canceled) return;
  switch (res.selection) {
    case 0:
      giveKit(player);
      break;
    case 1:
      giveWand(player);
      break;
    case 2:
      await pickBlockThen(player, "Set / Rellenar", (blk) => opSet(player, blk));
      break;
    case 3:
      await replaceForm(player);
      break;
    case 4:
      await pickBlockThen(player, "Walls / Paredes", (blk) => opWalls(player, blk));
      break;
    case 5:
      await pickBlockThen(player, "Outline / Contorno", (blk) => opFaces(player, blk));
      break;
    case 6:
      await sphereForm(player);
      break;
    case 7:
      await cylinderForm(player);
      break;
    case 8:
      await pyramidForm(player);
      break;
    case 9:
      opClear(player);
      break;
    case 10:
      opCopy(player);
      break;
    case 11:
      opPaste(player);
      break;
    case 12:
      doUndo(player);
      break;
    case 13:
      opSize(player);
      break;
    case 14:
      await helpForm(player);
      break;
  }
}

function blockOptions() {
  return COMMON_BLOCKS.map((b) => b);
}

// Modal con dropdown de bloques comunes + campo de texto personalizado
async function pickBlockThen(player, title, callback) {
  const form = new ModalFormData()
    .title("§l" + title)
    .dropdown("Bloque común", blockOptions(), 0)
    .textField("Bloque personalizado (opcional)", "ej: oak_log, lapis_block");
  const res = await showForm(player, form);
  if (!res || res.canceled) return;
  const [idx, custom] = res.formValues;
  const blk = custom && custom.trim().length > 0 ? custom.trim() : COMMON_BLOCKS[idx];
  callback(blk);
}

async function replaceForm(player) {
  const form = new ModalFormData()
    .title("§lReplace / Reemplazar")
    .dropdown("Bloque a reemplazar (de)", blockOptions(), 0)
    .textField("…o escribe el bloque (de)", "ej: dirt")
    .dropdown("Bloque nuevo (a)", blockOptions(), 0)
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
    .dropdown("Bloque", blockOptions(), 0)
    .textField("…o bloque personalizado", "ej: glass")
    .slider("Radio", 1, 32, 1, 4)
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
    .dropdown("Bloque", blockOptions(), 0)
    .textField("…o bloque personalizado", "ej: stone")
    .slider("Radio", 1, 32, 1, 4)
    .slider("Altura", 1, 64, 1, 4)
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
    .dropdown("Bloque", blockOptions(), 0)
    .textField("…o bloque personalizado", "ej: sandstone")
    .slider("Tamaño (base)", 1, 32, 1, 5);
  const res = await showForm(player, form);
  if (!res || res.canceled) return;
  const [idx, custom, size] = res.formValues;
  const blk = custom && custom.trim() ? custom.trim() : COMMON_BLOCKS[idx];
  opPyramid(player, blk, size);
}

async function helpForm(player) {
  const form = new MessageFormData()
    .title("§b§lWorldEdit · Comandos")
    .body(HELP_TEXT)
    .button1("Abrir menú")
    .button2("Cerrar");
  const res = await showForm(player, form);
  if (res && !res.canceled && res.selection === 0) {
    await openMenu(player);
  }
}

const HELP_TEXT = [
  "§7Prefijo de comandos: §b;",
  "",
  "§b;menu §7- Abrir el menú con formularios",
  "§b;kit §7- Obtener el kit de construcción",
  "§b;wand §7- Obtener la varita (hacha)",
  "§b;pos1 §7/ §b;pos2 §7- Marcar posiciones",
  "§b;set <bloque> §7- Rellenar la selección",
  "§b;walls <bloque> §7- Paredes",
  "§b;outline <bloque> §7- Contorno (caras)",
  "§b;replace <de> <a> §7- Reemplazar",
  "§b;clear §7- Vaciar (aire)",
  "§b;sphere <bloque> <radio> [hollow]",
  "§b;cyl <bloque> <radio> [altura] [hollow]",
  "§b;pyramid <bloque> <tamaño>",
  "§b;copy §7/ §b;paste §7- Copiar/Pegar",
  "§b;undo §7- Deshacer",
  "§b;up <n> §7- Subir n bloques",
  "§b;size §7- Info de la selección",
  "",
  "§7Alternativa sin chat: §e/scriptevent we:set stone",
  "§7Menú rápido: §eagáchate y usa la varita§7 (hacha).",
  "§7Varita: §aPOS1§7=click derecho/tocar, §bPOS2§7=romper.",
].join("\n");

/* ------------------------------------------------------------------ */
/*  Procesamiento de comandos de chat                                  */
/* ------------------------------------------------------------------ */
function handleCommand(player, raw) {
  if (!player.hasTag(TAG)) {
    msg(player, "§cWorldEdit no está activado. Ejecuta §e/tag @p worldedit§c para activarlo.");
    return;
  }
  const parts = raw.trim().split(/\s+/);
  const cmd = (parts.shift() || "").toLowerCase();
  const args = parts;

  try {
    switch (cmd) {
      case "menu":
      case "gui":
      case "we":
      case "worldedit":
        launch(openMenu(player));
        break;
      case "help":
      case "ayuda":
      case "?":
        launch(helpForm(player));
        break;
      case "kit":
        giveKit(player);
        break;
      case "wand":
      case "varita":
        giveWand(player);
        break;
      case "pos1":
      case "p1":
        setPos1(player, toBlockLoc(player.location));
        break;
      case "pos2":
      case "p2":
        setPos2(player, toBlockLoc(player.location));
        break;
      case "set":
      case "fill":
        if (!args[0]) return msg(player, "§cUso: ;set <bloque>");
        opSet(player, args[0]);
        break;
      case "walls":
        if (!args[0]) return msg(player, "§cUso: ;walls <bloque>");
        opWalls(player, args[0]);
        break;
      case "outline":
      case "faces":
        if (!args[0]) return msg(player, "§cUso: ;outline <bloque>");
        opFaces(player, args[0]);
        break;
      case "replace":
        if (!args[0] || !args[1]) return msg(player, "§cUso: ;replace <de> <a>");
        opReplace(player, args[0], args[1]);
        break;
      case "clear":
      case "cut":
      case "delete":
        opClear(player);
        break;
      case "sphere":
      case "esfera": {
        if (!args[0]) return msg(player, "§cUso: ;sphere <bloque> <radio> [hollow]");
        const radius = parseInt(args[1]) || 4;
        const hollow = (args[2] || "").toLowerCase().startsWith("h");
        opSphere(player, args[0], radius, hollow);
        break;
      }
      case "cyl":
      case "cylinder":
      case "cilindro": {
        if (!args[0]) return msg(player, "§cUso: ;cyl <bloque> <radio> [altura] [hollow]");
        const radius = parseInt(args[1]) || 4;
        const height = parseInt(args[2]) || 4;
        const hollow = (args[3] || "").toLowerCase().startsWith("h");
        opCylinder(player, args[0], radius, height, hollow);
        break;
      }
      case "pyramid":
      case "piramide": {
        if (!args[0]) return msg(player, "§cUso: ;pyramid <bloque> <tamaño>");
        const size = parseInt(args[1]) || 5;
        opPyramid(player, args[0], size);
        break;
      }
      case "copy":
      case "copiar":
        opCopy(player);
        break;
      case "paste":
      case "pegar":
        opPaste(player);
        break;
      case "undo":
      case "deshacer":
        doUndo(player);
        break;
      case "up":
      case "subir":
        opUp(player, parseInt(args[0]) || 1);
        break;
      case "size":
      case "count":
      case "info":
        opSize(player);
        break;
      default:
        msg(player, `§cComando desconocido: §f;${cmd}§c. Usa §e;help§c.`);
    }
  } catch (e) {
    msg(player, "§cError: §f" + e);
    console.warn("[WorldEdit] Error en comando '" + cmd + "': " + e + (e && e.stack ? "\n" + e.stack : ""));
  }
}

/* ------------------------------------------------------------------ */
/*  Eventos (suscripción defensiva: nunca crashea por falta de un      */
/*  evento en la versión de la API del jugador)                        */
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

/* 1) Comandos por chat con prefijo ";"  (chatSend es beta en algunas
 *    versiones; si no existe, se usa /scriptevent o el menú). */
const chatOk = safeSub(
  () => world.beforeEvents.chatSend,
  (ev) => {
    const message = ev.message;
    if (!message || !message.startsWith(PREFIX)) return;
    ev.cancel = true;
    const player = ev.sender;
    const raw = message.slice(PREFIX.length);
    system.run(() => handleCommand(player, raw));
  },
  "chatSend"
);

/* 2) Comandos por /scriptevent we:<cmd> [args]  (estable en todas las
 *    versiones; ej: /scriptevent we:set stone). */
safeSub(
  () => system.afterEvents.scriptEventReceive,
  (ev) => {
    const id = (ev.id || "").toLowerCase();
    if (!id.startsWith("we:") && !id.startsWith("worldedit:")) return;
    const cmd = id.split(":")[1] || "";
    const player = ev.sourceEntity;
    if (!player || player.typeId !== "minecraft:player") return;
    const raw = (cmd + " " + (ev.message || "")).trim();
    handleCommand(player, raw);
  },
  "scriptEventReceive"
);

/* 3) Varita -> POS1 (interactuar / tocar / quitar corteza). */
const interactBeforeOk = safeSub(
  () => world.beforeEvents.playerInteractWithBlock,
  (ev) => {
    const item = ev.itemStack;
    if (!item || item.typeId !== WAND) return;
    const player = ev.player;
    if (!player.hasTag(TAG)) return;
    ev.cancel = true; // la varita solo selecciona, no quita corteza
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

/* 4) Varita -> POS2 (romper / intentar romper). */
const breakBeforeOk = safeSub(
  () => world.beforeEvents.playerBreakBlock,
  (ev) => {
    const item = ev.itemStack;
    if (!item || item.typeId !== WAND) return;
    const player = ev.player;
    if (!player.hasTag(TAG)) return;
    ev.cancel = true; // no rompe el bloque, solo selecciona
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

/* 5) Varita + agacharse + usar (en el aire) -> abre el menú. */
safeSub(
  () => world.afterEvents.itemUse,
  (ev) => {
    const item = ev.itemStack;
    if (!item || item.typeId !== WAND) return;
    const player = ev.source;
    if (!player || player.typeId !== "minecraft:player") return;
    if (!player.hasTag(TAG)) return;
    if (!player.isSneaking) return;
    system.run(() => launch(openMenu(player)));
  },
  "itemUse"
);

// Activación por tag:  /tag @p worldedit
system.runInterval(() => {
  for (const player of world.getAllPlayers()) {
    const has = player.hasTag(TAG);
    const id = player.id;
    if (has && !activated.has(id)) {
      activated.add(id);
      console.warn("[WorldEdit] addon activado correctamente para " + player.name);
      msg(player, "§a§l[WorldEdit] §r§aAddon activado correctamente!");
      msg(player, "§7Abre el menú: escribe §e;menu§7, o §eagáchate y usa la varita§7 (hacha).");
      msg(player, "§7Comandos: §e;set ;walls ;sphere…§7 (o §e/scriptevent we:set stone§7).");
      msg(player, "§7Te di el §ekit§7 de construcción. La §evarita§7 es el hacha de madera.");
      if (!chatOk) {
        msg(player, "§6[WE] §eEl chat §6;§e no está disponible en tu versión. Usa el §6menú§e (agáchate + varita) o §6/scriptevent we:<cmd>§e.");
      }
      system.run(() => giveKit(player));
    } else if (!has && activated.has(id)) {
      activated.delete(id);
      msg(player, "§e[WorldEdit] Desactivado (tag removido).");
    }
  }
}, 20);

// Mensaje de carga
system.run(() => {
  console.warn("[WorldEdit] MCPE v0.1 cargado. Activa con: /tag @p worldedit");
});

world.afterEvents.playerSpawn.subscribe((ev) => {
  if (!ev.initialSpawn) return;
  const player = ev.player;
  system.runTimeout(() => {
    msg(player, "§b§l== WorldEdit MCPE v0.1 ==");
    if (player.hasTag(TAG)) {
      msg(player, "§aActivado. Usa §e;menu§a o §e;help§a.");
    } else {
      msg(player, "§7Para activar ejecuta: §e/tag @p worldedit");
    }
  }, 40);
});
