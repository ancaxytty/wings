import { world, system, BlockPermutation, MolangVariableMap } from "@minecraft/server";
import { ActionFormData, ModalFormData, MessageFormData } from "@minecraft/server-ui";

/*
 * The Search MCPE v4
 * - 12 CABEZAS como BLOQUES custom (wings:head, estado wings:skin 0..11).
 * - SIN varita: el jugador COLOCA el bloque él mismo; toma la cabeza seleccionada.
 * - Se ENCUENTRA al INTERACTUAR (como abrir un cofre) -> recompensa + partículas + TITLE/SUBTITLE.
 * - Holograma de 3 líneas encima de cada cabeza + llama de antorcha si no está hallada.
 * - GUI oscura profesional (estilo CubeCraft). Menú con la brújula.
 */

const DB_KEY = "wings:searches";
const HEAD_BLOCK = "wings:head";
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
  { name: "Bruja", color: "5", rgb: [0.58, 0.34, 0.74] }
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
function colorMap(skin) {
  const rgb = HEAD_CATALOG[clampSkin(skin)].rgb;
  const m = new MolangVariableMap();
  try {
    m.setColorRGB("variable.color", { red: rgb[0], green: rgb[1], blue: rgb[2] });
  } catch (e) {}
  return m;
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

// Plantillas editables de title/subtitle (con placeholders)
const DEFAULT_TITLE = "§a¡Encontraste {found} de {total} cabezas!";
const DEFAULT_SUBTITLE = "§{hc}{head} §7en §{sc}{search}";
const HINT_RADIUS = 3.2;

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
  const cat = HEAD_CATALOG[clampSkin(h.skin)];
  return {
    found: foundCount,
    total: total,
    head: cat.name,
    search: s.name,
    player: playerName,
    hc: colorCode(cat.color),
    sc: colorCode(s.color)
  };
}

// ----------------------------- Hologramas -----------------------------

function holoLines(search, headData, index, total) {
  const cat = HEAD_CATALOG[clampSkin(headData.skin)];
  const c = colorCode(cat.color);
  return [
    `§8§l✦ §r§${c}§l${cat.name}§r §8§l✦`,
    `§7▶ §f¡Interactúa! §7◀`,
    `§8${search.name} · §7${index + 1}/${total}`
  ];
}
function center(h) {
  return { x: h.x + 0.5, y: h.y, z: h.z + 0.5 };
}

function spawnHolos(dimension, search, index) {
  const h = search.heads[index];
  const c = center(h);
  const lines = holoLines(search, h, index, search.heads.length);
  for (let i = 0; i < 3; i++) {
    try {
      const holo = dimension.spawnEntity(HOLO_ID, { x: c.x, y: h.y + 0.85 + i * 0.27, z: c.z });
      holo.setDynamicProperty("wings:search", search.id);
      holo.setDynamicProperty("wings:index", index);
      holo.addTag("wings_holo");
      holo.nameTag = lines[2 - i];
    } catch (e) {}
  }
}

function applySkin(dimension, h) {
  try {
    const block = dimension.getBlock({ x: h.x, y: h.y, z: h.z });
    if (!block) return false;
    block.setPermutation(BlockPermutation.resolve(HEAD_BLOCK, { "wings:skin": clampSkin(h.skin) }));
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
function clearHeadBlock(h) {
  try {
    const dim = world.getDimension(h.dim || "minecraft:overworld");
    const block = dim.getBlock({ x: h.x, y: h.y, z: h.z });
    if (block && block.typeId === HEAD_BLOCK) block.setType("minecraft:air");
  } catch (e) {}
}

function respawnSearch(search) {
  removeHolos(search.id, null);
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
    applySkin(d, h);
    spawnHolos(d, search, i);
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
          y: h.y + 0.9,
          z: c.z
        });
      } catch (e) {}
    }
  }
}

