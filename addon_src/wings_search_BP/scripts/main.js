import { world, system } from "@minecraft/server";
import { ActionFormData, ModalFormData, MessageFormData } from "@minecraft/server-ui";

/*
 * Wings Search v2 - "The Search MCPE"
 * - 12 cabezas custom tematicas (wings:head con propiedad wings:skin 0..11).
 * - Varita (wings:wand) para elegir y colocar cabezas; brujula tambien abre el menu.
 * - Holograma de 3 lineas encima de cada cabeza.
 * - Particula de antorcha (wings:torch) encima de las cabezas NO encontradas.
 * - Explosion de particulas 3D custom (wings:found) al encontrar una cabeza.
 * - GUI oscura custom (titulo "The Search MCPE").
 */

const DB_KEY = "wings:searches";
const HEAD_ID = "wings:head";
const HOLO_ID = "wings:hologram";
const WAND_ID = "wings:wand";
const TITLE = "The Search MCPE";
const DIM_IDS = ["minecraft:overworld", "minecraft:nether", "minecraft:the_end"];

// Catalogo de cabezas (el index = wings:skin). El orden DEBE coincidir con las texturas h0..h11.
const HEAD_CATALOG = [
  { name: "Halloween", color: "6" },
  { name: "Navidad", color: "a" },
  { name: "Santa", color: "c" },
  { name: "Frozen", color: "b" },
  { name: "Olaf", color: "f" },
  { name: "Fantasma", color: "7" },
  { name: "Esqueleto", color: "f" },
  { name: "Reno", color: "6" },
  { name: "Muñeco de Nieve", color: "b" },
  { name: "Regalo", color: "c" },
  { name: "Zombie", color: "2" },
  { name: "Bruja", color: "5" }
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
  return typeof v === "string" ? v : null;
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

// ----------------------------- Cabezas / Hologramas -----------------------------

function holoLines(search, headData, index, found) {
  const cat = HEAD_CATALOG[clampSkin(headData.skin)];
  const c = colorCode(cat.color);
  return [
    `§${c}§l${cat.name}`,
    found ? "§a§l✔ ENCONTRADA" : "§e¡Encuéntrame!",
    `§7${search.name} §8#${index + 1}/${search.heads.length}`
  ];
}

function spawnHeadAndHolos(dimension, search, index) {
  const h = search.heads[index];
  const loc = { x: h.x, y: h.y, z: h.z };
  try {
    const head = dimension.spawnEntity(HEAD_ID, loc);
    head.setDynamicProperty("wings:search", search.id);
    head.setDynamicProperty("wings:index", index);
    head.addTag("wings_head");
    head.nameTag = "";
    try {
      head.setProperty("wings:skin", clampSkin(h.skin));
    } catch (e) {}

    const lines = holoLines(search, h, index, false);
    for (let i = 0; i < 3; i++) {
      const holo = dimension.spawnEntity(HOLO_ID, {
        x: loc.x,
        y: loc.y + 1.05 + i * 0.27,
        z: loc.z
      });
      holo.setDynamicProperty("wings:search", search.id);
      holo.setDynamicProperty("wings:index", index);
      holo.addTag("wings_holo");
      holo.nameTag = lines[2 - i];
    }
    return true;
  } catch (e) {
    return false;
  }
}

function getEntitiesBy(searchId, kind) {
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
      list = dim.getEntities({ type: kind === "wings_head" ? HEAD_ID : HOLO_ID });
    } catch (e) {
      continue;
    }
    for (const e of list) {
      if (searchId === null || e.getDynamicProperty("wings:search") === searchId) out.push(e);
    }
  }
  return out;
}

function removeHeadEntities(searchId, index) {
  const all = getEntitiesBy(searchId, "wings_head").concat(getEntitiesBy(searchId, "wings_holo"));
  for (const e of all) {
    if (index === null || e.getDynamicProperty("wings:index") === index) {
      try {
        e.remove();
      } catch (err) {}
    }
  }
}
function despawnSearch(searchId) {
  removeHeadEntities(searchId, null);
}

