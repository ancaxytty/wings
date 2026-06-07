import { world, system, BlockPermutation, MolangVariableMap } from "@minecraft/server";
import { ActionFormData, ModalFormData, MessageFormData } from "@minecraft/server-ui";

/*
 * The Search MCPE v6
 * - 16 CABEZAS como ENTIDADES interactivas (wings:head, propiedad wings:skin 0..15).
 *   -> muestran el botón nativo "Interactuar" (minecraft:interact) como un NPC.
 * - El jugador COLOCA el bloque-cabeza (wings:head block); al colocarlo se convierte
 *   en la entidad con la cabeza seleccionada y se registra en la búsqueda activa.
 * - Encontrar = INTERACTUAR. Recompensa + partículas del color de la cabeza + TITLE/SUBTITLE.
 * - Edición POR CABEZA: skin, nombre, color de partícula, eliminar.
 * - Title/subtitle editables por búsqueda. Hologramas + llama de antorcha. GUI pro.
 */

const DB_KEY = "wings:searches";
const HEAD_ID = "wings:head";          // mismo id para bloque (placer) y entidad
const HOLO_ID = "wings:hologram";
const TITLE = "The Search MCPE";
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

function headIcon(skin) {
  return `textures/custom_ui/heads/h${skin}`;
}
function clampSkin(n) {
  n = Math.floor(Number(n));
  if (!Number.isFinite(n) || n < 0) return 0;
  if (n > HEAD_CATALOG.length - 1) return HEAD_CATALOG.length - 1;
  return n;
}
function headName(h) {
  if (h && typeof h.name === "string" && h.name.length) return h.name;
  return HEAD_CATALOG[clampSkin(h ? h.skin : 0)].name;
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

// ----------------------------- Base de datos -----------------------------

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
function colorCode(c) {
  const ok = "0123456789abcdef";
  if (typeof c !== "string" || c.length !== 1 || !ok.includes(c.toLowerCase())) return "e";
  return c.toLowerCase();
}

// ----------------------------- Estado por jugador -----------------------------

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

// Tamaños y partículas
const SIZE_NAMES = ["Pequeña", "Normal", "Grande", "Gigante"];
const FX_NAMES = [
  "Destello", "Corazones", "Estrellas", "Nieve", "Fuego", "Magia",
  "Confeti", "Humo", "Ender", "Notas", "Burbujas", "Brillos"
];
function clampSize(n) {
  n = Math.floor(Number(n));
  return Number.isFinite(n) && n >= 0 && n <= 3 ? n : 1;
}
function clampFx(n) {
  n = Math.floor(Number(n));
  return Number.isFinite(n) && n >= 0 && n <= 11 ? n : 0;
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
function headSize(h) {
  return clampSize(h && h.size !== undefined ? h.size : 1);
}
function headFx(h) {
  return clampFx(h && h.fx !== undefined ? h.fx : 0);
}

// ----------------------------- Title / Subtitle / ActionBar -----------------------------

function showTitle(player, title, subtitle) {
  try {
    player.onScreenDisplay.setTitle(title, {
      fadeInDuration: 5,
      stayDuration: 45,
      fadeOutDuration: 12,
      subtitle: subtitle || ""
    });
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
    found: foundCount,
    total: total,
    head: headName(h),
    search: s.name,
    player: playerName,
    hc: colorCode(HEAD_CATALOG[clampSkin(h.skin)].color),
    sc: colorCode(s.color)
  };
}

// ----------------------------- Entidades: cabezas + hologramas -----------------------------

function center(h) {
  return { x: h.x + 0.5, y: h.y, z: h.z + 0.5 };
}

function holoLines(search, h, index, total) {
  const cat = HEAD_CATALOG[clampSkin(h.skin)];
  const c = colorCode(cat.color);
  return [
    `§8§l✦ §r§${c}§l${headName(h)}§r §8§l✦`,
    `§7▶ §f¡Interactúa! §7◀`,
    `§8${search.name} · §7${index + 1}/${total}`
  ];
}

function spawnHead(dimension, search, index) {
  const h = search.heads[index];
  const c = center(h);
  try {
    const ent = dimension.spawnEntity(HEAD_ID, { x: c.x, y: h.y, z: c.z });
    ent.setDynamicProperty("wings:search", search.id);
    ent.setDynamicProperty("wings:index", index);
    ent.addTag("wings_head");
    try {
      ent.setProperty("wings:skin", clampSkin(h.skin));
    } catch (e) {}
    try {
      ent.triggerEvent("wings:size" + headSize(h));
    } catch (e) {}
  } catch (e) {}
  const lines = holoLines(search, h, index, search.heads.length);
  for (let i = 0; i < 3; i++) {
    try {
      const holo = dimension.spawnEntity(HOLO_ID, { x: c.x, y: h.y + 0.95 + i * 0.27, z: c.z });
      holo.setDynamicProperty("wings:search", search.id);
      holo.setDynamicProperty("wings:index", index);
      holo.addTag("wings_holo");
      holo.nameTag = lines[2 - i];
    } catch (e) {}
  }
}

function getWingsEntities(typeId, searchId) {
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
      list = dim.getEntities({ type: typeId });
    } catch (e) {
      continue;
    }
    for (const e of list) {
      if (searchId === null || e.getDynamicProperty("wings:search") === searchId) out.push(e);
    }
  }
  return out;
}

