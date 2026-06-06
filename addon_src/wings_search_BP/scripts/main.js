import { world, system } from "@minecraft/server";
import { ActionFormData, ModalFormData, MessageFormData } from "@minecraft/server-ui";

/*
 * Wings Search
 * Sistema de busquedas tipo "huevos de pascua" con cabezas custom.
 * - Cada cabeza (wings:head) lleva encima 3 lineas de holograma (wings:hologram).
 * - GUI oscura custom (server_form.json) abierta con una brujula (minecraft:compass).
 * - Crear / Editar / Eliminar / Info / Revisar las busquedas.
 */

const DB_KEY = "wings:searches";
const HEAD_ID = "wings:head";
const HOLO_ID = "wings:hologram";
const DIM_IDS = ["minecraft:overworld", "minecraft:nether", "minecraft:the_end"];

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

// ----------------------------- Cabezas / Hologramas -----------------------------

function holoLines(search, index, found) {
  const c = colorCode(search.color);
  return [
    `§${c}§l${search.name}`,
    found ? "§a§l✔ ENCONTRADA" : "§7¡Encuéntrame!",
    `§6Cabeza §f#${index + 1} §7/ §f${search.heads.length}`
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

    const lines = holoLines(search, index, false);
    for (let i = 0; i < 3; i++) {
      const holo = dimension.spawnEntity(HOLO_ID, {
        x: loc.x,
        y: loc.y + 1.05 + i * 0.27,
        z: loc.z
      });
      holo.setDynamicProperty("wings:search", search.id);
      holo.setDynamicProperty("wings:index", index);
      holo.setDynamicProperty("wings:line", 2 - i); // invertido: la linea 0 arriba
      holo.addTag("wings_holo");
      holo.nameTag = lines[2 - i];
    }
    return true;
  } catch (e) {
    return false;
  }
}

function getEntitiesBy(search, kind) {
  // kind: "wings_head" | "wings_holo"
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
      if (search === null || e.getDynamicProperty("wings:search") === search) out.push(e);
    }
  }
  return out;
}

function removeHeadEntities(searchId, index) {
  // elimina la cabeza y sus hologramas de un index concreto (o todos si index===null)
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
  const dim = world.getDimension("minecraft:overworld");
  let count = 0;
  for (let i = 0; i < search.heads.length; i++) {
    if (search.heads[i].found) continue;
    // intenta usar la dimension guardada
    let d = dim;
    try {
      if (search.heads[i].dim) d = world.getDimension(search.heads[i].dim);
    } catch (e) {}
    if (spawnHeadAndHolos(d, search, i)) count++;
  }
  return count;
}

function reloadAll() {
  const db = loadDB();
  // limpia TODO lo de wings antes de recrear
  removeHeadEntities(null, null);
  let total = 0;
  for (const s of searchList(db)) {
    total += respawnSearch(s);
  }
  return total;
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
  removeHeadEntities(id, index);

  const dim = player.dimension;
  try {
    dim.spawnParticle("minecraft:totem_particle", { x: loc.x, y: loc.y + 0.5, z: loc.z });
  } catch (e) {}
  try {
    player.playSound("random.levelup", { volume: 1, pitch: 1.2 });
  } catch (e) {}

  const foundCount = s.heads.filter((h) => h.found).length;
  const total = s.heads.length;
  const c = colorCode(s.color);
  player.sendMessage(`§a¡Encontraste una cabeza de §${c}${s.name}§a! §7(${foundCount}/${total})`);

  // recompensa opcional
  if (s.reward && typeof s.reward === "string" && s.reward.trim().length > 0) {
    try {
      player.runCommand(s.reward.trim());
    } catch (e) {}
  }

  if (foundCount >= total && total > 0) {
    world.sendMessage(`§6§l[Búsqueda] §r§e${player.name} §acompletó la búsqueda §${c}${s.name}§a!`);
  }
}

// ----------------------------- GUI -----------------------------

function openMain(player) {
  const db = loadDB();
  const count = searchList(db).length;
  const form = new ActionFormData()
    .title("Custom Form")
    .body("Select Something Here")
    .button("§lCrear\n§7búsqueda", "textures/custom_ui/icon_create")
    .button(`§lRevisar\n§7${count} búsqueda(s)`, "textures/custom_ui/icon_review")
    .button("§lRecargar\n§7hologramas", "textures/custom_ui/icon_reload")
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
      case 2: {
        const n = reloadAll();
        player.sendMessage(`§a[Wings] Hologramas recargados. Cabezas activas: §f${n}`);
        break;
      }
      case 3:
        openHelp(player);
        break;
    }
  });
}

function openHelp(player) {
  const form = new MessageFormData()
    .title("Ayuda - Wings Search")
    .body(
      "§eWings Search§r\n\n" +
        "§7• Usa una §fbrújula§7 para abrir este menú.\n" +
        "§7• §fCrear§7: define una búsqueda y coloca cabezas.\n" +
        "§7• §fRevisar§7: ver, editar, info o eliminar.\n" +
        "§7• Cada cabeza muestra §f3 líneas§7 de holograma.\n" +
        "§7• §fGolpea§7 una cabeza para encontrarla.\n" +
        "§7• §fRecargar§7 vuelve a crear los hologramas.\n"
    )
    .button1("Volver")
    .button2("Cerrar");
  form.show(player).then((res) => {
    if (!res.canceled && res.selection === 0) openMain(player);
  });
}

