import { world, system } from "@minecraft/server";
import { ActionFormData, ModalFormData, MessageFormData } from "@minecraft/server-ui";

/*
 * Logros Custom v1.0.0
 * -------------------------------------------------------------------------
 * Sistema de LOGROS (achievements) profesional para Minecraft Bedrock.
 * - Se abre con un ITEM especial con textura custom: "logros:book".
 * - Menu de "Ver logros" con IMAGENES (medallas) por logro, estados
 *   BLOQUEADO / DESBLOQUEADO y barra de progreso.
 * - Todo EDITABLE por admins: crear / editar / borrar logros, titulo,
 *   descripcion, icono (imagen), puntos y recompensa (comando).
 * - ServerForms con UI custom (server_form.json del RP) -> NO es el
 *   formulario simple de Minecraft.
 * - Mapmakers: desbloquear desde command block con
 *      /scriptevent logros:give <idDelLogro>
 *      /scriptevent logros:revoke <idDelLogro>
 *      /scriptevent logros:reset
 *   (se aplica al jugador que ejecuta / sourceEntity)
 * - Datos persistentes con dynamic properties.
 */

const TITLE = "§l§6Logros";
const DB_KEY = "logros:db";
const SEED_KEY = "logros:seeded";
const DONE_KEY = "logros:done";
const ADMIN_TAG = "admin";
const ICON_COUNT = 12; // medallas m0..m11 disponibles en el RP

function medalIcon(i) {
  return `textures/ui/logros/m${clampIcon(i)}`;
}
function medalLocked(i) {
  return `textures/ui/logros/m${clampIcon(i)}_off`;
}
function uiIcon(name) {
  return `textures/ui/logros/${name}`;
}
function clampIcon(n) {
  n = Math.floor(Number(n));
  if (!Number.isFinite(n) || n < 0) return 0;
  if (n > ICON_COUNT - 1) return ICON_COUNT - 1;
  return n;
}

// ----------------------------- catalogo de iconos -----------------------------
const ICON_NAMES = [
  "Estrella", "Pico", "Espada", "Escudo", "Corona", "Diamante",
  "Trofeo", "Corazon", "Rayo", "Llama", "Hoja", "Calavera"
];

// ----------------------------- logros por defecto -----------------------------
const DEFAULTS = [
  { id: "primeros_pasos", title: "Primeros Pasos", desc: "Da tus primeros pasos en el mundo.", icon: 0, points: 10, reward: "" },
  { id: "minero", title: "Minero Novato", desc: "Pica tu primer bloque de mineral.", icon: 1, points: 15, reward: "" },
  { id: "guerrero", title: "Guerrero", desc: "Derrota a tu primer enemigo.", icon: 2, points: 20, reward: "" },
  { id: "defensor", title: "Defensor", desc: "Bloquea un ataque con un escudo.", icon: 3, points: 20, reward: "" },
  { id: "realeza", title: "De la Realeza", desc: "Consigue un objeto legendario.", icon: 4, points: 50, reward: "" },
  { id: "joyero", title: "Joyero", desc: "Encuentra un diamante.", icon: 5, points: 40, reward: "" },
  { id: "campeon", title: "Campeon", desc: "Gana una partida o evento.", icon: 6, points: 100, reward: "" },
  { id: "amistad", title: "Amistad", desc: "Juega junto a otro jugador.", icon: 7, points: 15, reward: "" }
];

// ----------------------------- utilidades -----------------------------
function log(msg) {
  try { console.warn(`[Logros] ${msg}`); } catch (e) {}
}
function isAdmin(player) {
  try { return player.hasTag(ADMIN_TAG) || player.isOp?.() === true; } catch (e) { return false; }
}
function colorCode(c) {
  const ok = "0123456789abcdef";
  if (typeof c !== "string" || c.length !== 1 || !ok.includes(c.toLowerCase())) return "e";
  return c.toLowerCase();
}
function clampPoints(n) {
  n = Math.floor(Number(n));
  if (!Number.isFinite(n) || n < 0) return 0;
  if (n > 100000) return 100000;
  return n;
}
function genId(title) {
  const base = String(title || "logro").toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 24) || "logro";
  return base + "_" + Math.floor(Math.random() * 1000).toString(36);
}

