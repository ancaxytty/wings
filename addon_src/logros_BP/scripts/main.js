import { world, system } from "@minecraft/server";
import { ActionFormData, ModalFormData, MessageFormData } from "@minecraft/server-ui";

/*
 * Logros Custom v2.0.0
 * -------------------------------------------------------------------------
 * Sistema de LOGROS (achievements) profesional para Minecraft Bedrock.
 *
 * NUEVO en v2:
 *  - TOAST estilo Minecraft original: aparece ARRIBA con animacion + sonido
 *    cuando desbloqueas un logro (cola para que no se solapen).
 *  - AUTO-DETECCION de progreso: los logros se desbloquean solos al
 *    MINAR / CONSTRUIR / MATAR mobs, con contador y objetivo (target).
 *  - ServerForm rediseñado (UI horizontal, botones grandes, texturas pro).
 *
 * Base:
 *  - Se abre con un ITEM con textura custom: "logros:book" (o !logros).
 *  - Galeria con IMAGENES (medallas), estado bloqueado/desbloqueado y barra.
 *  - Todo EDITABLE por admins (tag "admin").
 *  - Mapmakers: /scriptevent logros:give|revoke|reset|open <id>
 *  - Datos persistentes con dynamic properties.
 */

const VERSION = "2.0.0";
const TITLE = "§l§6Logros";
const DB_KEY = "logros:db";
const SEED_KEY = "logros:seeded_v2";
const DONE_KEY = "logros:done";
const PROG_KEY = "logros:prog";
const ADMIN_TAG = "admin";
const ICON_COUNT = 12;

// ----------------------------- helpers de textura -----------------------------
function medalIcon(i) { return `textures/ui/logros/m${clampIcon(i)}`; }
function medalLocked(i) { return `textures/ui/logros/m${clampIcon(i)}_off`; }
function uiIcon(name) { return `textures/ui/logros/${name}`; }
function clampIcon(n) {
  n = Math.floor(Number(n));
  if (!Number.isFinite(n) || n < 0) return 0;
  if (n > ICON_COUNT - 1) return ICON_COUNT - 1;
  return n;
}

const ICON_NAMES = [
  "Estrella", "Pico", "Espada", "Escudo", "Corona", "Diamante",
  "Trofeo", "Corazon", "Rayo", "Llama", "Hoja", "Calavera"
];

// ----------------------------- triggers de auto-deteccion -----------------------------
// trigger: como se desbloquea el logro
//   "manual" -> solo por admin / scriptevent
//   "mine"   -> al minar bloques (target = id de bloque o "" = cualquiera)
//   "place"  -> al colocar bloques
//   "kill"   -> al matar entidades (target = typeId o "" = cualquiera)
const TRIGGERS = ["manual", "mine", "place", "kill"];
const TRIGGER_NAMES = ["Manual (admin / command)", "Minar bloques", "Construir (colocar)", "Matar mobs"];

// ----------------------------- logros por defecto (v2 con auto-track) -----------------------------
const DEFAULTS = [
  { id: "primeros_pasos", title: "Primeros Pasos", desc: "Da tus primeros pasos en el mundo.", icon: 0, points: 10, reward: "", trigger: "manual", target: "", count: 1 },
  { id: "minero", title: "Minero Novato", desc: "Mina 10 bloques.", icon: 1, points: 15, reward: "", trigger: "mine", target: "", count: 10 },
  { id: "excavador", title: "Excavador", desc: "Mina 100 bloques en total.", icon: 1, points: 30, reward: "", trigger: "mine", target: "", count: 100 },
  { id: "diamantes", title: "Joyero", desc: "Mina tu primer diamante.", icon: 5, points: 50, reward: "", trigger: "mine", target: "minecraft:diamond_ore", count: 1 },
  { id: "constructor", title: "Constructor", desc: "Coloca 50 bloques.", icon: 10, points: 20, reward: "", trigger: "place", target: "", count: 50 },
  { id: "arquitecto", title: "Arquitecto", desc: "Coloca 500 bloques.", icon: 4, points: 60, reward: "", trigger: "place", target: "", count: 500 },
  { id: "guerrero", title: "Guerrero", desc: "Derrota a 5 enemigos.", icon: 2, points: 25, reward: "", trigger: "kill", target: "", count: 5 },
  { id: "cazador", title: "Cazador", desc: "Derrota a 50 enemigos.", icon: 8, points: 70, reward: "", trigger: "kill", target: "", count: 50 },
  { id: "campeon", title: "Campeon", desc: "Gana una partida o evento.", icon: 6, points: 100, reward: "", trigger: "manual", target: "", count: 1 }
];