function removeHead(searchId, index) {
  const ents = getWingsEntities(HEAD_ID, searchId).concat(getWingsEntities(HOLO_ID, searchId));
  for (const e of ents) {
    if (index === null || e.getDynamicProperty("wings:index") === index) {
      try {
        e.remove();
      } catch (err) {}
    }
  }
}

function respawnSearch(search) {
  removeHead(search.id, null);
  let count = 0;
  for (let i = 0; i < search.heads.length; i++) {
    const h = search.heads[i];
    if (h.found) continue;
    let d;
    try {
      d = world.getDimension(h.dim || "minecraft:overworld");
    } catch (e) {
      d = world.getDimension("minecraft:overworld");
    }
    spawnHead(d, search, i);
    count++;
  }
  return count;
}

function reloadAll() {
  const db = loadDB();
  // limpia TODO antes de recrear (evita duplicados)
  removeHead(null, null);
  let total = 0;
  for (const s of searchList(db)) total += respawnSearch(s);
  return total;
}

// ----------------------------- Partículas -----------------------------

function torchOnUnfoundHeads() {
  const db = loadDB();
  const players = world.getAllPlayers();
  for (const s of searchList(db)) {
    for (let i = 0; i < s.heads.length; i++) {
      const h = s.heads[i];
      if (h.found) continue;
      const c = center(h);
      let near = false;
      for (const p of players) {
        if (p.dimension.id !== (h.dim || "minecraft:overworld")) continue;
        const pl = p.location;
        if (Math.abs(pl.x - c.x) < 48 && Math.abs(pl.z - c.z) < 48 && Math.abs(pl.y - c.y) < 48) {
          near = true;
          break;
        }
      }
      if (!near) continue;
      try {
        world.getDimension(h.dim || "minecraft:overworld").spawnParticle("wings:torch", {
          x: c.x,
          y: h.y + 0.95,
          z: c.z
        });
      } catch (e) {}
    }
  }
}

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
      actionBar(
        p,
        `§e❖ §f[Interactuar] §7para recoger §${colorCode(cat.color)}§l${headName(best.h)}§r §8(§a${best.found}§8/§f${best.total}§8)`
      );
    }
  }
}