// ----------------------------- DB -----------------------------
function loadDB() {
  const raw = world.getDynamicProperty(DB_KEY);
  if (typeof raw !== "string" || raw.length === 0) return {};
  try { return JSON.parse(raw); } catch (e) { return {}; }
}
function saveDB(db) {
  try { world.setDynamicProperty(DB_KEY, JSON.stringify(db)); } catch (e) { log("No se pudo guardar la DB: " + e); }
}
function dbList(db) {
  return Object.keys(db).map((k) => db[k]).sort((a, b) => (a.order || 0) - (b.order || 0));
}
function ensureSeed() {
  if (world.getDynamicProperty(SEED_KEY) === true) return;
  const db = loadDB();
  if (Object.keys(db).length === 0) {
    DEFAULTS.forEach((d, i) => { db[d.id] = { ...d, order: i }; });
    saveDB(db);
    log(`Sembrados ${DEFAULTS.length} logros por defecto.`);
  }
  world.setDynamicProperty(SEED_KEY, true);
}

// ----------------------------- progreso del jugador -----------------------------
function loadDone(player) {
  const raw = player.getDynamicProperty(DONE_KEY);
  if (typeof raw !== "string" || raw.length === 0) return {};
  try { return JSON.parse(raw); } catch (e) { return {}; }
}
function saveDone(player, done) {
  try { player.setDynamicProperty(DONE_KEY, JSON.stringify(done)); } catch (e) {}
}
function hasAchievement(player, id) {
  return !!loadDone(player)[id];
}
function totalPoints(player, db) {
  const done = loadDone(player);
  let pts = 0;
  for (const id of Object.keys(done)) {
    if (db[id]) pts += clampPoints(db[id].points);
  }
  return pts;
}

function progressBar(found, total, len = 14) {
  if (total <= 0) return "§8[§7sin logros§8]";
  const ratio = Math.max(0, Math.min(1, found / total));
  const filled = Math.round(ratio * len);
  let bar = "§a";
  for (let i = 0; i < len; i++) {
    if (i === filled) bar += "§8";
    bar += "█";
  }
  const pct = Math.round(ratio * 100);
  return `${bar} §f${pct}%`;
}

// ----------------------------- otorgar / revocar -----------------------------
function awardAchievement(player, id, announce = true) {
  const db = loadDB();
  const a = db[id];
  if (!a) return false;
  const done = loadDone(player);
  if (done[id]) return false; // ya lo tiene
  done[id] = Date.now();
  saveDone(player, done);

  if (announce) {
    try {
      player.onScreenDisplay.setTitle("§6§l¡LOGRO DESBLOQUEADO!", {
        fadeInDuration: 6, stayDuration: 50, fadeOutDuration: 14,
        subtitle: `§e${a.title} §7(+${clampPoints(a.points)} pts)`
      });
    } catch (e) {}
    try {
      player.playSound("random.levelup", { volume: 1, pitch: 1.15 });
      player.playSound("random.orb", { pitch: 1.4 });
    } catch (e) {}
    player.sendMessage(`§6[Logros] §a¡Desbloqueaste §e${a.title}§a! §7(+${clampPoints(a.points)} pts)`);
  }
  // recompensa opcional
  if (a.reward && String(a.reward).trim().length > 0) {
    try { player.runCommand(String(a.reward).trim()); } catch (e) { log("Recompensa fallo: " + e); }
  }
  log(`${player.name} desbloqueo '${a.title}'.`);
  return true;
}
function revokeAchievement(player, id) {
  const done = loadDone(player);
  if (!done[id]) return false;
  delete done[id];
  saveDone(player, done);
  return true;
}

// ============================================================ GUI ============================================================