// ----------------------------- utilidades -----------------------------
function log(msg) { try { console.warn(`[Logros] ${msg}`); } catch (e) {} }
function isAdmin(player) {
  try { return player.hasTag(ADMIN_TAG) || player.isOp?.() === true; } catch (e) { return false; }
}
function clampPoints(n) {
  n = Math.floor(Number(n));
  if (!Number.isFinite(n) || n < 0) return 0;
  if (n > 100000) return 100000;
  return n;
}
function clampCount(n) {
  n = Math.floor(Number(n));
  if (!Number.isFinite(n) || n < 1) return 1;
  if (n > 1000000) return 1000000;
  return n;
}
function normTrigger(t) { return TRIGGERS.includes(t) ? t : "manual"; }
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
function normalizeAchievement(a) {
  return {
    id: a.id,
    title: a.title,
    desc: a.desc || "",
    icon: clampIcon(a.icon),
    points: clampPoints(a.points),
    reward: a.reward ? String(a.reward) : "",
    trigger: normTrigger(a.trigger),
    target: a.target ? String(a.target).trim() : "",
    count: clampCount(a.count),
    order: a.order || 0
  };
}
function dbList(db) {
  return Object.keys(db).map((k) => normalizeAchievement(db[k])).sort((a, b) => (a.order || 0) - (b.order || 0));
}
function ensureSeed() {
  if (world.getDynamicProperty(SEED_KEY) === true) return;
  const db = loadDB();
  if (Object.keys(db).length === 0) {
    DEFAULTS.forEach((d, i) => { db[d.id] = { ...d, order: i }; });
    saveDB(db);
    log(`Sembrados ${DEFAULTS.length} logros por defecto (v2).`);
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
function loadProg(player) {
  const raw = player.getDynamicProperty(PROG_KEY);
  if (typeof raw !== "string" || raw.length === 0) return {};
  try { return JSON.parse(raw); } catch (e) { return {}; }
}
function saveProg(player, prog) {
  try { player.setDynamicProperty(PROG_KEY, JSON.stringify(prog)); } catch (e) {}
}
function totalPoints(player, db) {
  const done = loadDone(player);
  let pts = 0;
  for (const id of Object.keys(done)) if (db[id]) pts += clampPoints(db[id].points);
  return pts;
}

function progressBar(found, total, len = 14) {
  if (total <= 0) return "§8[§7sin logros§8]";
  const ratio = Math.max(0, Math.min(1, found / total));
  const filled = Math.round(ratio * len);
  let bar = "§a";
  for (let i = 0; i < len; i++) { if (i === filled) bar += "§8"; bar += "█"; }
  return `${bar} §f${Math.round(ratio * 100)}%`;
}
function miniBar(cur, max, len = 10) {
  const ratio = Math.max(0, Math.min(1, cur / max));
  const filled = Math.round(ratio * len);
  let bar = "";
  for (let i = 0; i < len; i++) bar += i < filled ? "§a▮" : "§8▮";
  return bar;
}

// ============================================================ TOAST estilo Minecraft ============================================================
// Cola de toasts por jugador para que no se solapen (se muestran arriba con
// animacion fadeIn/stay/fadeOut, como el aviso de logro nativo).
const toastQueue = new Map(); // name -> array
const toastBusy = new Map();  // name -> bool

function queueToast(player, achievement) {
  const name = player.name;
  if (!toastQueue.has(name)) toastQueue.set(name, []);
  toastQueue.get(name).push(achievement);
  if (!toastBusy.get(name)) processToast(player);
}
function processToast(player) {
  const name = player.name;
  const q = toastQueue.get(name);
  if (!q || q.length === 0) { toastBusy.set(name, false); return; }
  toastBusy.set(name, true);
  const a = q.shift();
  showToast(player, a);
  // duracion del toast ~ 3.2s antes del siguiente
  system.runTimeout(() => { processToast(player); }, 64);
}
function showToast(player, a) {
  try {
    // Linea decorativa superior que imita la "ventanita" de logro de MC.
    const top = "§l§6🏆 ¡Logro obtenido!";
    const sub = `§e${a.title}  §7+${clampPoints(a.points)}pts`;
    player.onScreenDisplay.setTitle(top, {
      fadeInDuration: 8,
      stayDuration: 44,
      fadeOutDuration: 12,
      subtitle: sub
    });
  } catch (e) {}
  try {
    player.playSound("random.levelup", { volume: 0.9, pitch: 1.2 });
    player.playSound("random.orb", { pitch: 1.5 });
  } catch (e) {}
  // refuerzo en actionbar (texto inferior) para que se note como toast
  try {
    player.onScreenDisplay.setActionBar(`§6✦ §e${a.title} §6✦`);
  } catch (e) {}
}

// ----------------------------- otorgar / revocar -----------------------------
function awardAchievement(player, id, announce = true) {
  const db = loadDB();
  const a = db[id] ? normalizeAchievement(db[id]) : null;
  if (!a) return false;
  const done = loadDone(player);
  if (done[id]) return false;
  done[id] = Date.now();
  saveDone(player, done);

  if (announce) {
    queueToast(player, a);
    player.sendMessage(`§6[Logros] §a¡Desbloqueaste §e${a.title}§a! §7(+${clampPoints(a.points)} pts)`);
  }
  if (a.reward && a.reward.trim().length > 0) {
    try { player.runCommand(a.reward.trim()); } catch (e) { log("Recompensa fallo: " + e); }
  }
  log(`${player.name} desbloqueo '${a.title}'.`);
  return true;
}
function revokeAchievement(player, id) {
  const done = loadDone(player);
  if (!done[id]) return false;
  delete done[id];
  saveDone(player, done);
  // reset del contador asociado
  const prog = loadProg(player);
  if (prog[id]) { delete prog[id]; saveProg(player, prog); }
  return true;
}

// ============================================================ AUTO-DETECCION ============================================================
// Incrementa el progreso de todos los logros que coincidan con el evento.
function trackEvent(player, triggerType, matchedId) {
  if (!player || typeof player.name !== "string") return;
  const db = loadDB();
  const done = loadDone(player);
  const prog = loadProg(player);
  let changed = false;

  for (const key of Object.keys(db)) {
    const a = normalizeAchievement(db[key]);
    if (a.trigger !== triggerType) continue;
    if (done[a.id]) continue; // ya completado
    // filtro por target (id de bloque/entidad). vacio = cualquiera
    if (a.target && a.target.length > 0) {
      if (!matchedId) continue;
      if (matchedId !== a.target && matchedId !== ("minecraft:" + a.target) && ("minecraft:" + matchedId) !== a.target) continue;
    }
    const cur = (prog[a.id] || 0) + 1;
    prog[a.id] = cur;
    changed = true;
    if (cur >= a.count) {
      // completar
      done[a.id] = Date.now();
      saveDone(player, done);
      delete prog[a.id];
      queueToast(player, a);
      player.sendMessage(`§6[Logros] §a¡Desbloqueaste §e${a.title}§a! §7(+${clampPoints(a.points)} pts)`);
      if (a.reward && a.reward.trim().length > 0) {
        try { player.runCommand(a.reward.trim()); } catch (e) {}
      }
      log(`${player.name} auto-desbloqueo '${a.title}'.`);
    } else if (a.count > 1 && shouldNudge(cur, a.count)) {
      // aviso de progreso sutil en hitos
      try { player.onScreenDisplay.setActionBar(`§7${a.title}: §f${cur}§7/§f${a.count}  ${miniBar(cur, a.count)}`); } catch (e) {}
    }
  }
  if (changed) saveProg(player, prog);
}
function shouldNudge(cur, max) {
  // avisa en 25/50/75% y en el penultimo
  const ms = [Math.floor(max * 0.25), Math.floor(max * 0.5), Math.floor(max * 0.75), max - 1];
  return ms.includes(cur);
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
      `§r§7Bienvenido §f${player.name}\n` +
      `§8──────────────────\n` +
      `§7Progreso §8»§f ${unlocked}§7/§f${list.length}\n` +
      `${progressBar(unlocked, list.length)}\n` +
      `§7Puntos §8»§6 ${pts}\n` +
      `§8──────────────────\n`
    )
    .button("§l§aVER LOGROS\n§r§7galeria con imagenes", uiIcon("btn_view"))
    .button("§l§bMI PROGRESO\n§r§7estadisticas y contadores", uiIcon("btn_stats"));
  if (admin) form.button("§l§eADMINISTRAR\n§r§7crear / editar / otorgar", uiIcon("btn_admin"));
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

function statusLabel(a, done, prog) {
  if (done[a.id]) return `§a✔ §f${a.title}\n§7${clampPoints(a.points)} pts §8· §adesbloqueado`;
  if (a.trigger !== "manual" && a.count > 1) {
    const cur = prog[a.id] || 0;
    return `§8🔒 §7${a.title}\n§8${cur}/${a.count} · ${clampPoints(a.points)} pts`;
  }
  return `§8🔒 §7${a.title}\n§8${clampPoints(a.points)} pts · bloqueado`;
}

function openAchievements(player) {
  const db = loadDB();
  const list = dbList(db);
  const done = loadDone(player);
  const prog = loadProg(player);
  const unlocked = list.filter((a) => done[a.id]).length;

  const form = new ActionFormData()
    .title("§l§6Galeria de Logros")
    .body(
      list.length === 0
        ? "§7Todavia no hay logros configurados.\n§7Un admin puede crearlos en §eAdministrar§7."
        : `§7Toca un logro para ver el detalle.\n§7Desbloqueados §8»§f ${unlocked}/${list.length}\n${progressBar(unlocked, list.length)}`
    );
  for (const a of list) {
    const icon = done[a.id] ? medalIcon(a.icon) : medalLocked(a.icon);
    form.button(statusLabel(a, done, prog), icon);
  }
  form.button("§7« Volver", uiIcon("btn_back"));
  form.show(player).then((res) => {
    if (res.canceled) return;
    if (res.selection === list.length) { openMain(player); return; }
    const a = list[res.selection];
    if (a) openDetail(player, a.id);
  });
}

function triggerDesc(a) {
  switch (a.trigger) {
    case "mine": return a.target ? `Minar ${a.count}x §f${a.target}` : `Minar ${a.count} bloques`;
    case "place": return a.target ? `Colocar ${a.count}x §f${a.target}` : `Colocar ${a.count} bloques`;
    case "kill": return a.target ? `Matar ${a.count}x §f${a.target}` : `Matar ${a.count} mobs`;
    default: return "Otorgado por un admin / evento";
  }
}

function openDetail(player, id) {
  const db = loadDB();
  const a = db[id] ? normalizeAchievement(db[id]) : null;
  if (!a) { openAchievements(player); return; }
  const done = loadDone(player);
  const prog = loadProg(player);
  const got = !!done[id];
  const when = got ? new Date(done[id]).toLocaleString() : null;

  let body = `§6§l${a.title}§r\n\n`;
  body += `§7${a.desc || "(sin descripcion)"}\n\n`;
  body += `§7Objetivo §8»§f ${triggerDesc(a)}\n`;
  if (!got && a.trigger !== "manual" && a.count > 1) {
    const cur = prog[a.id] || 0;
    body += `§7Avance §8»§f ${cur}/${a.count}  ${miniBar(cur, a.count)}\n`;
  }
  body += `§7Puntos §8»§6 ${clampPoints(a.points)}\n`;
  body += got ? `§aEstado §8»§a DESBLOQUEADO\n` : `§7Estado §8»§c bloqueado\n`;
  if (when) body += `§7Fecha §8»§f ${when}\n`;
  if (a.reward && a.reward.trim().length) body += `§7Recompensa §8»§f ${a.reward}\n`;

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
  const prog = loadProg(player);
  const unlocked = list.filter((a) => done[a.id]).length;
  const pts = totalPoints(player, db);
  const maxPts = list.reduce((acc, a) => acc + clampPoints(a.points), 0);

  let body = `§6§l${player.name}§r\n\n`;
  body += `§7Logros §8»§f ${unlocked}/${list.length}\n${progressBar(unlocked, list.length)}\n\n`;
  body += `§7Puntos §8»§6 ${pts}§7 / §6${maxPts}\n\n`;
  body += `§8En progreso:\n`;
  const inProg = list.filter((a) => !done[a.id] && a.trigger !== "manual" && (prog[a.id] || 0) > 0)
    .sort((x, y) => (prog[y.id] || 0) / y.count - (prog[x.id] || 0) / x.count).slice(0, 5);
  if (inProg.length === 0) body += "§8 (nada en progreso)\n";
  for (const a of inProg) body += `§7 ${a.title}: §f${prog[a.id] || 0}/${a.count} ${miniBar(prog[a.id] || 0, a.count)}\n`;

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
      "§e§lLogros Custom v" + VERSION + "§r\n\n" +
      "§7• Abre el menu con el §6Libro de Logros§7 o escribe §f!logros§7.\n" +
      "§7• Muchos logros se §adesbloquean solos§7 al §6minar§7, §6construir§7 o §6matar mobs§7.\n" +
      "§7• Al completarlos veras un §6aviso arriba§7 (estilo logro de Minecraft).\n" +
      "§7• En §aVer Logros§7 ves las medallas; las bloqueadas salen en gris.\n\n" +
      "§6§lAdmins§r §7(tag §eadmin§7):\n" +
      "§7• §eAdministrar§7 → crear/editar/borrar/otorgar y elegir el §6disparador§7.\n" +
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
    .dropdown("Disparador (como se desbloquea)", TRIGGER_NAMES, 0)
    .textField("Objetivo/bloque/mob (opcional, ej: minecraft:diamond_ore)", "", "")
    .textField("Cantidad necesaria", "1", "1")
    .textField("Comando de recompensa (usa @s, opcional)", "give @s diamond 1", "");
  form.show(player).then((res) => {
    if (res.canceled) { openAdmin(player); return; }
    const [title, desc, iconIdx, ptsStr, trigIdx, target, countStr, reward] = res.formValues;
    const t = String(title || "").trim();
    if (!t) { player.sendMessage("§c[Logros] El titulo no puede estar vacio."); openCreate(player); return; }
    const db = loadDB();
    const id = genId(t);
    db[id] = {
      id, title: t, desc: String(desc || "").trim(),
      icon: clampIcon(iconIdx), points: clampPoints(ptsStr),
      trigger: TRIGGERS[trigIdx] || "manual",
      target: String(target || "").trim(),
      count: clampCount(countStr),
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
  for (const a of list) form.button(`§f${a.title}\n§8${clampPoints(a.points)} pts · ${a.trigger}`, medalIcon(a.icon));
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
  const a = db[id] ? normalizeAchievement(db[id]) : null;
  if (!a) { openEditList(player); return; }
  const form = new ModalFormData()
    .title("§l§eEditar: " + a.title)
    .textField("Titulo", a.title, a.title)
    .textField("Descripcion", a.desc || "", a.desc || "")
    .dropdown("Icono (imagen)", ICON_NAMES, clampIcon(a.icon))
    .textField("Puntos", String(clampPoints(a.points)), String(clampPoints(a.points)))
    .dropdown("Disparador", TRIGGER_NAMES, Math.max(0, TRIGGERS.indexOf(a.trigger)))
    .textField("Objetivo/bloque/mob (opcional)", a.target || "", a.target || "")
    .textField("Cantidad necesaria", String(a.count), String(a.count))
    .textField("Comando de recompensa (@s)", a.reward || "", a.reward || "")
    .toggle("§cBorrar este logro", false);
  form.show(player).then((res) => {
    if (res.canceled) { openEditList(player); return; }
    const [title, desc, iconIdx, ptsStr, trigIdx, target, countStr, reward, del] = res.formValues;
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
    a2.trigger = TRIGGERS[trigIdx] || "manual";
    a2.target = String(target || "").trim();
    a2.count = clampCount(countStr);
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
  const a = db[id] ? normalizeAchievement(db[id]) : null;
  if (!a) { openGivePick(player); return; }
  const players = world.getAllPlayers();
  const names = players.map((p) => p.name);
  const form = new ModalFormData()
    .title("§l§bOtorgar: " + a.title)
    .dropdown("Otorgar a", ["§eYo mismo", "§aTodos los jugadores", ...names], 0)
    .toggle("Mostrar aviso (toast) al jugador", true);
  form.show(player).then((res) => {
    if (res.canceled) { openGivePick(player); return; }
    const [choice, announce] = res.formValues;
    let targets = [];
    if (choice === 0) targets = [player];
    else if (choice === 1) targets = players;
    else { const p = players[choice - 2]; if (p) targets = [p]; }
    let n = 0;
    for (const t of targets) { if (awardAchievement(t, id, announce)) n++; }
    player.sendMessage(`§a[Logros] §e${a.title}§a otorgado a §f${n}§a jugador(es).`);
    openGivePick(player);
  });
}

function openResetMenu(player) {
  const players = world.getAllPlayers();
  const names = players.map((p) => p.name);
  const form = new ModalFormData()
    .title("§l§cReiniciar Progreso")
    .dropdown("Reiniciar a", ["§eYo mismo", "§cTodos los jugadores", ...names], 0)
    .toggle("Confirmar (borra logros y contadores)", false);
  form.show(player).then((res) => {
    if (res.canceled) { openAdmin(player); return; }
    const [choice, confirm] = res.formValues;
    if (!confirm) { player.sendMessage("§7[Logros] Reinicio cancelado (no confirmado)."); openAdmin(player); return; }
    let targets = [];
    if (choice === 0) targets = [player];
    else if (choice === 1) targets = players;
    else { const p = players[choice - 2]; if (p) targets = [p]; }
    for (const t of targets) { saveDone(t, {}); saveProg(t, {}); }
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

// Chat: !logros
world.beforeEvents.chatSend.subscribe((ev) => {
  const msg = (ev.message || "").trim().toLowerCase();
  if (msg === "!logros" || msg === "!logro") {
    ev.cancel = true;
    const player = ev.sender;
    system.run(() => { try { openMain(player); } catch (e) {} });
  }
});

// ---- AUTO-DETECCION ----
// Minar bloques
world.afterEvents.playerBreakBlock.subscribe((ev) => {
  const player = ev.player;
  const blockId = ev.brokenBlockPermutation?.type?.id || ev.block?.typeId || "";
  system.run(() => { try { trackEvent(player, "mine", blockId); } catch (e) {} });
});
// Colocar bloques
world.afterEvents.playerPlaceBlock.subscribe((ev) => {
  const player = ev.player;
  const blockId = ev.block?.typeId || "";
  system.run(() => { try { trackEvent(player, "place", blockId); } catch (e) {} });
});
// Matar entidades (atribuir al jugador que dio el golpe mortal)
world.afterEvents.entityDie.subscribe((ev) => {
  const killer = ev.damageSource?.damagingEntity;
  if (!killer || killer.typeId !== "minecraft:player") return;
  const victimId = ev.deadEntity?.typeId || "";
  system.run(() => { try { trackEvent(killer, "kill", victimId); } catch (e) {} });
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
    saveDone(src, {}); saveProg(src, {});
    src.sendMessage("§7[Logros] Tu progreso fue reiniciado.");
  } else if (id === "logros:open") {
    system.run(() => { try { openMain(src); } catch (e) {} });
  }
}, { namespaces: ["logros"] });

// Item de bienvenida + sembrar logros
world.afterEvents.playerSpawn.subscribe((ev) => {
  if (!ev.initialSpawn) return;
  ensureSeed();
  const player = ev.player;
  if (player.getDynamicProperty("logros:gotbook") !== true) {
    try { player.runCommand("give @s logros:book 1"); } catch (e) {}
    player.setDynamicProperty("logros:gotbook", true);
    player.sendMessage("§6[Logros] §aRecibiste el §eLibro de Logros§a. Usalo para abrir el menu (o escribe §f!logros§a).");
  }
});

system.run(() => { ensureSeed(); log(`Logros Custom v${VERSION} cargado.`); });
