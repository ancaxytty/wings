import { world, system, BlockPermutation, MolangVariableMap, ItemStack } from "@minecraft/server";
import { ActionFormData, ModalFormData, MessageFormData } from "@minecraft/server-ui";

/*
 * The Search MCPE v8.1.0
 * - 16 CABEZAS como BLOQUES (siempre visibles). NO desaparecen al encontrarlas.
 * - Tamaños: Pequeña / Normal / Grande / Gigante.
 * - Encontrar = INTERACTUAR (clic derecho) o ROMPER (clic izq): la cabeza NO se rompe.
 *   Admin + agachado (shift) rompe de verdad (limpieza).
 * - Partículas FLOTANTES sobre cada cabeza no encontrada (del color de la cabeza).
 * - 10 ANIMACIONES 3D al encontrar: Dulces 🎃 / Volcán 🌋 / Santa 🎅 / Regalo Gigante 🎁 /
 *   Murciélagos 🦇 / Ruleta 🎡 / Master Chief 🪖 / Relámpago ⚡ / Tornado 🌪 / Magia ✨.
 * - RECOMPENSA POR COFRE: vincula un cofre; los items dentro se guardan y se entregan.
 * - Botón RESET (admin) para volver a encontrarlas.
 * - Sistema de rango: el menú/edición requieren el tag "admin" (/tag @p add admin).
 * - Mensajes en consola (content log).
 */

const DB_KEY = "wings:searches";
const HEAD_ID = "wings:head";
const HOLO_ID = "wings:hologram";
const TITLE = "The Search MCPE";
const ADMIN_TAG = "admin";
const DIM_IDS = ["minecraft:overworld", "minecraft:nether", "minecraft:the_end"];

const HEAD_CATALOG = [
  { name: "Halloween", color: "6", rgb: [0.90, 0.52, 0.12] },
  { name: "Navidad", color: "a", rgb: [0.29, 0.66, 0.34] },
  { name: "Santa", color: "c", rgb: [0.83, 0.18, 0.20] },
  { name: "Frozen", color: "b", rgb: [0.47, 0.71, 0.93] },
  { name: "Olaf", color: "f", rgb: [0.93, 0.95, 0.97] },
  { name: "Fantasma", color: "7", rgb: [0.80, 0.83, 0.88] },
  { name: "Esqueleto", color: "f", rgb: [0.86, 0.88, 0.92] },
  { name: "Reno", color: "6", rgb: [0.55, 0.36, 0.20] },
  { name: "Muñeco de Nieve", color: "b", rgb: [0.72, 0.82, 0.96] },
  { name: "Regalo", color: "c", rgb: [0.85, 0.20, 0.24] },
  { name: "Zombie", color: "2", rgb: [0.32, 0.68, 0.36] },
  { name: "Bruja", color: "5", rgb: [0.58, 0.34, 0.74] },
  { name: "Master Chief", color: "2", rgb: [0.32, 0.45, 0.28] },
  { name: "God of War", color: "c", rgb: [0.72, 0.20, 0.18] },
  { name: "Gears of War", color: "4", rgb: [0.55, 0.12, 0.12] },
  { name: "Bob Esponja", color: "e", rgb: [0.96, 0.86, 0.28] }
];

const SIZE_NAMES = ["Pequeña", "Normal", "Grande", "Gigante"];
const FX_NAMES = [
  "Destello", "Corazones", "Estrellas", "Nieve", "Fuego", "Magia",
  "Confeti", "Humo", "Ender", "Notas", "Burbujas", "Brillos"
];

// 10 animaciones 3D al encontrar una cabeza
const CELEB_NAMES = [
  "Dulces 🎃", "Volcán 🌋", "Santa 🎅", "Regalo Gigante 🎁", "Murciélagos 🦇",
  "Ruleta 🎡", "Master Chief 🪖", "Relámpago ⚡", "Tornado 🌪", "Magia ✨"
];
// colores de los dulces para la explosión multicolor
const CANDY_COLORS = [
  [0.95, 0.20, 0.25], // rojo
  [0.97, 0.55, 0.12], // naranja
  [0.96, 0.30, 0.62], // rosa
  [0.30, 0.78, 0.35], // verde
  [0.55, 0.35, 0.85], // morado
  [0.98, 0.85, 0.25]  // amarillo
];
const ABOVE_RADIUS = 40; // distancia para mostrar partículas flotantes sobre la cabeza

// ----------------------------- utils -----------------------------

function log(msg) {
  try {
    console.warn(`[The Search MCPE] ${msg}`);
  } catch (e) {}
}
function headIcon(skin) {
  return `textures/custom_ui/heads/h${skin}`;
}
function clampSkin(n) {
  n = Math.floor(Number(n));
  if (!Number.isFinite(n) || n < 0) return 0;
  if (n > HEAD_CATALOG.length - 1) return HEAD_CATALOG.length - 1;
  return n;
}
function clampSize(n) {
  n = Math.floor(Number(n));
  return Number.isFinite(n) && n >= 0 && n <= 3 ? n : 1;
}
function clampFx(n) {
  n = Math.floor(Number(n));
  return Number.isFinite(n) && n >= 0 && n <= 11 ? n : 0;
}
function headName(h) {
  if (h && typeof h.name === "string" && h.name.length) return h.name;
  return HEAD_CATALOG[clampSkin(h ? h.skin : 0)].name;
}
function headSize(h) {
  return clampSize(h && h.size !== undefined ? h.size : 1);
}
function headFx(h) {
  return clampFx(h && h.fx !== undefined ? h.fx : 0);
}
function clampCeleb(n) {
  n = Math.floor(Number(n));
  return Number.isFinite(n) && n >= 0 && n <= CELEB_NAMES.length - 1 ? n : 0;
}
function defaultCeleb(skin) {
  if (skin === 12) return 6;             // Master Chief -> animación Master Chief
  if (skin === 13 || skin === 14) return 7; // God of War / Gears -> Relámpago
  const winter = [1, 2, 3, 4, 7, 8, 9];  // Navidad, Santa, Frozen, Olaf, Reno, Muñeco, Regalo
  if (winter.indexOf(skin) !== -1) return 2; // Santa
  return 0;                              // Dulces
}
function headCeleb(h) {
  if (h && h.celeb !== undefined) return clampCeleb(h.celeb);
  return defaultCeleb(clampSkin(h ? h.skin : 0));
}
function headRGB(h) {
  if (h && Array.isArray(h.pcolor) && h.pcolor.length === 3) return h.pcolor;
  return HEAD_CATALOG[clampSkin(h ? h.skin : 0)].rgb;
}
function colorMapFor(h) {
  const rgb = headRGB(h);
  const m = new MolangVariableMap();
  try {
    m.setColorRGB("variable.color", { red: rgb[0], green: rgb[1], blue: rgb[2] });
  } catch (e) {}
  return m;
}
function parseHex(s) {
  if (typeof s !== "string") return null;
  const m = s.trim().replace("#", "");
  if (!/^[0-9a-fA-F]{6}$/.test(m)) return null;
  return [parseInt(m.slice(0, 2), 16) / 255, parseInt(m.slice(2, 4), 16) / 255, parseInt(m.slice(4, 6), 16) / 255];
}
function rgbToHex(rgb) {
  const h = (v) => ("0" + Math.round(v * 255).toString(16)).slice(-2);
  return "#" + h(rgb[0]) + h(rgb[1]) + h(rgb[2]);
}
function colorCode(c) {
  const ok = "0123456789abcdef";
  if (typeof c !== "string" || c.length !== 1 || !ok.includes(c.toLowerCase())) return "e";
  return c.toLowerCase();
}

// ----------------------------- rango / admin -----------------------------

function isAdmin(player) {
  try {
    return player.hasTag(ADMIN_TAG);
  } catch (e) {
    return false;
  }
}
function requireAdmin(player) {
  if (isAdmin(player)) return true;
  player.sendMessage("§c[Search] Necesitas el rango §eadmin§c para gestionar búsquedas.");
  player.sendMessage("§7Pide a un operador que ejecute: §f/tag @p add admin");
  log(`${player.name} intentó abrir el menú de administración SIN el tag '${ADMIN_TAG}'.`);
  return false;
}