function openMain(player) {
  ensureSeed();
  const db = loadDB();
  const list = dbList(db);
  const done = loadDone(player);
  const unlocked = list.filter((a) => done[a.id]).length;
  const pts = totalPoints(player, db);
  const admin = isAdmin(player);

  const form = new ActionFormData()
    .title(TITLE)
    .body(
      `§8§l━━━━━━━━━━━━━━━━━━━━━\n` +
      `§6§l✦ §r§eMis Logros§r §6§l✦\n` +
      `§8§l━━━━━━━━━━━━━━━━━━━━━\n` +
      `§7Jugador §8»§f ${player.name}\n` +
      `§7Progreso §8»§f ${unlocked}/${list.length}\n` +
      `${progressBar(unlocked, list.length)}\n` +
      `§7Puntos §8»§6 ${pts}\n`
    )
    .button("§l§aVER LOGROS\n§r§7galeria con imagenes", uiIcon("btn_view"))
    .button("§l§bMI PROGRESO\n§r§7estadisticas", uiIcon("btn_stats"));

  if (admin) {
    form.button("§l§eADMINISTRAR\n§r§7crear / editar / otorgar", uiIcon("btn_admin"));
  }
  form.button("§l§dAYUDA\n§r§7como funciona", uiIcon("btn_help"));

  form.show(player).then((res) => {
    if (res.canceled) return;
    const opts = [openAchievements, openStats];
    if (admin) opts.push(openAdmin);
    opts.push(openHelp);
    const fn = opts[res.selection];
    if (fn) fn(player);
  });
}

function openAchievements(player) {
  const db = loadDB();
  const list = dbList(db);
  const done = loadDone(player);
  const unlocked = list.filter((a) => done[a.id]).length;

  const form = new ActionFormData()
    .title("§l§6Galeria de Logros")
    .body(
      list.length === 0
        ? "§7Todavia no hay logros configurados.\n§7Un admin puede crearlos en §eAdministrar§7."
        : `§7Toca un logro para ver el detalle.\n§7Desbloqueados §8»§f ${unlocked}/${list.length}\n${progressBar(unlocked, list.length)}`
    );

  for (const a of list) {
    const got = !!done[a.id];
    const icon = got ? medalIcon(a.icon) : medalLocked(a.icon);
    const label = got
      ? `§a✔ §f${a.title}\n§7${clampPoints(a.points)} pts §8· §adesbloqueado`
      : `§8🔒 §7${a.title}\n§8${clampPoints(a.points)} pts · bloqueado`;
    form.button(label, icon);
  }
  form.button("§7« Volver", uiIcon("btn_back"));

  form.show(player).then((res) => {
    if (res.canceled) return;
    if (res.selection === list.length) { openMain(player); return; }
    const a = list[res.selection];
    if (a) openDetail(player, a.id);
  });
}

function openDetail(player, id) {
  const db = loadDB();
  const a = db[id];
  if (!a) { openAchievements(player); return; }
  const done = loadDone(player);
  const got = !!done[id];
  const when = got ? new Date(done[id]).toLocaleString() : null;

  let body = `§6§l${a.title}§r\n\n`;
  body += `§7${a.desc || "(sin descripcion)"}\n\n`;
  body += `§7Icono §8»§f ${ICON_NAMES[clampIcon(a.icon)]}\n`;
  body += `§7Puntos §8»§6 ${clampPoints(a.points)}\n`;
  body += got ? `§aEstado §8»§a DESBLOQUEADO\n` : `§7Estado §8»§c bloqueado\n`;
  if (when) body += `§7Fecha §8»§f ${when}\n`;
  if (a.reward && String(a.reward).trim().length) body += `§7Recompensa §8»§f ${a.reward}\n`;

  const form = new MessageFormData()
    .title(got ? "§a✔ " + a.title : "§8🔒 " + a.title)
    .body(body)
    .button1("§7« Volver")
    .button2("§8Cerrar");
  form.show(player).then((res) => {
    if (!res.canceled && res.selection === 0) openAchievements(player);
  });
}

function openStats(player) {
  const db = loadDB();
  const list = dbList(db);
  const done = loadDone(player);
  const unlocked = list.filter((a) => done[a.id]).length;
  const pts = totalPoints(player, db);
  const maxPts = list.reduce((acc, a) => acc + clampPoints(a.points), 0);

  let body = `§6§l${player.name}§r\n\n`;
  body += `§7Logros desbloqueados §8»§f ${unlocked}/${list.length}\n`;
  body += `${progressBar(unlocked, list.length)}\n\n`;
  body += `§7Puntos §8»§6 ${pts}§7 / §6${maxPts}\n\n`;
  body += `§8Ultimos desbloqueados:\n`;
  const recent = list.filter((a) => done[a.id]).sort((x, y) => done[y.id] - done[x.id]).slice(0, 5);
  if (recent.length === 0) body += "§8 (ninguno todavia)\n";
  for (const a of recent) body += `§a ✔ §f${a.title}\n`;

  const form = new MessageFormData()
    .title("§l§bMi Progreso")
    .body(body)
    .button1("§7« Volver")
    .button2("§8Cerrar");
  form.show(player).then((res) => {
    if (!res.canceled && res.selection === 0) openMain(player);
  });
}