function respawnSearch(search) {
  despawnSearch(search.id);
  let count = 0;
  for (let i = 0; i < search.heads.length; i++) {
    if (search.heads[i].found) continue;
    let d = world.getDimension("minecraft:overworld");
    try {
      if (search.heads[i].dim) d = world.getDimension(search.heads[i].dim);
    } catch (e) {}
    if (spawnHeadAndHolos(d, search, i)) count++;
  }
  return count;
}

function reloadAll() {
  const db = loadDB();
  removeHeadEntities(null, null);
  let total = 0;
  for (const s of searchList(db)) total += respawnSearch(s);
  return total;
}

// ----------------------------- Particulas -----------------------------

function torchOnUnfoundHeads() {
  const heads = getEntitiesBy(null, "wings_head");
  for (const h of heads) {
    try {
      const loc = h.location;
      h.dimension.spawnParticle("wings:torch", { x: loc.x, y: loc.y + 0.95, z: loc.z });
    } catch (e) {}
  }
}

function foundExplosion(dimension, loc) {
  // Explosion 3D custom: el emisor ya es esferico; lo lanzamos en varias alturas
  // para darle volumen (pseudo-3D) ademas de un toque vanilla.
  const points = [
    { x: loc.x, y: loc.y + 0.4, z: loc.z },
    { x: loc.x, y: loc.y + 0.9, z: loc.z },
    { x: loc.x, y: loc.y + 0.1, z: loc.z }
  ];
  for (const p of points) {
    try {
      dimension.spawnParticle("wings:found", p);
    } catch (e) {}
  }
  try {
    dimension.spawnParticle("minecraft:totem_particle", { x: loc.x, y: loc.y + 0.6, z: loc.z });
  } catch (e) {}
}

// ----------------------------- Logica de hallazgo -----------------------------

function handleFound(player, headEntity) {
  const id = headEntity.getDynamicProperty("wings:search");
  const index = headEntity.getDynamicProperty("wings:index");
  if (typeof id !== "string" || typeof index !== "number") {
    try { headEntity.remove(); } catch (e) {}
    return;
  }
  const db = loadDB();
  const s = db[id];
  if (!s || !s.heads[index]) {
    removeHeadEntities(id, index);
    return;
  }
  if (s.heads[index].found) return;

  s.heads[index].found = true;
  s.heads[index].foundBy = player.name;
  saveDB(db);

  const loc = headEntity.location;
  const dim = player.dimension;
  removeHeadEntities(id, index);

  foundExplosion(dim, loc);
  try {
    player.playSound("random.levelup", { volume: 1, pitch: 1.2 });
  } catch (e) {}

  const cat = HEAD_CATALOG[clampSkin(s.heads[index].skin)];
  const foundCount = s.heads.filter((h) => h.found).length;
  const total = s.heads.length;
  const c = colorCode(s.color);
  player.sendMessage(
    `§a¡Encontraste la cabeza §${colorCode(cat.color)}${cat.name}§a de §${c}${s.name}§a! §7(${foundCount}/${total})`
  );

  if (s.reward && typeof s.reward === "string" && s.reward.trim().length > 0) {
    try {
      player.runCommand(s.reward.trim());
    } catch (e) {}
  }

  if (foundCount >= total && total > 0) {
    world.sendMessage(`§6§l[${TITLE}] §r§e${player.name} §acompletó la búsqueda §${c}${s.name}§a!`);
  }
}

// ----------------------------- Colocacion con varita -----------------------------

const FACE_OFFSET = {
  Up: [0, 1, 0],
  Down: [0, -0.6, 0],
  North: [0, 0.4, -0.6],
  South: [0, 0.4, 0.6],
  East: [0.6, 0.4, 0],
  West: [-0.6, 0.4, 0]
};