function openCreate(player) {
  const form = new ModalFormData()
    .title("Crear búsqueda")
    .textField("Nombre de la búsqueda", "Huevos de Pascua", "Huevos de Pascua")
    .textField("Color del holograma (0-9, a-f)", "e", "e")
    .textField("Comando de recompensa (usa @s, opcional)", "give @s diamond 1")
    .toggle("Colocar una cabeza en tu posición ahora", true);

  form.show(player).then((res) => {
    if (res.canceled) return;
    const [name, color, reward, placeNow] = res.formValues;
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

    if (placeNow) {
      addHeadHere(player, id);
    } else {
      player.sendMessage(`§a[Wings] Búsqueda §f${s.name}§a creada. Usa Revisar → Añadir cabeza.`);
      openManage(player, id);
    }
  });
}

function addHeadHere(player, searchId) {
  const db = loadDB();
  const s = db[searchId];
  if (!s) return;
  const loc = player.location;
  const head = {
    x: Math.floor(loc.x) + 0.5,
    y: Math.round(loc.y * 100) / 100,
    z: Math.floor(loc.z) + 0.5,
    dim: player.dimension.id,
    found: false
  };
  s.heads.push(head);
  saveDB(db);

  const index = s.heads.length - 1;
  let d = player.dimension;
  const ok = spawnHeadAndHolos(d, s, index);
  if (ok) {
    player.sendMessage(`§a[Wings] Cabeza §f#${index + 1}§a añadida a §f${s.name}§a.`);
  } else {
    player.sendMessage("§c[Wings] No se pudo crear la cabeza aquí.");
  }
  openManage(player, searchId);
}

function openReview(player) {
  const db = loadDB();
  const list = searchList(db);
  const form = new ActionFormData().title("Revisar búsquedas").body("Selecciona una búsqueda:");
  if (list.length === 0) {
    form.body("§7No hay búsquedas todavía.\nCrea una desde el menú principal.");
  }
  for (const s of list) {
    const found = s.heads.filter((h) => h.found).length;
    const c = colorCode(s.color);
    form.button(`§${c}${s.name}\n§7${found}/${s.heads.length} encontradas`);
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
    player.sendMessage("§c[Wings] Esa búsqueda ya no existe.");
    return;
  }
  const found = s.heads.filter((h) => h.found).length;
  const c = colorCode(s.color);
  const form = new ActionFormData()
    .title(`Gestionar: ${s.name}`)
    .body(
      `§${c}§l${s.name}§r\n` +
        `§7Cabezas: §f${s.heads.length}§7 | Encontradas: §a${found}\n` +
        `§7Color: §${c}${s.color}§7 | Creador: §f${s.createdBy}\n`
    )
    .button("§aAñadir cabeza aquí", "textures/custom_ui/icon_create")
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
        addHeadHere(player, searchId);
        break;
      case 1:
        openInfo(player, searchId);
        break;
      case 2:
        openEdit(player, searchId);
        break;
      case 3: {
        const n = respawnSearch(s);
        player.sendMessage(`§a[Wings] Reaparecidas §f${n}§a cabezas de §f${s.name}§a.`);
        openManage(player, searchId);
        break;
      }
      case 4:
        openTeleport(player, searchId);
        break;
      case 5:
        openDelete(player, searchId);
        break;
      case 6:
        openReview(player);
        break;
    }
  });
}

function openInfo(player, searchId) {
  const db = loadDB();
  const s = db[searchId];
  if (!s) return;
  const c = colorCode(s.color);
  let body = `§${c}§l${s.name}§r\n\n`;
  body += `§7ID: §f${s.id}\n`;
  body += `§7Creador: §f${s.createdBy}\n`;
  body += `§7Recompensa: §f${s.reward && s.reward.length ? s.reward : "(ninguna)"}\n`;
  body += `§7Total cabezas: §f${s.heads.length}\n`;
  body += `§7Encontradas: §a${s.heads.filter((h) => h.found).length}\n\n`;
  s.heads.forEach((h, i) => {
    body += `§7#${i + 1}: §f${Math.floor(h.x)}, ${Math.floor(h.y)}, ${Math.floor(h.z)} ` +
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
    player.sendMessage(`§a[Wings] Búsqueda actualizada: §f${s2.name}`);
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
      player.sendMessage(`§a[Wings] Búsqueda §f${s.name}§a eliminada.`);
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
    player.sendMessage("§c[Wings] No hay cabezas para teletransportarse.");
    openManage(player, searchId);
    return;
  }
  const form = new ActionFormData().title("Teletransportar").body("Elige una cabeza:");
  s.heads.forEach((h, i) => {
    form.button(`§7#${i + 1} §f${Math.floor(h.x)}, ${Math.floor(h.y)}, ${Math.floor(h.z)}` + (h.found ? " §a✔" : ""));
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
      player.sendMessage(`§a[Wings] Teletransportado a la cabeza #${res.selection + 1}.`);
    } catch (e) {
      player.sendMessage("§c[Wings] No se pudo teletransportar.");
    }
  });
}

// ----------------------------- Eventos -----------------------------

world.afterEvents.itemUse.subscribe((event) => {
  const { source, itemStack } = event;
  if (!itemStack) return;
  if (itemStack.typeId === "minecraft:compass") {
    system.run(() => openMain(source));
  }
});

world.afterEvents.entityHitEntity.subscribe((event) => {
  const { damagingEntity, hitEntity } = event;
  if (!hitEntity || hitEntity.typeId !== HEAD_ID) return;
  if (!damagingEntity || damagingEntity.typeId !== "minecraft:player") return;
  handleFound(damagingEntity, hitEntity);
});

// interaccion (click derecho) tambien cuenta como encontrar
world.afterEvents.playerInteractWithEntity.subscribe((event) => {
  const { player, target } = event;
  if (!target || target.typeId !== HEAD_ID) return;
  handleFound(player, target);
});

world.afterEvents.worldInitialize.subscribe(() => {
  system.runTimeout(() => {
    try {
      reloadAll();
    } catch (e) {}
  }, 40);
});

console.warn("[Wings Search] cargado.");