function foundExplosion(dimension, loc, h) {
  const fxId = "wings:fx" + headFx(h);
  const pts = [
    { x: loc.x, y: loc.y + 0.4, z: loc.z },
    { x: loc.x, y: loc.y + 0.8, z: loc.z },
    { x: loc.x, y: loc.y + 0.15, z: loc.z }
  ];
  for (const p of pts) {
    try {
      dimension.spawnParticle(fxId, p, colorMapFor(h));
    } catch (e) {}
  }
  try {
    dimension.spawnParticle("minecraft:totem_particle", { x: loc.x, y: loc.y + 0.6, z: loc.z });
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

// ----------------------------- Hallazgo (interactuar) -----------------------------

function handleFoundEntity(player, entity) {
  const id = entity.getDynamicProperty("wings:search");
  const index = entity.getDynamicProperty("wings:index");
  const loc = entity.location;
  if (typeof id !== "string" || typeof index !== "number") {
    // cabeza decorativa (no registrada)
    try {
      player.dimension.spawnParticle("wings:fx0", { x: loc.x, y: loc.y + 0.6, z: loc.z });
      player.playSound("random.orb", { pitch: 1.2 });
    } catch (e) {}
    return;
  }
  const db = loadDB();
  const s = db[id];
  if (!s || !s.heads[index]) {
    try { entity.remove(); } catch (e) {}
    return;
  }
  const h = s.heads[index];
  if (h.found) return;
  h.found = true;
  h.foundBy = player.name;
  saveDB(db);
  removeHead(id, index);

  foundExplosion(player.dimension, { x: loc.x, y: loc.y + 0.3, z: loc.z }, h);
  try {
    player.playSound("random.levelup", { volume: 1, pitch: 1.2 });
    player.playSound("random.chestopen", { pitch: 1.1 });
  } catch (e) {}

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
  if (foundCount >= total && total > 0) {
    showTitle(player, "§6§l¡COMPLETADA!", `§e${s.name} §7· ¡todas las cabezas!`);
    world.sendMessage(`§6§l[${TITLE}] §r§e${player.name} §acompletó §${colorCode(s.color)}${s.name}§a!`);
  }
}

// ----------------------------- Colocar el bloque (se convierte en entidad) -----------------------------

function onPlaceHead(player, block) {
  const loc = block.location;
  const skin = getSkin(player);
  const dim = player.dimension;
  // quita el bloque y coloca la entidad-cabeza
  try {
    if (block.typeId === HEAD_ID) block.setType("minecraft:air");
  } catch (e) {}

  const id = getActiveSearch(player);
  const db = loadDB();
  const cat = HEAD_CATALOG[skin];

  if (!id || !db[id]) {
    // decorativa (sin registrar)
    try {
      const ent = dim.spawnEntity(HEAD_ID, { x: loc.x + 0.5, y: loc.y, z: loc.z + 0.5 });
      ent.setProperty("wings:skin", skin);
      ent.triggerEvent("wings:size" + getSize(player));
    } catch (e) {}
    actionBar(player, `§e[Search] §${colorCode(cat.color)}${cat.name}§7 colocada (sin búsqueda activa). §8Brújula → Crear/activar.`);
    return;
  }
  const s = db[id];
  const h = { x: loc.x, y: loc.y, z: loc.z, dim: dim.id, found: false, skin: skin, size: getSize(player), fx: getFx(player) };
  s.heads.push(h);
  saveDB(db);
  spawnHead(dim, s, s.heads.length - 1);
  try {
    player.playSound("random.orb", { pitch: 1.3 });
  } catch (e) {}
  actionBar(player, `§a[Search] §${colorCode(cat.color)}${cat.name}§a añadida a §f${s.name}§a §7(${s.heads.length})`);
}

// ----------------------------- GUI -----------------------------

function activeLabel(player) {
  const id = getActiveSearch(player);
  const db = loadDB();
  if (id && db[id]) return db[id].name;
  return "ninguna";
}

function openMain(player) {
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
        `§6§l✦ §r§eThe Search§r §6§l✦\n` +
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
  const form = new ActionFormData()
    .title("Galería de Cabezas")
    .body(
      `§7Activa: §f${activeLabel(player)}\n` +
        `§7Cabeza: §f${HEAD_CATALOG[cur].name}  §8| §7Tamaño: §f${SIZE_NAMES[sz]}  §8| §7Partícula: §f${FX_NAMES[fxi]}\n` +
        `§7Elige una cabeza (te daré el bloque):`
    );
  for (let i = 0; i < HEAD_CATALOG.length; i++) {
    const cat = HEAD_CATALOG[i];
    const mark = i === cur ? " §a✔" : "";
    form.button(`§${colorCode(cat.color)}${cat.name}${mark}`, headIcon(i));
  }
  const iSize = HEAD_CATALOG.length;
  const iFx = HEAD_CATALOG.length + 1;
  const iBack = HEAD_CATALOG.length + 2;
  form.button(`§6⚙ Tamaño: §f${SIZE_NAMES[sz]} §8»`, "textures/custom_ui/icon_reload");
  form.button(`§d✨ Partícula: §f${FX_NAMES[fxi]} §8»`, "textures/custom_ui/icon_reload");
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
    setSkin(player, res.selection);
    const cat = HEAD_CATALOG[res.selection];
    selectBurst(player, res.selection);
    try {
      player.runCommand("give @s wings:head 1");
    } catch (e) {}
    actionBar(player, `§a[Search] §${colorCode(cat.color)}${cat.name}§a (${SIZE_NAMES[getSize(player)]}) — colócala donde quieras.`);
    player.sendMessage(`§a[Search] Seleccionaste §${colorCode(cat.color)}${cat.name}§a. Te di 1 bloque; el que coloques tomará esta cabeza, tamaño y partícula.`);
  });
}