// ----------------------------- DB -----------------------------

function loadDB() {
  const raw = world.getDynamicProperty(DB_KEY);
  if (typeof raw !== "string" || raw.length === 0) return {};
  try {
    return JSON.parse(raw);
  } catch (e) {
    return {};
  }
}
function saveDB(db) {
  world.setDynamicProperty(DB_KEY, JSON.stringify(db));
}
function genId() {
  return "s_" + Date.now().toString(36) + "_" + Math.floor(Math.random() * 1000);
}
function searchList(db) {
  return Object.keys(db).map((k) => db[k]);
}

// ----------------------------- estado por jugador -----------------------------

function getActiveSearch(player) {
  const v = player.getDynamicProperty("wings:active");
  return typeof v === "string" && v.length ? v : null;
}
function setActiveSearch(player, id) {
  player.setDynamicProperty("wings:active", id || "");
}
function getSkin(player) {
  const v = player.getDynamicProperty("wings:skin");
  return clampSkin(typeof v === "number" ? v : 0);
}
function setSkin(player, skin) {
  player.setDynamicProperty("wings:skin", clampSkin(skin));
}
function getSize(player) {
  const v = player.getDynamicProperty("wings:size");
  return clampSize(typeof v === "number" ? v : 1);
}
function setSize(player, s) {
  player.setDynamicProperty("wings:size", clampSize(s));
}
function getFx(player) {
  const v = player.getDynamicProperty("wings:fx");
  return clampFx(typeof v === "number" ? v : 0);
}
function setFx(player, f) {
  player.setDynamicProperty("wings:fx", clampFx(f));
}
function getCeleb(player) {
  const v = player.getDynamicProperty("wings:celeb");
  return clampCeleb(typeof v === "number" ? v : 0);
}
function setCeleb(player, c) {
  player.setDynamicProperty("wings:celeb", clampCeleb(c));
}

// ----------------------------- title / actionbar -----------------------------

function showTitle(player, title, subtitle) {
  try {
    player.onScreenDisplay.setTitle(title, { fadeInDuration: 5, stayDuration: 45, fadeOutDuration: 12, subtitle: subtitle || "" });
  } catch (e) {}
}
function actionBar(player, text) {
  try {
    player.onScreenDisplay.setActionBar(text);
  } catch (e) {}
}

const DEFAULT_TITLE = "§a¡Encontraste {found} de {total} cabezas!";
const DEFAULT_SUBTITLE = "§{hc}{head} §7en §{sc}{search}";
const HINT_RADIUS = 4.5;

function applyTemplate(tpl, ctx) {
  return String(tpl)
    .replace(/\{found\}/g, ctx.found)
    .replace(/\{total\}/g, ctx.total)
    .replace(/\{head\}/g, ctx.head)
    .replace(/\{search\}/g, ctx.search)
    .replace(/\{player\}/g, ctx.player)
    .replace(/\{hc\}/g, ctx.hc)
    .replace(/\{sc\}/g, ctx.sc);
}
function buildCtx(s, h, foundCount, total, playerName) {
  return {
    found: foundCount, total: total, head: headName(h), search: s.name, player: playerName,
    hc: colorCode(HEAD_CATALOG[clampSkin(h.skin)].color), sc: colorCode(s.color)
  };
}

// ----------------------------- bloques + hologramas -----------------------------

function center(h) {
  return { x: h.x + 0.5, y: h.y, z: h.z + 0.5 };
}
// punto justo encima de la cabeza (según tamaño) para partículas y animaciones
function aboveHeadPos(h) {
  const c = center(h);
  const sz = headSize(h);
  const extra = sz === 0 ? 0.55 : sz === 1 ? 0.9 : sz === 2 ? 1.3 : 1.9;
  return { x: c.x, y: h.y + extra, z: c.z };
}

function holoLines(search, h, index, total) {
  const cat = HEAD_CATALOG[clampSkin(h.skin)];
  const c = colorCode(cat.color);
  return [
    `§8§l✦ §r§${c}§l${headName(h)}§r §8§l✦`,
    h.found ? "§a§l✔ Encontrada" : "§7▶ §e[Romper / Interactuar] §7◀",
    `§8${search.name} · §7${index + 1}/${total}`
  ];
}

function applyHeadBlock(dimension, h) {
  try {
    const b = dimension.getBlock({ x: h.x, y: h.y, z: h.z });
    if (!b) return false;
    b.setPermutation(BlockPermutation.resolve(HEAD_ID, { "wings:skin": clampSkin(h.skin), "wings:size": headSize(h) }));
    return true;
  } catch (e) {
    return false;
  }
}

function getHolos(searchId) {
  const out = [];
  for (const dimId of DIM_IDS) {
    let dim;
    try {
      dim = world.getDimension(dimId);
    } catch (e) {
      continue;
    }
    let list;
    try {
      list = dim.getEntities({ type: HOLO_ID });
    } catch (e) {
      continue;
    }
    for (const e of list) {
      if (searchId === null || e.getDynamicProperty("wings:search") === searchId) out.push(e);
    }
  }
  return out;
}
function removeHolos(searchId, index) {
  for (const e of getHolos(searchId)) {
    if (index === null || e.getDynamicProperty("wings:index") === index) {
      try {
        e.remove();
      } catch (err) {}
    }
  }
}
function spawnHolos(dimension, search, index) {
  const h = search.heads[index];
  const c = center(h);
  const baseY = h.y + 0.7 + (headSize(h) >= 2 ? (headSize(h) === 3 ? 1.4 : 0.7) : 0);
  const lines = holoLines(search, h, index, search.heads.length);
  for (let i = 0; i < 3; i++) {
    try {
      const holo = dimension.spawnEntity(HOLO_ID, { x: c.x, y: baseY + i * 0.27, z: c.z });
      holo.setDynamicProperty("wings:search", search.id);
      holo.setDynamicProperty("wings:index", index);
      holo.addTag("wings_holo");
      holo.nameTag = lines[2 - i];
    } catch (e) {}
  }
}

function refreshHead(search, index) {
  const h = search.heads[index];
  let d;
  try {
    d = world.getDimension(h.dim || "minecraft:overworld");
  } catch (e) {
    d = world.getDimension("minecraft:overworld");
  }
  applyHeadBlock(d, h);
  removeHolos(search.id, index);
  spawnHolos(d, search, index);
}

function respawnSearch(search) {
  removeHolos(search.id, null);
  let count = 0;
  for (let i = 0; i < search.heads.length; i++) {
    refreshHead(search, i);
    count++;
  }
  return count;
}
function reloadAll() {
  const db = loadDB();
  removeHolos(null, null);
  let total = 0;
  for (const s of searchList(db)) total += respawnSearch(s);
  return total;
}

// ----------------------------- partículas (solo al encontrar) -----------------------------

function foundExplosion(dimension, loc, h) {
  const fxId = "wings:fx" + headFx(h);
  const pts = [
    { x: loc.x, y: loc.y + 0.5, z: loc.z },
    { x: loc.x, y: loc.y + 0.9, z: loc.z },
    { x: loc.x, y: loc.y + 0.2, z: loc.z }
  ];
  for (const p of pts) {
    try {
      dimension.spawnParticle(fxId, p, colorMapFor(h));
    } catch (e) {}
  }
  try {
    dimension.spawnParticle("minecraft:totem_particle", { x: loc.x, y: loc.y + 0.7, z: loc.z });
  } catch (e) {}
}
function selectBurst(player, skin) {
  const loc = player.location;
  try {
    player.dimension.spawnParticle("wings:fx" + getFx(player), { x: loc.x, y: loc.y + 1.2, z: loc.z }, colorMapFor({ skin }));
  } catch (e) {}
  try {
    player.playSound("random.orb", { pitch: 1.5 });
  } catch (e) {}
}

// ----------------------------- partículas flotantes SOBRE la cabeza -----------------------------

