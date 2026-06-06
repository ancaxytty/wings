import { world, system, BlockPermutation, MolangVariableMap } from "@minecraft/server";
import { ActionFormData, ModalFormData, MessageFormData } from "@minecraft/server-ui";

/*
 * The Search MCPE v3
 * - 12 CABEZAS como BLOQUES custom (wings:head, estado wings:skin 0..11, tipo "skull" 8px).
 * - Varita (wings:wand) para elegir y COLOCAR el bloque-cabeza.
 * - Se ENCUENTRA al ROMPER el bloque -> explosión de partículas custom del color de la cabeza.
 * - Holograma de 3 líneas (entidad invisible) encima de cada cabeza.
 * - Llama de antorcha custom sobre las cabezas NO encontradas.
 * - GUI oscura profesional, título "The Search MCPE".
 */

const DB_KEY = "wings:searches";
const HEAD_BLOCK = "wings:head";
const HOLO_ID = "wings:hologram";
const WAND_ID = "wings:wand";
const TITLE = "The Search MCPE";
const DIM_IDS = ["minecraft:overworld", "minecraft:nether", "minecraft:the_end"];

// index = wings:skin. Debe coincidir con texturas h0..h11. rgb = color de partícula (0..1).
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

// ----------------------------- Hologramas -----------------------------

function holoLines(search, headData, index, total) {
  const cat = HEAD_CATALOG[clampSkin(headData.skin)];
  const c = colorCode(cat.color);
  return [
    `§8§l✦ §r§${c}§l${cat.name}§r §8§l✦`,
    `§7▶ §f¡Rómpeme! §7◀`,
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

function placeHeadBlock(dimension, h) {
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
    placeHeadBlock(d, h);
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
      // sólo si hay un jugador cerca en la misma dimensión (evita cargar chunks lejanos)
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

// ----------------------------- Hallazgo (romper bloque) -----------------------------

function handleFoundAt(player, loc, dimId) {
  const db = loadDB();
  for (const s of searchList(db)) {
    for (let i = 0; i < s.heads.length; i++) {
      const h = s.heads[i];
      if (h.found) continue;
      if (h.x === loc.x && h.y === loc.y && h.z === loc.z && (h.dim || "minecraft:overworld") === dimId) {
        h.found = true;
        h.foundBy = player.name;
        saveDB(db);
        removeHolos(s.id, i);
        const c = center(h);
        foundExplosion(player.dimension, { x: c.x, y: h.y + 0.3, z: c.z }, h.skin);
        try {
          player.playSound("random.levelup", { volume: 1, pitch: 1.2 });
        } catch (e) {}
        const cat = HEAD_CATALOG[clampSkin(h.skin)];
        const foundCount = s.heads.filter((x) => x.found).length;
        const total = s.heads.length;
        player.sendMessage(
          `§a¡Encontraste §${colorCode(cat.color)}${cat.name}§a de §${colorCode(s.color)}${s.name}§a! §7(${foundCount}/${total})`
        );
        if (s.reward && String(s.reward).trim().length > 0) {
          try {
            player.runCommand(String(s.reward).trim());
          } catch (e) {}
        }
        if (foundCount >= total && total > 0) {
          world.sendMessage(`§6§l[${TITLE}] §r§e${player.name} §acompletó §${colorCode(s.color)}${s.name}§a!`);
        }
        return true;
      }
    }
  }
  return false;
}

// ----------------------------- Colocación con varita -----------------------------

const FACE_OFFSET = {
  Up: [0, 1, 0],
  Down: [0, -1, 0],
  North: [0, 0, -1],
  South: [0, 0, 1],
  East: [1, 0, 0],
  West: [-1, 0, 0]
};

function placeWithWand(player, block, face) {
  const id = getActiveSearch(player);
  const db = loadDB();
  if (!id || !db[id]) {
    player.sendMessage("§c[Search] No hay búsqueda activa. §7Agáchate + Varita → Crear o marca una activa.");
    return;
  }
  const s = db[id];
  const off = FACE_OFFSET[face] || [0, 1, 0];
  const base = block.location;
  const pos = { x: base.x + off[0], y: base.y + off[1], z: base.z + off[2] };

  let target;
  try {
    target = player.dimension.getBlock(pos);
  } catch (e) {}
  if (!target) {
    player.sendMessage("§c[Search] No puedo colocar la cabeza ahí.");
    return;
  }
  if (!target.isAir && target.typeId !== "minecraft:water") {
    player.sendMessage("§e[Search] Apunta a una cara con aire libre al lado.");
    return;
  }

  const skin = getSkin(player);
  const h = { x: pos.x, y: pos.y, z: pos.z, dim: player.dimension.id, found: false, skin: skin };
  if (!placeHeadBlock(player.dimension, h)) {
    player.sendMessage("§c[Search] No se pudo colocar el bloque.");
    return;
  }
  s.heads.push(h);
  saveDB(db);
  spawnHolos(player.dimension, s, s.heads.length - 1);
  const cat = HEAD_CATALOG[skin];
  player.playSound("random.orb", { pitch: 1.3 });
  player.sendMessage(`§a[Search] §${colorCode(cat.color)}${cat.name}§a colocada en §f${s.name}§a §7(total ${s.heads.length}).`);
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
        `§8› §7Varita: §${colorCode(cat.color)}${cat.name}`
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
    .body(`§7Búsqueda activa: §f${activeLabel(player)}\n§7Actual: §f${HEAD_CATALOG[cur].name}\n§7Elige la cabeza para tu varita:`);
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
    player.sendMessage(`§a[Search] Cabeza: §${colorCode(cat.color)}${cat.name}§a. Usa la varita sobre un bloque para colocarla.`);
  });
}

function openHelp(player) {
  const form = new MessageFormData()
    .title(TITLE)
    .body(
      `§e§l${TITLE}§r\n\n` +
        "§6§lCómo se juega§r\n" +
        "§7• Consigue la §fVarita de Búsqueda§7.\n" +
        "§7• §fAgáchate + Varita§7: abre este menú.\n" +
        "§7• §fVarita en el aire§7: galería de 12 cabezas.\n" +
        "§7• §fVarita sobre un bloque§7: coloca la cabeza\n  seleccionada (bloque) en la búsqueda activa.\n" +
        "§7• Las cabezas sin hallar tienen una §6llama§7 encima.\n" +
        "§7• §fROMPE§7 la cabeza para encontrarla → §dpartículas§7.\n" +
        "§7• La §fbrújula§7 también abre el menú.\n"
    )
    .button1("§aRecargar todo")
    .button2("Cerrar");
  form.show(player).then((res) => {
    if (!res.canceled && res.selection === 0) {
      const n = reloadAll();
      player.sendMessage(`§a[Search] Recargado. Cabezas activas: §f${n}`);
    }
  });
}

function openCreate(player) {
  const form = new ModalFormData()
    .title("Crear búsqueda")
    .textField("Nombre de la búsqueda", "Búsqueda de Halloween", "Búsqueda de Halloween")
    .textField("Color del nombre (0-9, a-f)", "e", "e")
    .textField("Comando de recompensa (usa @s, opcional)", "give @s diamond 1")
    .toggle("Marcar como búsqueda activa para la varita", true);
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
      heads: []
    };
    db[id] = s;
    saveDB(db);
    if (makeActive) setActiveSearch(player, id);
    player.sendMessage(
      `§a[Search] Búsqueda §f${s.name}§a creada${makeActive ? " §7(activa)" : ""}.\n` +
        "§7Elige una cabeza y colócala con la varita sobre un bloque."
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
        `§7Activa para varita: ${isActive ? "§aSÍ" : "§cNO"}\n`
    )
    .button(isActive ? "§a● Búsqueda activa" : "§eMarcar como activa", "textures/custom_ui/icon_wand")
    .button("§aAñadir cabeza aquí (tu pos.)", "textures/custom_ui/icon_place")
    .button("§bInfo de la búsqueda", "textures/custom_ui/icon_help")
    .button("§eEditar (nombre/color/recompensa)", "textures/custom_ui/icon_review")
    .button("§dReaparecer cabezas", "textures/custom_ui/icon_reload")
    .button("§6Teletransportar a una cabeza")
    .button("§cEliminar búsqueda", "textures/custom_ui/icon_delete")
    .button("§7« Volver");

  form.show(player).then((res) => {
    if (res.canceled) return;
    switch (res.selection) {
      case 0:
        setActiveSearch(player, searchId);
        player.sendMessage(`§a[Search] §f${s.name}§a es ahora la búsqueda activa.`);
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
      case 4: {
        const n = respawnSearch(s);
        player.sendMessage(`§a[Search] Reaparecidas §f${n}§a cabezas de §f${s.name}§a.`);
        openManage(player, searchId);
        break;
      }
      case 5:
        openTeleport(player, searchId);
        break;
      case 6:
        openDelete(player, searchId);
        break;
      case 7:
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
  placeHeadBlock(player.dimension, h);
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
    player.sendMessage(`§a[Search] Búsqueda actualizada: §f${s2.name}`);
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
      player.sendMessage(`§a[Search] Teletransportado a la cabeza #${res.selection + 1}.`);
    } catch (e) {
      player.sendMessage("§c[Search] No se pudo teletransportar.");
    }
  });
}