function openHelp(player) {
  const form = new MessageFormData()
    .title(TITLE)
    .body(
      `§e§l${TITLE}§r\n\n` +
        "§6§lCómo se juega§r\n" +
        "§7• Abre el menú con una §fbrújula§7.\n" +
        "§7• En §fCabezas§7 eliges una de las §f16§7, su §6tamaño§7 y su §dpartícula§7.\n" +
        "§7• §fColoca§7 el bloque: se vuelve una cabeza con botón\n  §e[Interactuar]§7 y se añade a la búsqueda activa.\n" +
        "§7• Acércate y pulsa §e[Interactuar]§7 (como un NPC) para hallarla:\n  §dpartículas§7, §atítulo§7 y recompensa.\n" +
        "§7• Edita cada cabeza (skin, tamaño, nombre, partícula) en\n  §fRevisar → Gestionar → Editar cabezas§7.\n"
    )
    .button1("§aRecargar todo")
    .button2("Cerrar");
  form.show(player).then((res) => {
    if (!res.canceled && res.selection === 0) {
      const n = reloadAll();
      actionBar(player, `§a[Search] Recargado. Cabezas activas: §f${n}`);
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
      id,
      name: (name && String(name).trim()) || "Búsqueda",
      color: colorCode(color),
      reward: reward ? String(reward) : "",
      createdBy: player.name,
      heads: [],
      title: DEFAULT_TITLE,
      subtitle: DEFAULT_SUBTITLE
    };
    db[id] = s;
    saveDB(db);
    if (makeActive) setActiveSearch(player, id);
    player.sendMessage(
      `§a[Search] Búsqueda §f${s.name}§a creada${makeActive ? " §7(activa)" : ""}.\n` +
        "§7Elige una cabeza en el menú y colócala por el mundo."
    );
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
    .button("§5Editar cabezas (nombre/partícula)", "textures/custom_ui/icon_review")
    .button("§bInfo de la búsqueda", "textures/custom_ui/icon_help")
    .button("§eEditar (nombre/color/recompensa)", "textures/custom_ui/icon_review")
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
      case 3: openInfo(player, searchId); break;
      case 4: openEdit(player, searchId); break;
      case 5: openMessages(player, searchId); break;
      case 6: {
        const n = respawnSearch(s);
        actionBar(player, `§a[Search] Reaparecidas §f${n}§a cabezas.`);
        openManage(player, searchId);
        break;
      }
      case 7: openTeleport(player, searchId); break;
      case 8: openDelete(player, searchId); break;
      case 9: openReview(player); break;
    }
  });
}

function addHeadHere(player, searchId) {
  const db = loadDB();
  const s = db[searchId];
  if (!s) return;
  const loc = player.location;
  const skin = getSkin(player);
  const h = {
    x: Math.floor(loc.x),
    y: Math.floor(loc.y),
    z: Math.floor(loc.z),
    dim: player.dimension.id,
    found: false,
    skin: skin,
    size: getSize(player),
    fx: getFx(player)
  };
  s.heads.push(h);
  saveDB(db);
  spawnHead(player.dimension, s, s.heads.length - 1);
  const cat = HEAD_CATALOG[skin];
  player.sendMessage(`§a[Search] §${colorCode(cat.color)}${cat.name}§a añadida a §f${s.name}§a.`);
  openManage(player, searchId);
}

// ---- Edición POR CABEZA ----