// Aviso "Interactúa" cuando el jugador está MUY cerca de una cabeza no hallada
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
        const dx = pl.x - c.x, dy = pl.y - (h.y + 0.5), dz = pl.z - c.z;
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
        `§e❖ §fInteractúa §7para recoger §${colorCode(cat.color)}§l${cat.name}§r §8(§a${best.found}§8/§f${best.total}§8)`
      );
    }
  }
}

function foundExplosion(dimension, loc, skin) {
  const pts = [
    { x: loc.x, y: loc.y + 0.4, z: loc.z },
    { x: loc.x, y: loc.y + 0.8, z: loc.z },
    { x: loc.x, y: loc.y + 0.15, z: loc.z }
  ];
  for (const p of pts) {
    try {
      dimension.spawnParticle("wings:found", p, colorMap(skin));
    } catch (e) {}
  }
  try {
    dimension.spawnParticle("minecraft:totem_particle", { x: loc.x, y: loc.y + 0.6, z: loc.z });
  } catch (e) {}
}
function selectBurst(player, skin) {
  const loc = player.location;
  try {
    player.dimension.spawnParticle("wings:found", { x: loc.x, y: loc.y + 1.2, z: loc.z }, colorMap(skin));
  } catch (e) {}
  try {
    player.playSound("random.orb", { pitch: 1.5 });
  } catch (e) {}
}

// ----------------------------- Hallazgo (interactuar como un cofre) -----------------------------

function findHeadAt(loc, dimId) {
  const db = loadDB();
  for (const s of searchList(db)) {
    for (let i = 0; i < s.heads.length; i++) {
      const h = s.heads[i];
      if (h.found) continue;
      if (h.x === loc.x && h.y === loc.y && h.z === loc.z && (h.dim || "minecraft:overworld") === dimId) {
        return { db, s, i, h };
      }
    }
  }
  return null;
}

function handleFound(player, loc, dimId, removeBlock) {
  const match = findHeadAt(loc, dimId);
  if (!match) return false;
  const { db, s, i, h } = match;
  h.found = true;
  h.foundBy = player.name;
  saveDB(db);
  removeHolos(s.id, i);
  if (removeBlock) clearHeadBlock(h);

  const c = center(h);
  foundExplosion(player.dimension, { x: c.x, y: h.y + 0.3, z: c.z }, h.skin);
  try {
    player.playSound("random.levelup", { volume: 1, pitch: 1.2 });
    player.playSound("random.chestopen", { pitch: 1.1 });
  } catch (e) {}

  const cat = HEAD_CATALOG[clampSkin(h.skin)];
  const foundCount = s.heads.filter((x) => x.found).length;
  const total = s.heads.length;
  const ctx = buildCtx(s, h, foundCount, total, player.name);
  showTitle(
    player,
    applyTemplate(s.title || DEFAULT_TITLE, ctx),
    applyTemplate(s.subtitle || DEFAULT_SUBTITLE, ctx)
  );
  player.sendMessage(`§a¡Encontraste §${colorCode(cat.color)}${cat.name}§a! §7(${foundCount}/${total})`);

  if (s.reward && String(s.reward).trim().length > 0) {
    try {
      player.runCommand(String(s.reward).trim());
    } catch (e) {}
  }
  if (foundCount >= total && total > 0) {
    showTitle(player, `§6§l¡COMPLETADA!`, `§e${s.name} §7· ¡todas las cabezas!`);
    world.sendMessage(`§6§l[${TITLE}] §r§e${player.name} §acompletó §${colorCode(s.color)}${s.name}§a!`);
  }
  return true;
}

// ----------------------------- Colocar el bloque (tú mismo) -----------------------------