function spawnP(dim, id, pos, rgb) {
  try {
    if (rgb) {
      const m = new MolangVariableMap();
      try {
        m.setColorRGB("variable.color", { red: rgb[0], green: rgb[1], blue: rgb[2] });
      } catch (e) {}
      dim.spawnParticle(id, pos, m);
    } else {
      dim.spawnParticle(id, pos);
    }
  } catch (e) {}
}

// Emite partículas flotantes encima de cada cabeza NO encontrada cercana a un jugador.
function ambientAbove() {
  const players = world.getAllPlayers();
  if (players.length === 0) return;
  const db = loadDB();
  for (const s of searchList(db)) {
    for (let i = 0; i < s.heads.length; i++) {
      const h = s.heads[i];
      if (h.found) continue;
      const dimId = h.dim || "minecraft:overworld";
      const pos = aboveHeadPos(h);
      let near = false;
      for (const p of players) {
        if (p.dimension.id !== dimId) continue;
        const pl = p.location;
        const dx = pl.x - pos.x, dy = pl.y - pos.y, dz = pl.z - pos.z;
        if (dx * dx + dy * dy + dz * dz <= ABOVE_RADIUS * ABOVE_RADIUS) {
          near = true;
          break;
        }
      }
      if (!near) continue;
      let dim;
      try {
        dim = world.getDimension(dimId);
      } catch (e) {
        continue;
      }
      spawnP(dim, "wings:above", pos, headRGB(h));
    }
  }
}

// ----------------------------- animaciones 3D (al encontrar) -----------------------------

// programa fn(i) en varios "frames" para crear animaciones que se mueven en el tiempo
function animate(frames, step, fn) {
  for (let i = 0; i < frames; i++) {
    system.runTimeout(() => {
      try {
        fn(i);
      } catch (e) {}
    }, i * step);
  }
}

function playCelebration(dimension, base, type) {
  const t = clampCeleb(type);
  if (t === 0) {
    // DULCES: explosión de caramelos multicolor + candy corn
    for (const c of CANDY_COLORS) spawnP(dimension, "wings:candy", base, c);
    spawnP(dimension, "wings:candy_corn", base);
    spawnP(dimension, "wings:bell", { x: base.x, y: base.y + 0.2, z: base.z });
    try {
      dimension.spawnParticle("minecraft:totem_particle", base);
    } catch (e) {}
    system.runTimeout(() => {
      for (const c of CANDY_COLORS) spawnP(dimension, "wings:candy", base, c);
      spawnP(dimension, "wings:candy_corn", base);
    }, 7);
  } else if (t === 1) {
    // VOLCÁN: erupción en oleadas (lava + brasas + rocas) y columna de humo
    const erupt = (i) => {
      spawnP(dimension, "wings:lava", base);
      spawnP(dimension, "wings:ember", base);
      if (i % 2 === 0) spawnP(dimension, "wings:rock", base);
      spawnP(dimension, "wings:ash", { x: base.x, y: base.y + 0.1, z: base.z });
    };
    erupt(0);
    system.runTimeout(() => erupt(1), 6);
    system.runTimeout(() => erupt(2), 12);
    system.runTimeout(() => erupt(3), 18);
    system.runTimeout(() => spawnP(dimension, "wings:ash", { x: base.x, y: base.y + 0.3, z: base.z }), 26);
  } else if (t === 2) {
    // SANTA: regalos + gorros + campanas + nevada
    spawnP(dimension, "wings:gift", base);
    spawnP(dimension, "wings:santahat", base);
    spawnP(dimension, "wings:bell", { x: base.x, y: base.y + 0.3, z: base.z });
    spawnP(dimension, "wings:snowfall", base);
    system.runTimeout(() => {
      spawnP(dimension, "wings:gift", base);
      spawnP(dimension, "wings:snowfall", base);
    }, 10);
    system.runTimeout(() => spawnP(dimension, "wings:snowfall", base), 24);
  } else if (t === 3) {
    // REGALO GIGANTE: sube flotando y explota en caramelos/regalos
    spawnP(dimension, "wings:biggift", base);
    spawnP(dimension, "wings:spark", { x: base.x, y: base.y + 0.3, z: base.z }, [1.0, 0.85, 0.25]);
    spawnP(dimension, "wings:spark", { x: base.x, y: base.y + 0.6, z: base.z }, [1.0, 0.85, 0.25]);
    system.runTimeout(() => {
      const top = { x: base.x, y: base.y + 1.9, z: base.z };
      try {
        dimension.spawnParticle("minecraft:huge_explosion_emitter", top);
      } catch (e) {}
      for (const c of CANDY_COLORS) spawnP(dimension, "wings:candy", top, c);
      spawnP(dimension, "wings:gift", top);
      spawnP(dimension, "wings:bell", top);
    }, 18);
  } else if (t === 4) {
    // MURCIÉLAGOS: vuelan hacia fuera en oleadas
    spawnP(dimension, "wings:bat", base);
    system.runTimeout(() => spawnP(dimension, "wings:bat", { x: base.x, y: base.y + 0.5, z: base.z }), 8);
    system.runTimeout(() => spawnP(dimension, "wings:bat", base), 16);
  } else if (t === 5) {
    // RULETA: anillo de chispas multicolor girando
    const cols = CANDY_COLORS;
    const n = 8;
    animate(26, 1, (i) => {
      for (let k = 0; k < n; k++) {
        const ang = i * 0.5 + k * (Math.PI * 2 / n);
        const r = 1.2;
        const pos = { x: base.x + r * Math.cos(ang), y: base.y + 0.15 + 0.05 * Math.sin(i * 0.6 + k), z: base.z + r * Math.sin(ang) };
        spawnP(dimension, "wings:spark", pos, cols[(k + i) % cols.length]);
      }
    });
    spawnP(dimension, "wings:halo", base, [1.0, 0.9, 0.3]);
  } else if (t === 6) {
    // MASTER CHIEF: cascos + chispas verdes
    spawnP(dimension, "wings:helmet", base);
    animate(8, 2, () => {
      for (let k = 0; k < 6; k++) {
        const ang = Math.random() * Math.PI * 2;
        const r = 0.3 + Math.random() * 0.8;
        const pos = { x: base.x + r * Math.cos(ang), y: base.y + 0.2 + Math.random() * 1.0, z: base.z + r * Math.sin(ang) };
        spawnP(dimension, "wings:spark", pos, [0.30, 0.85, 0.38]);
      }
    });
  } else if (t === 7) {
    // RELÁMPAGO / KRATOS: rayos cayendo + chispas rojas + explosión
    animate(4, 3, () => {
      const ox = base.x + (Math.random() - 0.5) * 1.2;
      const oz = base.z + (Math.random() - 0.5) * 1.2;
      spawnP(dimension, "wings:bolt", { x: ox, y: base.y, z: oz });
    });
    animate(6, 2, () => {
      for (let k = 0; k < 6; k++) {
        const ang = Math.random() * Math.PI * 2;
        const r = 0.2 + Math.random() * 0.9;
        const pos = { x: base.x + r * Math.cos(ang), y: base.y + Math.random() * 0.8, z: base.z + r * Math.sin(ang) };
        spawnP(dimension, "wings:spark", pos, [0.95, 0.25, 0.15]);
      }
    });
    try {
      dimension.spawnParticle("minecraft:huge_explosion_emitter", base);
    } catch (e) {}
  } else if (t === 8) {
    // TORNADO: embudo de polvo girando que sube
    animate(30, 1, (i) => {
      const layers = 6;
      for (let k = 0; k < layers; k++) {
        const hgt = k * 0.42;
        const rad = 0.25 + hgt * 0.45;
        const ang = i * 0.7 + k * 1.1;
        spawnP(dimension, "wings:wisp", { x: base.x + rad * Math.cos(ang), y: base.y - 0.4 + hgt, z: base.z + rad * Math.sin(ang) }, [0.62, 0.59, 0.55]);
        if (k < 2) {
          spawnP(dimension, "wings:dust", { x: base.x + rad * Math.cos(ang + 2.0), y: base.y - 0.4 + hgt, z: base.z + rad * Math.sin(ang + 2.0) }, [0.50, 0.42, 0.32]);
        }
      }
    });
  } else {
    // MAGIA: espiral creciente de runas + halos morado/cian
    const n = 5;
    animate(24, 1, (i) => {
      for (let k = 0; k < n; k++) {
        const ang = i * 0.6 + k * (Math.PI * 2 / n);
        const r = 0.2 + i * 0.06;
        const col = (k % 2 === 0) ? [0.62, 0.35, 0.95] : [0.30, 0.80, 0.95];
        spawnP(dimension, "wings:rune", { x: base.x + r * Math.cos(ang), y: base.y + 0.1 + i * 0.035, z: base.z + r * Math.sin(ang) }, col);
      }
    });
    spawnP(dimension, "wings:halo", base, [0.62, 0.40, 0.95]);
    system.runTimeout(() => spawnP(dimension, "wings:halo", base, [0.30, 0.80, 0.95]), 10);
  }
}