function openHelp(player) {
  const form = new MessageFormData()
    .title("§l§dAyuda")
    .body(
      "§e§lLogros Custom§r\n\n" +
      "§7• Abre este menu con el §6Libro de Logros§7 (clic derecho / mantener).\n" +
      "§7• En §aVer Logros§7 ves todas las medallas con imagen; las bloqueadas salen en gris.\n" +
      "§7• Los §6puntos§7 se suman al desbloquear logros.\n\n" +
      "§6§lPara admins§r §7(tag §eadmin§7):\n" +
      "§7• §eAdministrar§7 → crear, editar, borrar y §aotorgar§7 logros.\n" +
      "§7• Desde command block:\n" +
      "§8   /scriptevent logros:give <id>\n" +
      "§8   /scriptevent logros:revoke <id>\n" +
      "§8   /scriptevent logros:reset\n"
    )
    .button1("§aEntendido")
    .button2("§8Cerrar");
  form.show(player).then((res) => {
    if (!res.canceled && res.selection === 0) openMain(player);
  });
}

// ============================================================ ADMIN ============================================================

function openAdmin(player) {
  if (!isAdmin(player)) { player.sendMessage("§c[Logros] Necesitas el tag §eadmin§c."); return; }
  const db = loadDB();
  const list = dbList(db);
  const form = new ActionFormData()
    .title("§l§6Administrar Logros")
    .body(`§7Logros configurados §8»§f ${list.length}\n§7Gestiona el sistema de logros.`)
    .button("§l§aCREAR LOGRO\n§r§7nuevo logro", uiIcon("btn_create"))
    .button("§l§eEDITAR LOGROS\n§r§7modificar / borrar", uiIcon("btn_edit"))
    .button("§l§bOTORGAR\n§r§7dar logro a jugadores", uiIcon("btn_give"))
    .button("§l§cREINICIAR\n§r§7borrar progreso", uiIcon("btn_reset"))
    .button("§l§dRESTAURAR DEFAULTS\n§r§7logros de ejemplo", uiIcon("btn_reload"))
    .button("§7« Volver", uiIcon("btn_back"));
  form.show(player).then((res) => {
    if (res.canceled) return;
    switch (res.selection) {
      case 0: openCreate(player); break;
      case 1: openEditList(player); break;
      case 2: openGivePick(player); break;
      case 3: openResetMenu(player); break;
      case 4: openRestoreDefaults(player); break;
      case 5: openMain(player); break;
    }
  });
}

function openCreate(player) {
  const form = new ModalFormData()
    .title("§l§aCrear Logro")
    .textField("Titulo", "Maestro Constructor", "")
    .textField("Descripcion", "Coloca 1000 bloques.", "")
    .dropdown("Icono (imagen)", ICON_NAMES, 6)
    .textField("Puntos", "25", "25")
    .textField("Comando de recompensa (usa @s, opcional)", "give @s diamond 1", "");
  form.show(player).then((res) => {
    if (res.canceled) { openAdmin(player); return; }
    const [title, desc, iconIdx, ptsStr, reward] = res.formValues;
    const t = String(title || "").trim();
    if (!t) { player.sendMessage("§c[Logros] El titulo no puede estar vacio."); openCreate(player); return; }
    const db = loadDB();
    const id = genId(t);
    db[id] = {
      id, title: t, desc: String(desc || "").trim(),
      icon: clampIcon(iconIdx), points: clampPoints(ptsStr),
      reward: reward ? String(reward) : "", order: Object.keys(db).length
    };
    saveDB(db);
    log(`${player.name} creo el logro '${t}'.`);
    player.sendMessage(`§a[Logros] Logro §e${t}§a creado §8(id: ${id})`);
    openAdmin(player);
  });
}