function openHeadList(player, searchId) {
  const db = loadDB();
  const s = db[searchId];
  if (!s) return;
  const form = new ActionFormData().title(`Cabezas de ${s.name}`);
  if (s.heads.length === 0) {
    form.body("§7Esta búsqueda no tiene cabezas todavía.");
  } else {
    form.body("§7Selecciona una cabeza para editarla:");
  }
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
    .textField("Nombre personalizado (vacío = automático)", headName(h), h.name || "")
    .textField("Color de partícula HEX (ej. #ff8800)", curHex, curHex)
    .toggle("Eliminar esta cabeza", false);
  form.show(player).then((res) => {
    if (res.canceled) {
      openHeadList(player, searchId);
      return;
    }
    const [skinIdx, sizeIdx, fxIdx, name, hex, del] = res.formValues;
    const db2 = loadDB();
    const s2 = db2[searchId];
    if (!s2 || !s2.heads[index]) return;
    const h2 = s2.heads[index];
    if (del) {
      removeHead(searchId, index);
      h2.found = true;
      h2.foundBy = "(eliminada)";
      saveDB(db2);
      actionBar(player, "§c[Search] Cabeza eliminada.");
      openHeadList(player, searchId);
      return;
    }
    h2.skin = clampSkin(skinIdx);
    h2.size = clampSize(sizeIdx);
    h2.fx = clampFx(fxIdx);
    const nm = String(name || "").trim();
    if (nm.length) h2.name = nm;
    else delete h2.name;
    const pc = parseHex(hex);
    if (pc) h2.pcolor = pc;
    else delete h2.pcolor;
    saveDB(db2);
    if (!h2.found) {
      removeHead(searchId, index);
      spawnHead(world.getDimension(h2.dim || "minecraft:overworld"), s2, index);
    }
    actionBar(player, `§a[Search] Cabeza #${index + 1} actualizada (${SIZE_NAMES[h2.size]}, ${FX_NAMES[h2.fx]}).`);
    openHeadList(player, searchId);
  });
}

function openInfo(player, searchId) {
  const db = loadDB();
  const s = db[searchId];
  if (!s) return;
  let body = `§${colorCode(s.color)}§l${s.name}§r\n\n`;
  body += `§7Creador: §f${s.createdBy}\n`;
  body += `§7Recompensa: §f${s.reward && s.reward.length ? s.reward : "(ninguna)"}\n`;
  body += `§7Total cabezas: §f${s.heads.length}\n`;
  body += `§7Encontradas: §a${s.heads.filter((h) => h.found).length}\n\n`;
  s.heads.forEach((h, i) => {
    const cat = HEAD_CATALOG[clampSkin(h.skin)];
    body +=
      `§7#${i + 1} §${colorCode(cat.color)}${headName(h)}§7: §f${h.x}, ${h.y}, ${h.z} ` +
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

function openMessages(player, searchId) {
  const db = loadDB();
  const s = db[searchId];
  if (!s) return;
  const t = s.title || DEFAULT_TITLE;
  const sub = s.subtitle || DEFAULT_SUBTITLE;
  const form = new ModalFormData()
    .title("Editar title / subtitle")
    .textField(
      "Título al encontrar\n§7Placeholders: {found} {total} {head} {search} {player} §{hc} §{sc}",
      t,
      t
    )
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
    const ctx = {
      found: 1, total: exTotal, head: HEAD_CATALOG[0].name, search: s2.name,
      player: player.name, hc: "6", sc: colorCode(s2.color)
    };
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
      removeHead(searchId, null);
      const db2 = loadDB();
      delete db2[searchId];
      saveDB(db2);
      if (getActiveSearch(player) === searchId) setActiveSearch(player, "");
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

// ----------------------------- Eventos -----------------------------

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

// Encontrar al INTERACTUAR con la entidad (botón "Interactuar")
world.afterEvents.playerInteractWithEntity.subscribe((event) => {
  const { player, target } = event;
  if (!target || target.typeId !== HEAD_ID) return;
  handleFoundEntity(player, target);
});

// Fallback: golpear la cabeza también la encuentra
world.afterEvents.entityHitEntity.subscribe((event) => {
  const { damagingEntity, hitEntity } = event;
  if (!hitEntity || hitEntity.typeId !== HEAD_ID) return;
  if (!damagingEntity || damagingEntity.typeId !== "minecraft:player") return;
  handleFoundEntity(damagingEntity, hitEntity);
});

world.afterEvents.worldInitialize.subscribe(() => {
  system.runTimeout(() => {
    try {
      reloadAll();
    } catch (e) {}
  }, 40);
});

system.runInterval(() => {
  try {
    torchOnUnfoundHeads();
  } catch (e) {}
}, 10);

system.runInterval(() => {
  try {
    proximityHints();
  } catch (e) {}
}, 6);

console.warn("[The Search MCPE] v7 cargado con " + HEAD_CATALOG.length + " cabezas + " + FX_NAMES.length + " partículas.");