function celebrationSound(player, type) {
  try {
    switch (clampCeleb(type)) {
      case 1: player.playSound("random.explode", { pitch: 0.9 }); player.playSound("fire.fire", { pitch: 0.8 }); break;
      case 2: player.playSound("note.bell", { pitch: 1.1 }); player.playSound("note.bell", { pitch: 1.5 }); break;
      case 3: player.playSound("random.levelup", { pitch: 1.0 }); player.playSound("random.pop", { pitch: 1.3 }); break;
      case 4: player.playSound("mob.bat.takeoff", { pitch: 1.0 }); player.playSound("mob.bat.idle", { pitch: 1.2 }); break;
      case 5: player.playSound("random.orb", { pitch: 1.2 }); player.playSound("note.harp", { pitch: 1.5 }); break;
      case 6: player.playSound("random.explode", { pitch: 1.3 }); player.playSound("note.bit", { pitch: 1.4 }); break;
      case 7: player.playSound("ambient.weather.thunder", { pitch: 1.0 }); player.playSound("random.explode", { pitch: 0.8 }); break;
      case 8: player.playSound("mob.bat.takeoff", { pitch: 0.6 }); player.playSound("random.fizz", { pitch: 0.8 }); break;
      case 9: player.playSound("random.orb", { pitch: 1.6 }); player.playSound("note.chime", { pitch: 1.3 }); break;
      default: player.playSound("note.pling", { pitch: 1.4 }); player.playSound("random.pop", { pitch: 1.2 });
    }
  } catch (e) {}
}

// ----------------------------- hallazgo (interactuar) -----------------------------

function findHeadAt(loc, dimId) {
  const db = loadDB();
  for (const s of searchList(db)) {
    for (let i = 0; i < s.heads.length; i++) {
      const h = s.heads[i];
      if (h.x === loc.x && h.y === loc.y && h.z === loc.z && (h.dim || "minecraft:overworld") === dimId) {
        return { db, s, i, h };
      }
    }
  }
  return null;
}

// quita una cabeza de la DB (limpieza admin con shift+romper)
function removeHeadAt(loc, dimId, player) {
  const db = loadDB();
  for (const s of searchList(db)) {
    for (let i = 0; i < s.heads.length; i++) {
      const h = s.heads[i];
      if (h.x === loc.x && h.y === loc.y && h.z === loc.z && (h.dim || "minecraft:overworld") === dimId) {
        removeHolos(s.id, i);
        s.heads.splice(i, 1);
        saveDB(db);
        respawnSearch(s);
        if (player) actionBar(player, "§c[Search] Cabeza retirada (limpieza admin).");
        return true;
      }
    }
  }
  return false;
}

// ----------------------------- recompensa por cofre (items guardados) -----------------------------

const CHEST_IDS = ["minecraft:chest", "minecraft:trapped_chest", "minecraft:barrel"];

function getBindReward(player) {
  const v = player.getDynamicProperty("wings:bindReward");
  return typeof v === "string" && v.length ? v : null;
}
function setBindReward(player, id) {
  player.setDynamicProperty("wings:bindReward", id || "");
}
function readChestItems(dimId, loc) {
  try {
    const dim = world.getDimension(dimId);
    const b = dim.getBlock(loc);
    if (!b || CHEST_IDS.indexOf(b.typeId) === -1) return null;
    const inv = b.getComponent("minecraft:inventory");
    const cont = inv && inv.container;
    if (!cont) return null;
    const out = [];
    for (let i = 0; i < cont.size; i++) {
      const it = cont.getItem(i);
      if (it) out.push({ id: it.typeId, amount: it.amount });
    }
    return out;
  } catch (e) {
    return null;
  }
}
function giveItemsToPlayer(player, items) {
  if (!items || !items.length) return 0;
  let cont;
  try {
    cont = player.getComponent("minecraft:inventory").container;
  } catch (e) {
    return 0;
  }
  let given = 0;
  for (const it of items) {
    let amt = it.amount || 1;
    while (amt > 0) {
      const n = Math.min(amt, 64);
      try {
        cont.addItem(new ItemStack(it.id, n));
        given += n;
      } catch (e) {}
      amt -= n;
    }
  }
  return given;
}
// lee el cofre vinculado en vivo (si está cargado); si no, usa el snapshot guardado
function rewardItemsFor(s) {
  if (s.rewardChest) {
    const live = readChestItems(s.rewardChest.dim, { x: s.rewardChest.x, y: s.rewardChest.y, z: s.rewardChest.z });
    if (live && live.length) return live;
  }
  return s.rewardItems || [];
}
function itemsSummary(items) {
  if (!items || !items.length) return "(ninguno)";
  return items.map((i) => `${i.amount}x ${String(i.id).replace("minecraft:", "")}`).join(", ");
}

function handleFound(player, loc, dimId) {
  const match = findHeadAt(loc, dimId);
  if (!match) return false;
  const { db, s, i, h } = match;
  if (h.found) {
    actionBar(player, `§7Esta cabeza ya fue encontrada por §f${h.foundBy || "?"}§7.`);
    return true;
  }
  h.found = true;
  h.foundBy = player.name;
  saveDB(db);
  // la cabeza NO desaparece: solo refresca su holograma a "Encontrada"
  refreshHead(s, i);

  const c = center(h);
  foundExplosion(player.dimension, { x: c.x, y: h.y + 0.3, z: c.z }, h);
  // animación 3D de celebración (Dulces / Volcán / Santa)
  const celeb = headCeleb(h);
  playCelebration(player.dimension, aboveHeadPos(h), celeb);
  try {
    player.playSound("random.levelup", { volume: 1, pitch: 1.2 });
    player.playSound("random.chestopen", { pitch: 1.1 });
  } catch (e) {}
  celebrationSound(player, celeb);

  const cat = HEAD_CATALOG[clampSkin(h.skin)];
  const foundCount = s.heads.filter((x) => x.found).length;
  const total = s.heads.length;
  const ctx = buildCtx(s, h, foundCount, total, player.name);
  showTitle(player, applyTemplate(s.title || DEFAULT_TITLE, ctx), applyTemplate(s.subtitle || DEFAULT_SUBTITLE, ctx));
  player.sendMessage(`§a¡Encontraste §${colorCode(cat.color)}${headName(h)}§a! §7(${foundCount}/${total})`);

  if (s.reward && String(s.reward).trim().length > 0) {
    try {
      player.runCommand(String(s.reward).trim());
    } catch (e) {}
  }
  // recompensa por cofre vinculado (items guardados)
  const rItems = rewardItemsFor(s);
  const given = giveItemsToPlayer(player, rItems);
  if (given > 0) {
    player.sendMessage(`§a[Search] Recompensa: §f${itemsSummary(rItems)}`);
    try {
      player.playSound("random.pop", { pitch: 1.4 });
    } catch (e) {}
  }
  if (foundCount >= total && total > 0) {
    showTitle(player, "§6§l¡COMPLETADA!", `§e${s.name} §7· ¡todas las cabezas!`);
    world.sendMessage(`§6§l[${TITLE}] §r§e${player.name} §acompletó §${colorCode(s.color)}${s.name}§a!`);
    log(`${player.name} completó la búsqueda '${s.name}'.`);
  }
  return true;
}