function openEditList(player) {
  const db = loadDB();
  const list = dbList(db);
  const form = new ActionFormData().title("§l§eEditar Logros");
  form.body(list.length === 0 ? "§7No hay logros. Crea uno primero." : "§7Selecciona un logro para editarlo:");
  for (const a of list) {
    form.button(`§f${a.title}\n§8${clampPoints(a.points)} pts · id: ${a.id}`, medalIcon(a.icon));
  }
  form.button("§7« Volver", uiIcon("btn_back"));
  form.show(player).then((res) => {
    if (res.canceled) return;
    if (res.selection === list.length) { openAdmin(player); return; }
    const a = list[res.selection];
    if (a) openEdit(player, a.id);
  });
}

function openEdit(player, id) {
  const db = loadDB();
  const a = db[id];
  if (!a) { openEditList(player); return; }
  const form = new ModalFormData()
    .title("§l§eEditar: " + a.title)
    .textField("Titulo", a.title, a.title)
    .textField("Descripcion", a.desc || "", a.desc || "")
    .dropdown("Icono (imagen)", ICON_NAMES, clampIcon(a.icon))
    .textField("Puntos", String(clampPoints(a.points)), String(clampPoints(a.points)))
    .textField("Comando de recompensa (@s)", a.reward || "", a.reward || "")
    .toggle("§cBorrar este logro", false);
  form.show(player).then((res) => {
    if (res.canceled) { openEditList(player); return; }
    const [title, desc, iconIdx, ptsStr, reward, del] = res.formValues;
    const db2 = loadDB();
    const a2 = db2[id];
    if (!a2) { openEditList(player); return; }
    if (del) {
      delete db2[id];
      saveDB(db2);
      player.sendMessage(`§c[Logros] Logro §e${a2.title}§c borrado.`);
      log(`${player.name} borro el logro '${a2.title}'.`);
      openEditList(player);
      return;
    }
    a2.title = (String(title || "").trim()) || a2.title;
    a2.desc = String(desc || "").trim();
    a2.icon = clampIcon(iconIdx);
    a2.points = clampPoints(ptsStr);
    a2.reward = reward ? String(reward) : "";
    saveDB(db2);
    player.sendMessage(`§a[Logros] Logro §e${a2.title}§a actualizado.`);
    openEditList(player);
  });
}

function openGivePick(player) {
  const db = loadDB();
  const list = dbList(db);
  const form = new ActionFormData().title("§l§bOtorgar Logro");
  form.body(list.length === 0 ? "§7No hay logros." : "§7Elige el logro a otorgar:");
  for (const a of list) form.button(`§f${a.title}\n§8${clampPoints(a.points)} pts`, medalIcon(a.icon));
  form.button("§7« Volver", uiIcon("btn_back"));
  form.show(player).then((res) => {
    if (res.canceled) return;
    if (res.selection === list.length) { openAdmin(player); return; }
    const a = list[res.selection];
    if (a) openGiveTarget(player, a.id);
  });
}

function openGiveTarget(player, id) {
  const db = loadDB();
  const a = db[id];
  if (!a) { openGivePick(player); return; }
  const players = world.getAllPlayers();
  const names = players.map((p) => p.name);
  const form = new ModalFormData()
    .title("§l§bOtorgar: " + a.title)
    .dropdown("Otorgar a", ["§eYo mismo", "§aTodos los jugadores", ...names], 0)
    .toggle("Mostrar anuncio al jugador", true);
  form.show(player).then((res) => {
    if (res.canceled) { openGivePick(player); return; }
    const [choice, announce] = res.formValues;
    let targets = [];
    if (choice === 0) targets = [player];
    else if (choice === 1) targets = players;
    else {
      const p = players[choice - 2];
      if (p) targets = [p];
    }
    let n = 0;
    for (const t of targets) { if (awardAchievement(t, id, announce)) n++; }
    player.sendMessage(`§a[Logros] §e${a.title}§a otorgado a §f${n}§a jugador(es).`);
    openGivePick(player);
  });
}