function onPlaceHead(player, block) {
  const skin = getSkin(player);
  const loc = block.location;
  const h = { x: loc.x, y: loc.y, z: loc.z, dim: player.dimension.id, found: false, skin: skin };
  applySkin(player.dimension, h);

  const id = getActiveSearch(player);
  const db = loadDB();
  const cat = HEAD_CATALOG[skin];
  if (!id || !db[id]) {
    actionBar(player, `§e[Search] §${colorCode(cat.color)}${cat.name}§7 colocada (sin búsqueda activa). §8Brújula → Crear/activar.`);
    return;
  }
  const s = db[id];
  s.heads.push(h);
  saveDB(db);
  spawnHolos(player.dimension, s, s.heads.length - 1);
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
      `§8› §7Búsquedas: §f${list.length}  §8| §7Cabezas: §f${totalHeads}  §8| §aHalladas: §f${totalFound}\n` +
        `§8› §7Activa: §f${activeLabel(player)}\n` +
        `§8› §7Tu cabeza: §${colorCode(cat.color)}${cat.name}`
    )
    .button("§l§aCrear\n§r§7nueva búsqueda", "textures/custom_ui/icon_create")
    .button(`§l§bRevisar\n§r§7${list.length} búsqueda(s)`, "textures/custom_ui/icon_review")
    .button(`§l§eCabezas\n§r§7${cat.name}`, headIcon(skin))
    .button("§l§dAyuda\n§r§7cómo se juega", "textures/custom_ui/icon_help");

  form.show(player).then((res) => {
    if (res.canceled) return;
    switch (res.selection) {
      case 0:
        openCreate(player);
        break;
      case 1:
        openReview(player);
        break;
      case 2:
        openHeadPicker(player);
        break;
      case 3:
        openHelp(player);
        break;
    }
  });
}

function openHeadPicker(player) {
  const cur = getSkin(player);
  const form = new ActionFormData()
    .title("Galería de Cabezas")
    .body(`§7Búsqueda activa: §f${activeLabel(player)}\n§7Actual: §f${HEAD_CATALOG[cur].name}\n§7Elige una cabeza (te daré el bloque):`);
  for (let i = 0; i < HEAD_CATALOG.length; i++) {
    const cat = HEAD_CATALOG[i];
    const mark = i === cur ? " §a✔" : "";
    form.button(`§${colorCode(cat.color)}${cat.name}${mark}`, headIcon(i));
  }
  form.button("§7« Volver");
  form.show(player).then((res) => {
    if (res.canceled) return;
    if (res.selection === HEAD_CATALOG.length) {
      openMain(player);
      return;
    }
    setSkin(player, res.selection);
    const cat = HEAD_CATALOG[res.selection];
    selectBurst(player, res.selection);
    try {
      player.runCommand("give @s wings:head 1");
    } catch (e) {}
    actionBar(player, `§a[Search] Cabeza: §${colorCode(cat.color)}${cat.name}§a — colócala donde quieras.`);
    player.sendMessage(`§a[Search] Seleccionaste §${colorCode(cat.color)}${cat.name}§a. Te di 1 bloque; el que coloques tomará esta cabeza.`);
  });
}