// ----------------------------- colocar (admin) -----------------------------

function onPlaceHead(player, block) {
  const loc = block.location;
  const skin = getSkin(player);
  const size = getSize(player);
  const dim = player.dimension;
  const cat = HEAD_CATALOG[skin];

  if (!isAdmin(player)) {
    actionBar(player, "§c[Search] Solo un §eadmin§c puede colocar cabezas de búsqueda.");
    return;
  }
  // aplica skin + tamaño al bloque recién colocado
  try {
    block.setPermutation(BlockPermutation.resolve(HEAD_ID, { "wings:skin": skin, "wings:size": size }));
  } catch (e) {}

  const id = getActiveSearch(player);
  const db = loadDB();
  if (!id || !db[id]) {
    actionBar(player, `§e[Search] §${colorCode(cat.color)}${cat.name}§7 colocada (sin búsqueda activa). §8Brújula → Crear/activar.`);
    return;
  }
  const s = db[id];
  const h = { x: loc.x, y: loc.y, z: loc.z, dim: dim.id, found: false, skin: skin, size: size, fx: getFx(player), celeb: getCeleb(player) };
  s.heads.push(h);
  saveDB(db);
  spawnHolos(dim, s, s.heads.length - 1);
  try {
    player.playSound("random.orb", { pitch: 1.3 });
  } catch (e) {}
  actionBar(player, `§a[Search] §${colorCode(cat.color)}${cat.name}§a (${SIZE_NAMES[size]}) añadida a §f${s.name}§a §7(${s.heads.length})`);
}

// ----------------------------- GUI -----------------------------

function activeLabel(player) {
  const id = getActiveSearch(player);
  const db = loadDB();
  if (id && db[id]) return db[id].name;
  return "ninguna";
}

function openMain(player) {
  if (!requireAdmin(player)) return;
  const db = loadDB();
  const list = searchList(db);
  const totalHeads = list.reduce((a, s) => a + s.heads.length, 0);
  const totalFound = list.reduce((a, s) => a + s.heads.filter((h) => h.found).length, 0);
  const skin = getSkin(player);
  const cat = HEAD_CATALOG[skin];

  const form = new ActionFormData()
    .title(TITLE)
    .body(
      `§8§l━━━━━━━━━━━━━━━━━━━━━\n` +
        `§6§l✦ §r§eThe Search§r §6§l✦  §8(admin)\n` +
        `§8§l━━━━━━━━━━━━━━━━━━━━━\n` +
        `§7Búsquedas §8»§f ${list.length}   §7Cabezas §8»§f ${totalHeads}   §aHalladas §8»§f ${totalFound}\n` +
        `§7Activa §8»§f ${activeLabel(player)}\n` +
        `§7Tu cabeza §8»§${colorCode(cat.color)} ${cat.name} §8(§7${SIZE_NAMES[getSize(player)]}§8, §7${FX_NAMES[getFx(player)]}§8)\n`
    )
    .button("§l§aCREAR\n§r§7nueva búsqueda", "textures/custom_ui/icon_create")
    .button(`§l§bREVISAR\n§r§7${list.length} búsqueda(s)`, "textures/custom_ui/icon_review")
    .button(`§l§eCABEZAS\n§r§7${cat.name}`, headIcon(skin))
    .button("§l§dAYUDA\n§r§7cómo se juega", "textures/custom_ui/icon_help");

  form.show(player).then((res) => {
    if (res.canceled) return;
    switch (res.selection) {
      case 0: openCreate(player); break;
      case 1: openReview(player); break;
      case 2: openHeadPicker(player); break;
      case 3: openHelp(player); break;
    }
  });
}

function openHeadPicker(player) {
  const cur = getSkin(player);
  const sz = getSize(player);
  const fxi = getFx(player);
  const cl = getCeleb(player);
  const form = new ActionFormData()
    .title("Galería de Cabezas")
    .body(
      `§7Activa: §f${activeLabel(player)}\n` +
        `§7Cabeza: §f${HEAD_CATALOG[cur].name}  §8| §7Tamaño: §f${SIZE_NAMES[sz]}\n` +
        `§7Partícula: §f${FX_NAMES[fxi]}  §8| §7Animación 3D: §f${CELEB_NAMES[cl]}\n` +
        `§7Elige una cabeza (te daré el bloque):`
    );
  for (let i = 0; i < HEAD_CATALOG.length; i++) {
    const cat = HEAD_CATALOG[i];
    const mark = i === cur ? " §a✔" : "";
    form.button(`§${colorCode(cat.color)}${cat.name}${mark}`, headIcon(i));
  }
  const iSize = HEAD_CATALOG.length;
  const iFx = HEAD_CATALOG.length + 1;
  const iCeleb = HEAD_CATALOG.length + 2;
  const iBack = HEAD_CATALOG.length + 3;
  form.button(`§6⚙ Tamaño: §f${SIZE_NAMES[sz]} §8»`, "textures/custom_ui/icon_reload");
  form.button(`§d✨ Partícula: §f${FX_NAMES[fxi]} §8»`, "textures/custom_ui/icon_reload");
  form.button(`§6🎬 Animación 3D: §f${CELEB_NAMES[cl]} §8»`, "textures/custom_ui/icon_create");
  form.button("§7« Volver");
  form.show(player).then((res) => {
    if (res.canceled) return;
    if (res.selection === iBack) {
      openMain(player);
      return;
    }
    if (res.selection === iSize) {
      setSize(player, (sz + 1) % SIZE_NAMES.length);
      openHeadPicker(player);
      return;
    }
    if (res.selection === iFx) {
      setFx(player, (fxi + 1) % FX_NAMES.length);
      selectBurst(player, cur);
      openHeadPicker(player);
      return;
    }
    if (res.selection === iCeleb) {
      const next = (cl + 1) % CELEB_NAMES.length;
      setCeleb(player, next);
      // vista previa de la animación sobre el jugador
      const loc = player.location;
      playCelebration(player.dimension, { x: loc.x, y: loc.y + 1.4, z: loc.z }, next);
      celebrationSound(player, next);
      openHeadPicker(player);
      return;
    }
    setSkin(player, res.selection);
    const cat = HEAD_CATALOG[res.selection];
    selectBurst(player, res.selection);
    try {
      player.runCommand("give @s wings:head 1");
    } catch (e) {}
    actionBar(player, `§a[Search] §${colorCode(cat.color)}${cat.name}§a (${SIZE_NAMES[getSize(player)]}) — colócala donde quieras.`);
  });
}

function openHelp(player) {
  const form = new MessageFormData()
    .title(TITLE)
    .body(
      `§e§l${TITLE}§r\n\n` +
        "§6§lCómo se juega§r\n" +
        "§7• Rango: gestionar requiere el tag §eadmin§7 (§f/tag @p add admin§7).\n" +
        "§7• En §fCabezas§7 eliges una de las §f16§7, su §6tamaño§7, §dpartícula§7 y §6animación 3D§7.\n" +
        "§7• §610 animaciones 3D§7: Dulces, Volcán, Santa, Regalo Gigante, Murciélagos,\n" +
        "§7  Ruleta, Master Chief, Relámpago, Tornado y Magia.\n" +
        "§7• §fColoca§7 el bloque-cabeza (se ve siempre, no desaparece).\n" +
        "§7• Verás §dpartículas flotando§7 encima de las cabezas sin encontrar.\n" +
        "§7• Acércate y §eclic derecho§7 o §erómpela§7 (no se rompe) para hallarla.\n" +
        "§7• §6Recompensa por cofre§7: en Gestionar, vincula un cofre con items y\n" +
        "§7  se entregan al encontrar cada cabeza (se guardan).\n" +
        "§7• §8Admin + agachado + romper = retira la cabeza (limpieza).\n" +
        "§7• §fReset§7 (en Gestionar) permite volver a encontrarlas.\n"
    )
    .button1("§aRecargar todo")
    .button2("Cerrar");
  form.show(player).then((res) => {
    if (!res.canceled && res.selection === 0) {
      const n = reloadAll();
      actionBar(player, `§a[Search] Recargado. Cabezas: §f${n}`);
    }
  });
}