function placeHeadAtBlock(player, block, face) {
  const id = getActiveSearch(player);
  const db = loadDB();
  if (!id || !db[id]) {
    player.sendMessage("§c[Search] No hay búsqueda activa. Usa §eAgáchate + Varita§c → Crear/Revisar y marca una activa.");
    return;
  }
  const s = db[id];
  const off = FACE_OFFSET[face] || [0, 1, 0];
  const base = block.location;
  const skin = getSkin(player);
  const head = {
    x: Math.floor(base.x) + 0.5 + off[0],
    y: Math.round((base.y + off[1]) * 100) / 100,
    z: Math.floor(base.z) + 0.5 + off[2],
    dim: player.dimension.id,
    found: false,
    skin: skin
  };
  s.heads.push(head);
  saveDB(db);

  const index = s.heads.length - 1;
  const ok = spawnHeadAndHolos(player.dimension, s, index);
  const cat = HEAD_CATALOG[skin];
  if (ok) {
    player.playSound("random.orb", { pitch: 1.4 });
    player.sendMessage(`§a[Search] Cabeza §${colorCode(cat.color)}${cat.name}§a colocada en §f${s.name}§a §7(total ${s.heads.length}).`);
  } else {
    player.sendMessage("§c[Search] No se pudo colocar la cabeza aquí.");
  }
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
  const count = searchList(db).length;
  const skin = getSkin(player);
  const cat = HEAD_CATALOG[skin];
  const form = new ActionFormData()
    .title(TITLE)
    .body("Select Something Here")
    .button("§lCrear\n§7búsqueda", "textures/custom_ui/icon_create")
    .button(`§lRevisar\n§7${count} búsqueda(s)`, "textures/custom_ui/icon_review")
    .button(`§lCabezas\n§7${cat.name}`, headIcon(skin))
    .button("§lAyuda\n§7info", "textures/custom_ui/icon_help");

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
  const form = new ActionFormData()
    .title("Cabezas custom")
    .body(`§7Búsqueda activa: §f${activeLabel(player)}\n§7Elige la cabeza para tu varita:`);
  for (let i = 0; i < HEAD_CATALOG.length; i++) {
    const cat = HEAD_CATALOG[i];
    form.button(`§${colorCode(cat.color)}${cat.name}`, headIcon(i));
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
    player.sendMessage(`§a[Search] Cabeza seleccionada: §${colorCode(cat.color)}${cat.name}§a. Usa la varita sobre un bloque para colocarla.`);
  });
}

function openHelp(player) {
  const form = new MessageFormData()
    .title("Ayuda - " + TITLE)
    .body(
      `§e${TITLE}§r\n\n` +
        "§7• §fAgáchate + Varita§7: abre este menú.\n" +
        "§7• §fVarita en el aire§7: galería de cabezas.\n" +
        "§7• §fVarita sobre un bloque§7: coloca la cabeza\n  seleccionada en la búsqueda activa.\n" +
        "§7• También puedes abrir el menú con una §fbrújula§7.\n" +
        "§7• Las cabezas sin encontrar tienen una §6llama§7 encima.\n" +
        "§7• Al §fgolpearlas§7 sueltan partículas 3D.\n"
    )
    .button1("Recargar hologramas")
    .button2("Cerrar");
  form.show(player).then((res) => {
    if (!res.canceled && res.selection === 0) {
      const n = reloadAll();
      player.sendMessage(`§a[Search] Hologramas recargados. Cabezas activas: §f${n}`);
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
        "§7Selecciona una cabeza y úsala con la varita sobre un bloque."
    );
    openManage(player, id);
  });
}