function openResetMenu(player) {
  const db = loadDB();
  const list = dbList(db);
  const players = world.getAllPlayers();
  const names = players.map((p) => p.name);
  const form = new ModalFormData()
    .title("§l§cReiniciar Progreso")
    .dropdown("Reiniciar a", ["§eYo mismo", "§cTodos los jugadores", ...names], 0)
    .toggle("Confirmar (borra logros desbloqueados)", false);
  form.show(player).then((res) => {
    if (res.canceled) { openAdmin(player); return; }
    const [choice, confirm] = res.formValues;
    if (!confirm) { player.sendMessage("§7[Logros] Reinicio cancelado (no confirmado)."); openAdmin(player); return; }
    let targets = [];
    if (choice === 0) targets = [player];
    else if (choice === 1) targets = players;
    else { const p = players[choice - 2]; if (p) targets = [p]; }
    for (const t of targets) saveDone(t, {});
    player.sendMessage(`§c[Logros] Progreso reiniciado para §f${targets.length}§c jugador(es).`);
    log(`${player.name} reinicio el progreso de ${targets.length} jugador(es).`);
    openAdmin(player);
  });
}

function openRestoreDefaults(player) {
  const form = new MessageFormData()
    .title("§l§dRestaurar Defaults")
    .body("§7Esto §eagrega§7 los logros de ejemplo que falten.\n§7No borra los que ya tengas. ¿Continuar?")
    .button1("§aSi, restaurar")
    .button2("§8Cancelar");
  form.show(player).then((res) => {
    if (res.canceled || res.selection !== 0) { openAdmin(player); return; }
    const db = loadDB();
    let added = 0;
    DEFAULTS.forEach((d, i) => {
      if (!db[d.id]) { db[d.id] = { ...d, order: Object.keys(db).length + i }; added++; }
    });
    saveDB(db);
    player.sendMessage(`§a[Logros] Restaurados §f${added}§a logros de ejemplo.`);
    openAdmin(player);
  });
}

// ============================================================ EVENTOS ============================================================

// Abrir menu al usar el item
world.afterEvents.itemUse.subscribe((ev) => {
  const item = ev.itemStack;
  if (!item || item.typeId !== "logros:book") return;
  const player = ev.source;
  system.run(() => { try { openMain(player); } catch (e) { log("openMain fallo: " + e); } });
});

// Comando de chat alternativo: !logros
world.beforeEvents.chatSend.subscribe((ev) => {
  const msg = (ev.message || "").trim().toLowerCase();
  if (msg === "!logros" || msg === "!logro") {
    ev.cancel = true;
    const player = ev.sender;
    system.run(() => { try { openMain(player); } catch (e) {} });
  }
});

// ScriptEvent para command blocks / mapmakers
system.afterEvents.scriptEventReceive.subscribe((ev) => {
  const id = ev.id;
  const src = ev.sourceEntity;
  if (!src || src.typeId !== "minecraft:player") return;
  const arg = (ev.message || "").trim();
  if (id === "logros:give") {
    if (awardAchievement(src, arg, true)) log(`(scriptevent) ${src.name} +${arg}`);
    else src.sendMessage(`§c[Logros] Logro '${arg}' no existe o ya lo tienes.`);
  } else if (id === "logros:revoke") {
    if (revokeAchievement(src, arg)) src.sendMessage(`§7[Logros] Logro '${arg}' revocado.`);
  } else if (id === "logros:reset") {
    saveDone(src, {});
    src.sendMessage("§7[Logros] Tu progreso fue reiniciado.");
  } else if (id === "logros:open") {
    system.run(() => { try { openMain(src); } catch (e) {} });
  }
}, { namespaces: ["logros"] });

// Dar el item de bienvenida + sembrar logros
world.afterEvents.playerSpawn.subscribe((ev) => {
  if (!ev.initialSpawn) return;
  ensureSeed();
  const player = ev.player;
  // dar el libro una sola vez
  if (player.getDynamicProperty("logros:gotbook") !== true) {
    try { player.runCommand("give @s logros:book 1"); } catch (e) {}
    player.setDynamicProperty("logros:gotbook", true);
    player.sendMessage("§6[Logros] §aRecibiste el §eLibro de Logros§a. Usalo para abrir el menu (o escribe §f!logros§a).");
  }
});

system.run(() => { ensureSeed(); log("Logros Custom v1.0.0 cargado."); });