function openCreate(player) {
  const form = new ModalFormData()
    .title("Crear búsqueda")
    .textField("Nombre de la búsqueda", "Búsqueda de Halloween", "Búsqueda de Halloween")
    .textField("Color del nombre (0-9, a-f)", "e", "e")
    .textField("Comando de recompensa (usa @s, opcional)", "give @s diamond 1")
    .toggle("Marcar como búsqueda activa", true);
  form.show(player).then((res) => {
    if (res.canceled) return;
    const [name, color, reward, makeActive] = res.formValues;
    const db = loadDB();
    const id = genId();
    const s = {
      id, name: (name && String(name).trim()) || "Búsqueda", color: colorCode(color),
      reward: reward ? String(reward) : "", createdBy: player.name, heads: [],
      title: DEFAULT_TITLE, subtitle: DEFAULT_SUBTITLE
    };
    db[id] = s;
    saveDB(db);
    if (makeActive) setActiveSearch(player, id);
    log(`${player.name} creó la búsqueda '${s.name}'.`);
    player.sendMessage(`§a[Search] Búsqueda §f${s.name}§a creada${makeActive ? " §7(activa)" : ""}.`);
    openManage(player, id);
  });
}

function openReview(player) {
  const db = loadDB();
  const list = searchList(db);
  const form = new ActionFormData().title("Revisar búsquedas");
  form.body(list.length === 0 ? "§7No hay búsquedas todavía.\nCrea una desde el menú principal." : "§7Selecciona una búsqueda:");
  for (const s of list) {
    const found = s.heads.filter((h) => h.found).length;
    const active = getActiveSearch(player) === s.id ? " §a●" : "";
    form.button(`§${colorCode(s.color)}${s.name}${active}\n§7${found}/${s.heads.length} encontradas`);
  }
  form.button("§7« Volver");
  form.show(player).then((res) => {
    if (res.canceled) return;
    if (res.selection === list.length) {
      openMain(player);
      return;
    }
    const s = list[res.selection];
    if (s) openManage(player, s.id);
  });
}

function openManage(player, searchId) {
  const db = loadDB();
  const s = db[searchId];
  if (!s) {
    player.sendMessage("§c[Search] Esa búsqueda ya no existe.");
    return;
  }
  const found = s.heads.filter((h) => h.found).length;
  const isActive = getActiveSearch(player) === s.id;
  const form = new ActionFormData()
    .title(`Gestionar: ${s.name}`)
    .body(
      `§${colorCode(s.color)}§l${s.name}§r\n` +
        `§7Cabezas: §f${s.heads.length}§7  Halladas: §a${found}\n` +
        `§7Activa: ${isActive ? "§aSÍ" : "§cNO"}\n`
    )
    .button(isActive ? "§a● Búsqueda activa" : "§eMarcar como activa", "textures/custom_ui/icon_place")
    .button("§aAñadir cabeza aquí (tu pos.)", "textures/custom_ui/icon_place")
    .button("§5Editar cabezas (skin/tamaño/partícula)", "textures/custom_ui/icon_review")
    .button("§2Reset (volver a encontrar)", "textures/custom_ui/icon_reload")
    .button("§bInfo de la búsqueda", "textures/custom_ui/icon_help")
    .button("§eEditar (nombre/color/recompensa)", "textures/custom_ui/icon_review")
    .button("§6Recompensa por cofre (items)", "textures/custom_ui/icon_place")
    .button("§3Editar title / subtitle", "textures/custom_ui/icon_review")
    .button("§dReaparecer cabezas", "textures/custom_ui/icon_reload")
    .button("§6Teletransportar a una cabeza")
    .button("§cEliminar búsqueda", "textures/custom_ui/icon_delete")
    .button("§7« Volver");

  form.show(player).then((res) => {
    if (res.canceled) return;
    switch (res.selection) {
      case 0:
        setActiveSearch(player, searchId);
        actionBar(player, `§a[Search] §f${s.name}§a es ahora la búsqueda activa.`);
        openManage(player, searchId);
        break;
      case 1: addHeadHere(player, searchId); break;
      case 2: openHeadList(player, searchId); break;
      case 3: openReset(player, searchId); break;
      case 4: openInfo(player, searchId); break;
      case 5: openEdit(player, searchId); break;
      case 6: openRewardChest(player, searchId); break;
      case 7: openMessages(player, searchId); break;
      case 8: {
        const n = respawnSearch(s);
        actionBar(player, `§a[Search] Reaparecidas §f${n}§a cabezas.`);
        openManage(player, searchId);
        break;
      }
      case 9: openTeleport(player, searchId); break;
      case 10: openDelete(player, searchId); break;
      case 11: openReview(player); break;
    }
  });
}

function openReset(player, searchId) {
  const db = loadDB();
  const s = db[searchId];
  if (!s) return;
  const found = s.heads.filter((h) => h.found).length;
  const form = new MessageFormData()
    .title("Reset de búsqueda")
    .body(`§e¿Resetear §f${s.name}§e?\n§7${found} cabezas marcadas como encontradas volverán a estar disponibles.`)
    .button1("§aSí, resetear")
    .button2("Cancelar");
  form.show(player).then((res) => {
    if (res.canceled) {
      openManage(player, searchId);
      return;
    }
    if (res.selection === 0) {
      const db2 = loadDB();
      const s2 = db2[searchId];
      if (!s2) return;
      for (const h of s2.heads) {
        h.found = false;
        delete h.foundBy;
      }
      saveDB(db2);
      respawnSearch(s2);
      log(`${player.name} reseteó la búsqueda '${s2.name}'.`);
      actionBar(player, `§a[Search] §f${s2.name}§a reseteada: ya se pueden encontrar de nuevo.`);
    }
    openManage(player, searchId);
  });
}

function addHeadHere(player, searchId) {
  const db = loadDB();
  const s = db[searchId];
  if (!s) return;
  const loc = player.location;
  const h = {
    x: Math.floor(loc.x), y: Math.floor(loc.y), z: Math.floor(loc.z),
    dim: player.dimension.id, found: false, skin: getSkin(player), size: getSize(player), fx: getFx(player), celeb: getCeleb(player)
  };
  s.heads.push(h);
  saveDB(db);
  refreshHead(s, s.heads.length - 1);
  const cat = HEAD_CATALOG[clampSkin(h.skin)];
  player.sendMessage(`§a[Search] §${colorCode(cat.color)}${cat.name}§a añadida a §f${s.name}§a.`);
  openManage(player, searchId);
}

function openHeadList(player, searchId) {
  const db = loadDB();
  const s = db[searchId];
  if (!s) return;
  const form = new ActionFormData().title(`Cabezas de ${s.name}`);
  form.body(s.heads.length === 0 ? "§7Esta búsqueda no tiene cabezas todavía." : "§7Selecciona una cabeza para editarla:");
  s.heads.forEach((h, i) => {
    const cat = HEAD_CATALOG[clampSkin(h.skin)];
    form.button(`§${colorCode(cat.color)}${headName(h)} §7#${i + 1}\n§8${h.x},${h.y},${h.z}` + (h.found ? " §a✔" : ""), headIcon(clampSkin(h.skin)));
  });
  form.button("§7« Volver");
  form.show(player).then((res) => {
    if (res.canceled) return;
    if (res.selection === s.heads.length) {
      openManage(player, searchId);
      return;
    }
    openHeadEdit(player, searchId, res.selection);
  });
}