function openHelp(player) {
  const form = new MessageFormData()
    .title(TITLE)
    .body(
      `§e§l${TITLE}§r\n\n` +
        "§6§lCómo se juega§r\n" +
        "§7• Abre el menú con una §fbrújula§7.\n" +
        "§7• En §fCabezas§7 eliges una de las 12 (recibes el bloque).\n" +
        "§7• §fColoca tú mismo§7 el bloque-cabeza donde quieras;\n  tomará la cabeza seleccionada y se añade a la activa.\n" +
        "§7• Las cabezas sin hallar tienen una §6llama§7 encima.\n" +
        "§7• Al acercarte verás §e❖ Interactúa§7 en la barra.\n" +
        "§7• §fINTERACTÚA§7 (como abrir un cofre) para encontrarla:\n  §dpartículas§7, §atítulo§7 y recompensa.\n" +
        "§7• El §3title/subtitle§7 es editable por búsqueda (con placeholders).\n"
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
      case 1:
        addHeadHere(player, searchId);
        break;
      case 2:
        openInfo(player, searchId);
        break;
      case 3:
        openEdit(player, searchId);
        break;
      case 4:
        openMessages(player, searchId);
        break;
      case 5: {
        const n = respawnSearch(s);
        actionBar(player, `§a[Search] Reaparecidas §f${n}§a cabezas.`);
        openManage(player, searchId);
        break;
      }
      case 6:
        openTeleport(player, searchId);
        break;
      case 7:
        openDelete(player, searchId);
        break;
      case 8:
        openReview(player);
        break;
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
    skin: skin
  };
  applySkin(player.dimension, h);
  s.heads.push(h);
  saveDB(db);
  spawnHolos(player.dimension, s, s.heads.length - 1);
  const cat = HEAD_CATALOG[skin];
  player.sendMessage(`§a[Search] §${colorCode(cat.color)}${cat.name}§a añadida a §f${s.name}§a.`);
  openManage(player, searchId);
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
      `§7#${i + 1} §${colorCode(cat.color)}${cat.name}§7: §f${h.x}, ${h.y}, ${h.z} ` +
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
    // vista previa con datos de ejemplo
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
    .body(`§c¿Eliminar §f${s.name}§c?\n§7Se borrarán sus bloques-cabeza y hologramas.`)
    .button1("§cSí, eliminar")
    .button2("Cancelar");
  form.show(player).then((res) => {
    if (res.canceled) return;
    if (res.selection === 0) {
      removeHolos(searchId, null);
      for (const h of s.heads) if (!h.found) clearHeadBlock(h);
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
    form.button(`§${colorCode(cat.color)}${cat.name} §7#${i + 1}\n§f${h.x}, ${h.y}, ${h.z}` + (h.found ? " §a✔" : ""));
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

// Abrir menú con la brújula
world.afterEvents.itemUse.subscribe((event) => {
  const { source, itemStack } = event;
  if (itemStack && itemStack.typeId === "minecraft:compass") {
    system.run(() => openMain(source));
  }
});

// Colocar el bloque-cabeza uno mismo
world.afterEvents.playerPlaceBlock.subscribe((event) => {
  const { player, block } = event;
  if (block && block.typeId === HEAD_BLOCK) {
    system.run(() => {
      try {
        onPlaceHead(player, block);
      } catch (e) {}
    });
  }
});

// Encontrar al INTERACTUAR (como abrir un cofre)
world.afterEvents.playerInteractWithBlock.subscribe((event) => {
  const { player, block, itemStack } = event;
  if (!block || block.typeId !== HEAD_BLOCK) return;
  // si lleva el bloque-cabeza en la mano está construyendo, no buscando
  if (itemStack && itemStack.typeId === HEAD_BLOCK) return;
  if (player.isSneaking) return;
  handleFound(player, block.location, player.dimension.id, true);
});

// Romper la cabeza = limpieza (sin recompensa)
world.afterEvents.playerBreakBlock.subscribe((event) => {
  const { player, brokenBlockPermutation, block } = event;
  try {
    if (brokenBlockPermutation && brokenBlockPermutation.type.id === HEAD_BLOCK) {
      const match = findHeadAt(block.location, player.dimension.id);
      if (match) {
        match.h.found = true;
        match.h.foundBy = player.name + " (roto)";
        saveDB(match.db);
        removeHolos(match.s.id, match.i);
      }
    }
  } catch (e) {}
});

world.afterEvents.worldInitialize.subscribe(() => {
  system.runTimeout(() => {
    try {
      reloadAll();
    } catch (e) {}
  }, 40);
});

// Llama de antorcha sobre las cabezas no encontradas
system.runInterval(() => {
  try {
    torchOnUnfoundHeads();
  } catch (e) {}
}, 10);

// Aviso "Interactúa" al estar muy cerca
system.runInterval(() => {
  try {
    proximityHints();
  } catch (e) {}
}, 6);

console.warn("[The Search MCPE] v5 cargado con " + HEAD_CATALOG.length + " cabezas-bloque.");