// ----------------------------- Eventos -----------------------------

const blockUseTick = {};

world.afterEvents.playerInteractWithBlock.subscribe((event) => {
  const { player, itemStack, block, blockFace } = event;
  if (!itemStack || itemStack.typeId !== WAND_ID) return;
  blockUseTick[player.name] = system.currentTick;
  if (player.isSneaking) {
    system.run(() => openMain(player));
  } else {
    placeWithWand(player, block, blockFace);
  }
});

world.afterEvents.itemUse.subscribe((event) => {
  const { source, itemStack } = event;
  if (!itemStack) return;
  if (itemStack.typeId === "minecraft:compass") {
    system.run(() => openMain(source));
    return;
  }
  if (itemStack.typeId === WAND_ID) {
    const t = system.currentTick;
    system.run(() => {
      if (blockUseTick[source.name] === t) return; // fue clic sobre bloque
      if (source.isSneaking) openMain(source);
      else openHeadPicker(source);
    });
  }
});

// Encontrar al ROMPER el bloque-cabeza
world.afterEvents.playerBreakBlock.subscribe((event) => {
  const { player, block, brokenBlockPermutation } = event;
  try {
    if (brokenBlockPermutation && brokenBlockPermutation.type.id === HEAD_BLOCK) {
      handleFoundAt(player, block.location, player.dimension.id);
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

console.warn("[The Search MCPE] v3 cargado con " + HEAD_CATALOG.length + " cabezas-bloque.");