function openHeadEdit(player, searchId, index) {
  const db = loadDB();
  const s = db[searchId];
  if (!s || !s.heads[index]) {
    openHeadList(player, searchId);
    return;
  }
  const h = s.heads[index];
  const names = HEAD_CATALOG.map((c) => c.name);
  const curHex = Array.isArray(h.pcolor) ? rgbToHex(h.pcolor) : rgbToHex(HEAD_CATALOG[clampSkin(h.skin)].rgb);
  const form = new ModalFormData()
    .title(`Editar cabeza #${index + 1}`)
    .dropdown("Tipo de cabeza (skin)", names, clampSkin(h.skin))
    .dropdown("Tamaño", SIZE_NAMES, headSize(h))
    .dropdown("Partícula al encontrar", FX_NAMES, headFx(h))
    .dropdown("Animación 3D al encontrar", CELEB_NAMES, headCeleb(h))
    .textField("Nombre personalizado (vacío = automático)", headName(h), h.name || "")
    .textField("Color de partícula HEX (ej. #ff8800)", curHex, curHex)
    .toggle("Eliminar esta cabeza", false);
  form.show(player).then((res) => {
    if (res.canceled) {
      openHeadList(player, searchId);
      return;
    }
    const [skinIdx, sizeIdx, fxIdx, celebIdx, name, hex, del] = res.formValues;
    const db2 = loadDB();
    const s2 = db2[searchId];
    if (!s2 || !s2.heads[index]) return;
    const h2 = s2.heads[index];
    if (del) {
      // quita bloque y holograma reales
      try {
        const d = world.getDimension(h2.dim || "minecraft:overworld");
        const b = d.getBlock({ x: h2.x, y: h2.y, z: h2.z });
        if (b && b.typeId === HEAD_ID) b.setType("minecraft:air");
      } catch (e) {}
      removeHolos(searchId, index);
      s2.heads.splice(index, 1);
      saveDB(db2);
      // re-sincroniza hologramas (los índices cambiaron)
      respawnSearch(s2);
      actionBar(player, "§c[Search] Cabeza eliminada.");
      openHeadList(player, searchId);
      return;
    }
    h2.skin = clampSkin(skinIdx);
    h2.size = clampSize(sizeIdx);
    h2.fx = clampFx(fxIdx);
    h2.celeb = clampCeleb(celebIdx);
    const nm = String(name || "").trim();
    if (nm.length) h2.name = nm;
    else delete h2.name;
    const pc = parseHex(hex);
    if (pc) h2.pcolor = pc;
    else delete h2.pcolor;
    saveDB(db2);
    refreshHead(s2, index);
    actionBar(player, `§a[Search] Cabeza #${index + 1} actualizada (${SIZE_NAMES[h2.size]}, ${FX_NAMES[h2.fx]}, ${CELEB_NAMES[h2.celeb]}).`);
    openHeadList(player, searchId);
  });
}

function openInfo(player, searchId) {
  const db = loadDB();
  const s = db[searchId];
  if (!s) return;
  let body = `§${colorCode(s.color)}§l${s.name}§r\n\n`;
  body += `§7Creador: §f${s.createdBy}\n`;
  body += `§7Recompensa cmd: §f${s.reward && s.reward.length ? s.reward : "(ninguna)"}\n`;
  body += `§7Recompensa cofre: §f${itemsSummary(s.rewardItems)}\n`;
  body += `§7Total cabezas: §f${s.heads.length}\n`;
  body += `§7Encontradas: §a${s.heads.filter((h) => h.found).length}\n\n`;
  s.heads.forEach((h, i) => {
    const cat = HEAD_CATALOG[clampSkin(h.skin)];
    body += `§7#${i + 1} §${colorCode(cat.color)}${headName(h)}§7: §f${h.x}, ${h.y}, ${h.z} ` +
      (h.found ? `§a(✔ ${h.foundBy || ""})` : "§c(pendiente)") + "\n";
  });
  const form = new MessageFormData().title("Info").body(body).button1("Volver").button2("Cerrar");
  form.show(player).then((res) => {
    if (!res.canceled && res.selection === 0) openManage(player, searchId);
  });
}

function openEdit(player, searchId) {
  const db = loadDB();
  const s = db[searchId];
  if (!s) return;
  const form = new ModalFormData()
    .title("Editar búsqueda")
    .textField("Nombre", s.name, s.name)
    .textField("Color (0-9, a-f)", s.color, s.color)
    .textField("Comando de recompensa (@s)", s.reward || "", s.reward || "")
    .toggle("Refrescar tras guardar", true);
  form.show(player).then((res) => {
    if (res.canceled) return;
    const [name, color, reward, refresh] = res.formValues;
    const db2 = loadDB();
    const s2 = db2[searchId];
    if (!s2) return;
    s2.name = (name && String(name).trim()) || s2.name;
    s2.color = colorCode(color);
    s2.reward = reward ? String(reward) : "";
    saveDB(db2);
    if (refresh) respawnSearch(s2);
    actionBar(player, `§a[Search] Búsqueda actualizada: §f${s2.name}`);
    openManage(player, searchId);
  });
}

function openRewardChest(player, searchId) {
  const db = loadDB();
  const s = db[searchId];
  if (!s) return;
  const bound = s.rewardChest ? `§f${s.rewardChest.x}, ${s.rewardChest.y}, ${s.rewardChest.z}` : "§csin vincular";
  const items = s.rewardItems || [];
  const form = new ActionFormData()
    .title("Recompensa por cofre")
    .body(
      `§7Cofre vinculado: ${bound}\n` +
        `§7Items guardados: §f${itemsSummary(items)}\n\n` +
        `§e§lPasos:\n` +
        `§71) Coloca un cofre y mete dentro los items de recompensa.\n` +
        `§72) Pulsa §fVincular cofre§7 y luego §ftoca el cofre§7.\n` +
        `§7Se guardan los items y se entregan al encontrar cada cabeza.\n`
    )
    .button("§aVincular cofre y guardar items", "textures/custom_ui/icon_place")
    .button("§eDarme un cofre", "textures/custom_ui/icon_create")
    .button("§bRe-leer items del cofre", "textures/custom_ui/icon_reload")
    .button("§cQuitar recompensa de items", "textures/custom_ui/icon_delete")
    .button("§7« Volver");
  form.show(player).then((res) => {
    if (res.canceled) {
      openManage(player, searchId);
      return;
    }
    switch (res.selection) {
      case 0:
        setBindReward(player, searchId);
        actionBar(player, "§a[Search] Ahora §etoca un cofre§a para guardarlo como recompensa.");
        player.sendMessage("§7[Search] Toca el cofre lleno con los items de recompensa. (Vuelve al menú para cancelar.)");
        // se cierra el menú a propósito para poder tocar el cofre
        break;
      case 1:
        try {
          player.runCommand("give @s chest 1");
        } catch (e) {}
        actionBar(player, "§a[Search] Cofre entregado. Llénalo y vincúlalo.");
        openRewardChest(player, searchId);
        break;
      case 2: {
        const db2 = loadDB();
        const s2 = db2[searchId];
        if (s2 && s2.rewardChest) {
          const live = readChestItems(s2.rewardChest.dim, { x: s2.rewardChest.x, y: s2.rewardChest.y, z: s2.rewardChest.z });
          if (live) {
            s2.rewardItems = live;
            saveDB(db2);
            actionBar(player, `§a[Search] Items actualizados: §f${itemsSummary(live)}`);
          } else {
            actionBar(player, "§c[Search] No pude leer el cofre (¿está cargado el chunk?).");
          }
        } else {
          actionBar(player, "§c[Search] No hay cofre vinculado todavía.");
        }
        openRewardChest(player, searchId);
        break;
      }
      case 3: {
        const db2 = loadDB();
        const s2 = db2[searchId];
        if (s2) {
          delete s2.rewardItems;
          delete s2.rewardChest;
          saveDB(db2);
        }
        actionBar(player, "§a[Search] Recompensa de items eliminada.");
        openRewardChest(player, searchId);
        break;
      }
      case 4:
        openManage(player, searchId);
        break;
    }
  });
}