function openReview(player) {
  const db = loadDB();
  const list = searchList(db);
  const form = new ActionFormData().title("Revisar búsquedas");
  if (list.length === 0) {
    form.body("§7No hay búsquedas todavía.\nCrea una desde el menú principal.");
  } else {
    form.body("§7Selecciona una búsqueda:");
  }
  for (const s of list) {
    const found = s.heads.filter((h) => h.found).length;
    const c = colorCode(s.color);
    const active = getActiveSearch(player) === s.id ? " §a●" : "";
    form.button(`§${c}${s.name}${active}\n§7${found}/${s.heads.length} encontradas`);
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
  const c = colorCode(s.color);
  const isActive = getActiveSearch(player) === s.id;
  const form = new ActionFormData()
    .title(`Gestionar: ${s.name}`)
    .body(
      `§${c}§l${s.name}§r\n` +
        `§7Cabezas: §f${s.heads.length}§7 | Encontradas: §a${found}\n` +
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
  const head = {
    x: Math.floor(loc.x) + 0.5,
    y: Math.round(loc.y * 100) / 100,
    z: Math.floor(loc.z) + 0.5,
    dim: player.dimension.id,
    found: false,
    skin: skin
  };
  s.heads.push(head);
  saveDB(db);
  const index = s.heads.length - 1;
  const ok = spawnHeadAndHolos(player.dimension, s, index);
  const cat = HEAD_CATALOG[skin];
  player.sendMessage(
    ok
      ? `§a[Search] Cabeza §${colorCode(cat.color)}${cat.name}§a añadida a §f${s.name}§a.`
      : "§c[Search] No se pudo crear la cabeza aquí."
  );
  openManage(player, searchId);
}

function openInfo(player, searchId) {
  const db = loadDB();
  const s = db[searchId];
  if (!s) return;
  const c = colorCode(s.color);
  let body = `§${c}§l${s.name}§r\n\n`;
  body += `§7Creador: §f${s.createdBy}\n`;
  body += `§7Recompensa: §f${s.reward && s.reward.length ? s.reward : "(ninguna)"}\n`;
  body += `§7Total cabezas: §f${s.heads.length}\n`;
  body += `§7Encontradas: §a${s.heads.filter((h) => h.found).length}\n\n`;
  s.heads.forEach((h, i) => {
    const cat = HEAD_CATALOG[clampSkin(h.skin)];
    body +=
      `§7#${i + 1} §${colorCode(cat.color)}${cat.name}§7: §f${Math.floor(h.x)}, ${Math.floor(h.y)}, ${Math.floor(h.z)} ` +
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
    .toggle("Refrescar hologramas tras guardar", true);
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
    .body(`§c¿Seguro que quieres eliminar §f${s.name}§c?\n§7Se borrarán sus cabezas y hologramas.`)
    .button1("§cSí, eliminar")
    .button2("Cancelar");
  form.show(player).then((res) => {
    if (res.canceled) return;
    if (res.selection === 0) {
      despawnSearch(searchId);
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
    form.button(
      `§${colorCode(cat.color)}${cat.name} §7#${i + 1}\n§f${Math.floor(h.x)}, ${Math.floor(h.y)}, ${Math.floor(h.z)}` +
        (h.found ? " §a✔" : "")
    );
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
      const dim = h.dim ? world.getDimension(h.dim) : player.dimension;
      player.teleport({ x: h.x, y: h.y + 1, z: h.z }, { dimension: dim });
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
    placeHeadAtBlock(player, block, blockFace);
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
      if (blockUseTick[source.name] === t) return; // fue un clic sobre bloque
      if (source.isSneaking) openMain(source);
      else openHeadPicker(source);
    });
  }
});

world.afterEvents.entityHitEntity.subscribe((event) => {
  const { damagingEntity, hitEntity } = event;
  if (!hitEntity || hitEntity.typeId !== HEAD_ID) return;
  if (!damagingEntity || damagingEntity.typeId !== "minecraft:player") return;
  handleFound(damagingEntity, hitEntity);
});

world.afterEvents.playerInteractWithEntity.subscribe((event) => {
  const { player, target } = event;
  if (!target || target.typeId !== HEAD_ID) return;
  // si el jugador interactua con la cabeza usando la varita, tambien cuenta
  handleFound(player, target);
});

world.afterEvents.worldInitialize.subscribe(() => {
  system.runTimeout(() => {
    try {
      reloadAll();
    } catch (e) {}
  }, 40);
});

// Llama de antorcha encima de las cabezas no encontradas
system.runInterval(() => {
  try {
    torchOnUnfoundHeads();
  } catch (e) {}
}, 12);

console.warn("[The Search MCPE] cargado con " + HEAD_CATALOG.length + " cabezas custom.");