function openMessages(player, searchId) {
  const db = loadDB();
  const s = db[searchId];
  if (!s) return;
  const t = s.title || DEFAULT_TITLE;
  const sub = s.subtitle || DEFAULT_SUBTITLE;
  const form = new ModalFormData()
    .title("Editar title / subtitle")
    .textField("Título al encontrar\n§7{found} {total} {head} {search} {player} §{hc} §{sc}", t, t)
    .textField("Subtítulo al encontrar", sub, sub);
  form.show(player).then((res) => {
    if (res.canceled) {
      openManage(player, searchId);
      return;
    }
    const [nt, nsub] = res.formValues;
    const db2 = loadDB();
    const s2 = db2[searchId];
    if (!s2) return;
    s2.title = nt !== undefined && String(nt).length ? String(nt) : DEFAULT_TITLE;
    s2.subtitle = nsub !== undefined ? String(nsub) : DEFAULT_SUBTITLE;
    saveDB(db2);
    const exTotal = s2.heads.length || 20;
    const ctx = { found: 1, total: exTotal, head: HEAD_CATALOG[0].name, search: s2.name, player: player.name, hc: "6", sc: colorCode(s2.color) };
    showTitle(player, applyTemplate(s2.title, ctx), applyTemplate(s2.subtitle, ctx));
    actionBar(player, "§a[Search] Mensajes actualizados (vista previa arriba).");
    openManage(player, searchId);
  });
}

function openDelete(player, searchId) {
  const db = loadDB();
  const s = db[searchId];
  if (!s) return;
  const form = new MessageFormData()
    .title("Eliminar búsqueda")
    .body(`§c¿Eliminar §f${s.name}§c?\n§7Se borrarán sus cabezas y hologramas.`)
    .button1("§cSí, eliminar")
    .button2("Cancelar");
  form.show(player).then((res) => {
    if (res.canceled) return;
    if (res.selection === 0) {
      const db2 = loadDB();
      const s2 = db2[searchId];
      if (s2) {
        for (const h of s2.heads) {
          try {
            const d = world.getDimension(h.dim || "minecraft:overworld");
            const b = d.getBlock({ x: h.x, y: h.y, z: h.z });
            if (b && b.typeId === HEAD_ID) b.setType("minecraft:air");
          } catch (e) {}
        }
      }
      removeHolos(searchId, null);
      delete db2[searchId];
      saveDB(db2);
      if (getActiveSearch(player) === searchId) setActiveSearch(player, "");
      log(`${player.name} eliminó la búsqueda '${s.name}'.`);
      player.sendMessage(`§a[Search] Búsqueda §f${s.name}§a eliminada.`);
      openReview(player);
    } else {
      openManage(player, searchId);
    }
  });
}

function openTeleport(player, searchId) {
  const db = loadDB();
  const s = db[searchId];
  if (!s || s.heads.length === 0) {
    player.sendMessage("§c[Search] No hay cabezas para teletransportarse.");
    openManage(player, searchId);
    return;
  }
  const form = new ActionFormData().title("Teletransportar").body("Elige una cabeza:");
  s.heads.forEach((h, i) => {
    const cat = HEAD_CATALOG[clampSkin(h.skin)];
    form.button(`§${colorCode(cat.color)}${headName(h)} §7#${i + 1}\n§f${h.x}, ${h.y}, ${h.z}` + (h.found ? " §a✔" : ""));
  });
  form.button("§7« Volver");
  form.show(player).then((res) => {
    if (res.canceled) return;
    if (res.selection === s.heads.length) {
      openManage(player, searchId);
      return;
    }
    const h = s.heads[res.selection];
    try {
      const dim = world.getDimension(h.dim || "minecraft:overworld");
      player.teleport({ x: h.x + 0.5, y: h.y + 1, z: h.z + 0.5 }, { dimension: dim });
      actionBar(player, `§a[Search] Teletransportado a la cabeza #${res.selection + 1}.`);
    } catch (e) {
      player.sendMessage("§c[Search] No se pudo teletransportar.");
    }
  });
}

// ----------------------------- proximidad: aviso [Interactuar] -----------------------------

function proximityHints() {
  const db = loadDB();
  const players = world.getAllPlayers();
  for (const p of players) {
    const pl = p.location;
    const dim = p.dimension.id;
    let best = null;
    let bestd = 999;
    for (const s of searchList(db)) {
      const total = s.heads.length;
      const found = s.heads.filter((x) => x.found).length;
      for (let i = 0; i < s.heads.length; i++) {
        const h = s.heads[i];
        if (h.found) continue;
        if ((h.dim || "minecraft:overworld") !== dim) continue;
        const c = center(h);
        const dx = pl.x - c.x, dy = pl.y - (h.y + 0.4), dz = pl.z - c.z;
        const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
        if (d < bestd) {
          bestd = d;
          best = { s, h, found, total };
        }
      }
    }
    if (best && bestd <= HINT_RADIUS) {
      const cat = HEAD_CATALOG[clampSkin(best.h.skin)];
      actionBar(p, `§e❖ §f[Interactuar] §7para recoger §${colorCode(cat.color)}§l${headName(best.h)}§r §8(§a${best.found}§8/§f${best.total}§8)`);
    }
  }
}

// ----------------------------- eventos -----------------------------

world.afterEvents.itemUse.subscribe((event) => {
  const { source, itemStack } = event;
  if (itemStack && itemStack.typeId === "minecraft:compass") {
    system.run(() => openMain(source));
  }
});

world.afterEvents.playerPlaceBlock.subscribe((event) => {
  const { player, block } = event;
  if (block && block.typeId === HEAD_ID) {
    system.run(() => {
      try {
        onPlaceHead(player, block);
      } catch (e) {}
    });
  }
});

// Encontrar al INTERACTUAR (clic derecho) con el bloque-cabeza
world.afterEvents.playerInteractWithBlock.subscribe((event) => {
  const { player, block, itemStack } = event;
  if (!block) return;
  // vincular cofre de recompensa (admin en modo "vincular")
  const bindId = getBindReward(player);
  if (bindId && CHEST_IDS.indexOf(block.typeId) !== -1) {
    setBindReward(player, "");
    const bloc = { x: block.location.x, y: block.location.y, z: block.location.z };
    const dimId = player.dimension.id;
    system.run(() => {
      try {
        const items = readChestItems(dimId, bloc) || [];
        const db = loadDB();
        const s = db[bindId];
        if (s) {
          s.rewardChest = { x: bloc.x, y: bloc.y, z: bloc.z, dim: dimId };
          s.rewardItems = items;
          saveDB(db);
        }
        actionBar(player, `§a[Search] Cofre vinculado: §f${items.length}§a item(s) guardados como recompensa.`);
        log(`${player.name} vinculó un cofre de recompensa (${items.length} items).`);
      } catch (e) {}
    });
    return;
  }
  if (block.typeId !== HEAD_ID) return;
  if (itemStack && itemStack.typeId === HEAD_ID) return; // está construyendo
  if (player.isSneaking) return;
  handleFound(player, block.location, player.dimension.id);
});

// Encontrar al ROMPER (clic izquierdo): la cabeza NO se rompe, solo cuenta como encontrada.
// Un admin agachado (shift) SÍ la rompe de verdad (limpieza).
world.beforeEvents.playerBreakBlock.subscribe((event) => {
  const { player, block } = event;
  if (!block || block.typeId !== HEAD_ID) return;
  const loc = { x: block.location.x, y: block.location.y, z: block.location.z };
  const dimId = block.dimension.id;
  if (isAdmin(player) && player.isSneaking) {
    // se permite romper de verdad (no se cancela el evento)
    system.run(() => {
      try {
        removeHeadAt(loc, dimId, player);
      } catch (e) {}
    });
    return;
  }
  event.cancel = true; // la cabeza NO se rompe
  system.run(() => {
    try {
      handleFound(player, loc, dimId);
    } catch (e) {}
  });
});

world.afterEvents.worldInitialize.subscribe(() => {
  system.runTimeout(() => {
    try {
      reloadAll();
    } catch (e) {}
  }, 40);
  log("v8.1.0 cargado: " + HEAD_CATALOG.length + " cabezas + " + CELEB_NAMES.length + " animaciones 3D + recompensa por cofre. Usa /tag @p add admin para gestionar.");
});

// Aviso [Interactuar] al acercarse
system.runInterval(() => {
  try {
    proximityHints();
  } catch (e) {}
}, 6);

// Partículas flotantes SOBRE las cabezas no encontradas (cerca de jugadores)
system.runInterval(() => {
  try {
    ambientAbove();
  } catch (e) {}
}, 8);

log("script inicializado.");
