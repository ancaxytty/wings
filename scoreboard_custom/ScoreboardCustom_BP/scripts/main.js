import * as mc from "@minecraft/server";
import * as ui from "@minecraft/server-ui";

/*
 * Scoreboard Custom v0.1.0  (Minecraft Bedrock / MCPE)
 * --------------------------------------------------------------
 * - Scoreboard de barra lateral (sidebar) 100% personalizable.
 * - Iconos/imagenes profesionales mediante GLYPHS del Resource Pack.
 * - Menu visual para editar (titulo, lineas, iconos, plantillas).
 * - API de comandos:  /cs:create /cs:edit /cs:delete /cs:info
 *   /cs:reload /cs:reset /cs:set /cs:image /cs:title /cs:menu
 *   /cs:addline /cs:removeline /cs:toggle
 * - 6 plantillas: Volcan, Aire, Agua, Sombra, Luz y Zombies.
 *
 * Requiere Minecraft 1.21.90+ (API de comandos personalizados).
 */

const { world, system } = mc;
const ActionFormData = ui.ActionFormData;
const ModalFormData = ui.ModalFormData;
const MessageFormData = ui.MessageFormData;

// --------------------------------------------------------------- enums (defensivo)
const CCStatus = mc.CustomCommandStatus || { Success: 0, Failure: 1 };
const PType = mc.CustomCommandParamType || {};
const PermLvl = mc.CommandPermissionLevel || mc.CustomCommandPermissionLevel || {};
const PERM_ADMIN = PermLvl.GameDirectors ?? PermLvl.Admin ?? 1;
const PERM_ANY = PermLvl.Any ?? 0;
const SLOT_SIDEBAR = (mc.DisplaySlotId && mc.DisplaySlotId.Sidebar) || "Sidebar";
const SORT_DESC = (mc.ObjectiveSortOrder && mc.ObjectiveSortOrder.Descending) || "Descending";
const BUSY = ui.FormCancelationReason ? ui.FormCancelationReason.UserBusy : "UserBusy";

// --------------------------------------------------------------- glyphs (iconos)
// char = 0xE100 + indice (mismo orden que _gen_assets.py)
const GLYPH_ORDER = [
  "volcano", "fire", "air", "water", "shadow", "light", "zombie", "heart",
  "star", "coin", "diamond", "sword", "skull", "clock", "crown", "leaf",
  "head", "trophy", "shield", "bolt", "gem", "arrow", "dot"
];
const GLYPH = {};
GLYPH_ORDER.forEach((name, i) => { GLYPH[name] = String.fromCharCode(0xE100 + i); });

// nombres legibles para el menu
const ICON_LABELS = {
  none: "Sin icono", volcano: "Volcan", fire: "Fuego", air: "Aire", water: "Agua",
  shadow: "Sombra", light: "Luz", zombie: "Zombie", heart: "Corazon", star: "Estrella",
  coin: "Moneda", diamond: "Diamante", sword: "Espada", skull: "Calavera", clock: "Reloj",
  crown: "Corona", leaf: "Hoja", head: "Cabeza", trophy: "Trofeo", shield: "Escudo",
  bolt: "Rayo", gem: "Gema", arrow: "Flecha", dot: "Punto"
};
const ICON_KEYS = ["none", ...GLYPH_ORDER];

// --------------------------------------------------------------- plantillas
const TEMPLATES = {
  volcan: {
    label: "§6Volcan", icon: "t_volcan",
    title: "§l§c{volcano} §6VOLCAN §c{volcano}",
    lines: [
      { icon: "fire", text: "§cReino §8» §6Magma" },
      { icon: "coin", text: "§eOro §8» §f0" },
      { icon: "skull", text: "§cBajas §8» §f0" },
      { icon: "clock", text: "§7Dia §8» §f{day}" },
      { icon: "dot", text: "§7Online §8» §a{online}" }
    ]
  },
  aire: {
    label: "§bAire", icon: "t_aire",
    title: "§l§b{air} §fAIRE §b{air}",
    lines: [
      { icon: "air", text: "§bCielo §8» §fInfinito" },
      { icon: "bolt", text: "§eVelocidad §8» §f100%" },
      { icon: "star", text: "§dNivel §8» §f1" },
      { icon: "clock", text: "§7Hora §8» §f{time}" },
      { icon: "dot", text: "§7Online §8» §a{online}" }
    ]
  },
  agua: {
    label: "§3Agua", icon: "t_agua",
    title: "§l§3{water} §bAGUA §3{water}",
    lines: [
      { icon: "water", text: "§bProfundidad §8» §f0m" },
      { icon: "gem", text: "§3Perlas §8» §f0" },
      { icon: "heart", text: "§cOxigeno §8» §f100%" },
      { icon: "clock", text: "§7Dia §8» §f{day}" },
      { icon: "dot", text: "§7Online §8» §a{online}" }
    ]
  },
  sombra: {
    label: "§5Sombra", icon: "t_sombra",
    title: "§l§5{shadow} §dSOMBRA §5{shadow}",
    lines: [
      { icon: "shadow", text: "§5Reino §8» §8Oscuro" },
      { icon: "skull", text: "§8Almas §8» §f0" },
      { icon: "sword", text: "§7Poder §8» §f0" },
      { icon: "clock", text: "§7Dia §8» §f{day}" },
      { icon: "dot", text: "§7Online §8» §a{online}" }
    ]
  },
  luz: {
    label: "§eLuz", icon: "t_luz",
    title: "§l§e{light} §fLUZ §e{light}",
    lines: [
      { icon: "light", text: "§eAura §8» §fSagrada" },
      { icon: "star", text: "§6Brillo §8» §f100%" },
      { icon: "heart", text: "§dVida §8» §f20" },
      { icon: "clock", text: "§7Hora §8» §f{time}" },
      { icon: "dot", text: "§7Online §8» §a{online}" }
    ]
  },
  zombies: {
    label: "§2Zombies", icon: "t_zombies",
    title: "§l§2{zombie} §aZOMBIES §2{zombie}",
    lines: [
      { icon: "zombie", text: "§2Oleada §8» §f1" },
      { icon: "skull", text: "§cZombies §8» §f0" },
      { icon: "sword", text: "§7Bajas §8» §f0" },
      { icon: "heart", text: "§cVidas §8» §f3" },
      { icon: "dot", text: "§7Online §8» §a{online}" }
    ]
  }
};
const TEMPLATE_KEYS = Object.keys(TEMPLATES);

// --------------------------------------------------------------- estado / db
const CFG_KEY = "cs:config";
const OBJ_ID = "cs_main";
const ADMIN_TAG = "csadmin";
const DEFAULT_TITLE = "§l§bSCOREBOARD";

let lastTitle = null;
let lastNames = new Set();

function defaultConfig() {
  return { active: false, template: null, title: DEFAULT_TITLE, titleIcon: "none", lines: [] };
}
function loadConfig() {
  const raw = world.getDynamicProperty(CFG_KEY);
  if (typeof raw !== "string" || !raw.length) return defaultConfig();
  try {
    const c = JSON.parse(raw);
    if (!c || typeof c !== "object") return defaultConfig();
    c.lines = Array.isArray(c.lines) ? c.lines : [];
    if (typeof c.title !== "string") c.title = DEFAULT_TITLE;
    if (typeof c.titleIcon !== "string") c.titleIcon = "none";
    return c;
  } catch (e) {
    return defaultConfig();
  }
}
function saveConfig(c) {
  world.setDynamicProperty(CFG_KEY, JSON.stringify(c));
}

// --------------------------------------------------------------- helpers
function log(msg) { try { console.warn(`[ScoreboardCustom] ${msg}`); } catch (e) {} }
function pad2(n) { return (n < 10 ? "0" : "") + n; }
function clampLineIdx(c, n) {
  n = Math.floor(Number(n));
  if (!Number.isFinite(n)) return -1;
  return n;
}
function iconGlyph(name) {
  return name && name !== "none" && GLYPH[name] ? GLYPH[name] : "";
}
function isAdmin(player) {
  try {
    if (player.hasTag(ADMIN_TAG)) return true;
    if (typeof player.isOp === "function" && player.isOp()) return true;
    if (typeof player.commandPermissionLevel === "number") return player.commandPermissionLevel >= PERM_ADMIN;
  } catch (e) {}
  return false;
}

// resuelve {tokens}: iconos (glyph) y variables dinamicas
function resolveText(s) {
  if (typeof s !== "string") return "";
  return s.replace(/\{([a-zA-Z0-9_]+)\}/g, (m, raw) => {
    const k = raw.toLowerCase();
    if (GLYPH[k]) return GLYPH[k];
    switch (k) {
      case "online": {
        try { return String(world.getAllPlayers().length); } catch (e) { return "0"; }
      }
      case "day": {
        try { return String(typeof world.getDay === "function" ? world.getDay() : 0); } catch (e) { return "0"; }
      }
      case "time": {
        const d = new Date();
        return pad2(d.getHours()) + ":" + pad2(d.getMinutes());
      }
      case "date": {
        const d = new Date();
        return pad2(d.getDate()) + "/" + pad2(d.getMonth() + 1) + "/" + d.getFullYear();
      }
      default:
        return m;
    }
  });
}

function renderTitle(cfg) {
  const ic = iconGlyph(cfg.titleIcon);
  const base = resolveText(cfg.title || DEFAULT_TITLE);
  return (ic ? ic + " " : "") + base;
}
function renderLine(line) {
  const ic = iconGlyph(line && line.icon);
  const txt = resolveText(line && line.text ? line.text : "");
  return (ic ? ic + " " : "") + txt;
}

// --------------------------------------------------------------- render del sidebar
function clearDisplay() {
  try { world.scoreboard.clearObjectiveAtDisplaySlot(SLOT_SIDEBAR); } catch (e) {}
}
function removeObjective() {
  try {
    const o = world.scoreboard.getObjective(OBJ_ID);
    if (o) world.scoreboard.removeObjective(OBJ_ID);
  } catch (e) {}
  lastTitle = null;
  lastNames = new Set();
}
function ensureObjective(displayName) {
  let obj = null;
  try { obj = world.scoreboard.getObjective(OBJ_ID); } catch (e) {}
  if (obj && lastTitle !== null && lastTitle !== displayName) {
    try { world.scoreboard.removeObjective(OBJ_ID); } catch (e) {}
    obj = null;
    lastNames = new Set();
  }
  if (!obj) {
    try { obj = world.scoreboard.addObjective(OBJ_ID, displayName); } catch (e) {
      try { obj = world.scoreboard.getObjective(OBJ_ID); } catch (e2) {}
    }
  }
  lastTitle = displayName;
  return obj;
}

function render() {
  const cfg = loadConfig();
  if (!cfg.active || cfg.lines.length === 0) {
    clearDisplay();
    return;
  }
  const obj = ensureObjective(renderTitle(cfg));
  if (!obj) return;

  // construye lineas (con padding invisible para unicidad)
  const entries = [];
  const newNames = new Set();
  for (let i = 0; i < cfg.lines.length; i++) {
    let text = renderLine(cfg.lines[i]);
    if (text.length === 0) text = " ";
    const name = (text + "\u00A7r".repeat(i)).slice(0, 512);
    entries.push({ name, score: cfg.lines.length - i });
    newNames.add(name);
  }
  // limpia lineas viejas
  for (const old of lastNames) {
    if (!newNames.has(old)) {
      try { obj.removeParticipant(old); } catch (e) {}
    }
  }
  // escribe lineas nuevas
  for (const e of entries) {
    try { obj.setScore(e.name, e.score); } catch (err) {}
  }
  lastNames = newNames;

  try {
    world.scoreboard.setObjectiveAtDisplaySlot(SLOT_SIDEBAR, { objective: obj, sortOrder: SORT_DESC });
  } catch (e) {}
}

function refreshNow() {
  removeObjective();
  render();
}

// --------------------------------------------------------------- operaciones de alto nivel
function applyTemplate(key) {
  const t = TEMPLATES[key];
  if (!t) return false;
  const cfg = loadConfig();
  cfg.template = key;
  cfg.title = t.title;
  cfg.titleIcon = "none"; // el icono ya va embebido en el title via {token}
  cfg.lines = t.lines.map((l) => ({ icon: l.icon, text: l.text }));
  cfg.active = true;
  saveConfig(cfg);
  refreshNow();
  return true;
}
function setActive(on) {
  const cfg = loadConfig();
  cfg.active = !!on;
  saveConfig(cfg);
  if (cfg.active) refreshNow(); else clearDisplay();
}
function setTitle(text, icon) {
  const cfg = loadConfig();
  if (typeof text === "string") cfg.title = text;
  if (typeof icon === "string") cfg.titleIcon = ICON_KEYS.includes(icon) ? icon : cfg.titleIcon;
  saveConfig(cfg);
  refreshNow();
}
function setLine(idx1, text) {
  const cfg = loadConfig();
  const i = idx1 - 1;
  if (i < 0) return false;
  if (i >= cfg.lines.length) {
    while (cfg.lines.length < i) cfg.lines.push({ icon: "none", text: "" });
    cfg.lines.push({ icon: "none", text: String(text) });
  } else {
    cfg.lines[i].text = String(text);
  }
  if (cfg.lines.length > 0) cfg.active = true;
  saveConfig(cfg);
  refreshNow();
  return true;
}
function setImage(idx1, icon) {
  const cfg = loadConfig();
  const i = idx1 - 1;
  if (i < 0 || i >= cfg.lines.length) return false;
  cfg.lines[i].icon = ICON_KEYS.includes(icon) ? icon : "none";
  saveConfig(cfg);
  refreshNow();
  return true;
}
function addLine(text, icon) {
  const cfg = loadConfig();
  cfg.lines.push({ icon: ICON_KEYS.includes(icon) ? icon : "none", text: String(text || "") });
  cfg.active = true;
  saveConfig(cfg);
  refreshNow();
  return cfg.lines.length;
}
function removeLine(idx1) {
  const cfg = loadConfig();
  const i = idx1 - 1;
  if (i < 0 || i >= cfg.lines.length) return false;
  cfg.lines.splice(i, 1);
  saveConfig(cfg);
  refreshNow();
  return true;
}
function resetConfig() {
  saveConfig(defaultConfig());
  removeObjective();
  clearDisplay();
}
function infoText(cfg) {
  let body = "§7Estado §8» " + (cfg.active ? "§aACTIVO" : "§cAPAGADO") + "\n";
  body += "§7Plantilla §8» §f" + (cfg.template ? (TEMPLATES[cfg.template] ? TEMPLATES[cfg.template].label : cfg.template) : "§8(ninguna)") + "\n";
  body += "§7Titulo §8» §f" + (cfg.title || DEFAULT_TITLE) + "\n";
  body += "§7Lineas §8» §f" + cfg.lines.length + "\n";
  cfg.lines.forEach((l, i) => {
    body += "  §8" + (i + 1) + ". §7[" + (ICON_LABELS[l.icon] || l.icon || "none") + "] §f" + (l.text || "") + "\n";
  });
  return body;
}

// --------------------------------------------------------------- MENU (server-ui)
function showForm(player, form, onResult, tries) {
  tries = tries || 0;
  form.show(player).then((res) => {
    if (res.canceled && res.cancelationReason === BUSY && tries < 30) {
      system.runTimeout(() => showForm(player, form, onResult, tries + 1), 8);
      return;
    }
    onResult(res);
  }).catch((e) => { log("form error: " + e); });
}

function openMain(player) {
  if (!isAdmin(player)) {
    player.sendMessage("§c[CS] Necesitas el tag §e" + ADMIN_TAG + "§c o ser operador.");
    player.sendMessage("§7Un operador puede ejecutar: §f/tag @s add " + ADMIN_TAG);
    return;
  }
  const cfg = loadConfig();
  const form = new ActionFormData()
    .title("§l§bScoreboard Custom")
    .body(
      "§8§l━━━━━━━━━━━━━━━━━━━\n" +
      "§7Estado §8» " + (cfg.active ? "§aACTIVO" : "§cAPAGADO") + "\n" +
      "§7Plantilla §8» §f" + (cfg.template ? (TEMPLATES[cfg.template]?.label || cfg.template) : "§8ninguna") + "\n" +
      "§7Lineas §8» §f" + cfg.lines.length + "\n" +
      "§8§l━━━━━━━━━━━━━━━━━━━"
    )
    .button(cfg.active ? "§cApagar scoreboard" : "§aEncender scoreboard", "textures/custom_ui/icon_power")
    .button("§bPlantillas", "textures/custom_ui/icon_template")
    .button("§eEditar titulo", "textures/custom_ui/icon_title")
    .button("§dEditar lineas", "textures/custom_ui/icon_lines")
    .button("§aAnadir linea", "textures/custom_ui/icon_add")
    .button("§3Ver info", "textures/custom_ui/icon_info")
    .button("§5Recargar", "textures/custom_ui/icon_reload")
    .button("§cReset total", "textures/custom_ui/icon_reset");
  showForm(player, form, (res) => {
    if (res.canceled) return;
    switch (res.selection) {
      case 0: setActive(!cfg.active); openMain(player); break;
      case 1: openTemplates(player); break;
      case 2: openTitle(player); break;
      case 3: openLines(player); break;
      case 4: openAddLine(player); break;
      case 5: openInfo(player); break;
      case 6: refreshNow(); player.sendMessage("§a[CS] Scoreboard recargado."); openMain(player); break;
      case 7: openReset(player); break;
    }
  });
}

function openTemplates(player) {
  const form = new ActionFormData()
    .title("§l§bPlantillas")
    .body("§7Elige una plantilla profesional:");
  for (const k of TEMPLATE_KEYS) {
    form.button(TEMPLATES[k].label, "textures/custom_ui/" + TEMPLATES[k].icon);
  }
  form.button("§7« Volver");
  showForm(player, form, (res) => {
    if (res.canceled) return;
    if (res.selection === TEMPLATE_KEYS.length) { openMain(player); return; }
    const key = TEMPLATE_KEYS[res.selection];
    applyTemplate(key);
    player.sendMessage("§a[CS] Plantilla §f" + TEMPLATES[key].label + "§a aplicada.");
    openMain(player);
  });
}

function openTitle(player) {
  const cfg = loadConfig();
  const form = new ModalFormData()
    .title("§l§eEditar titulo")
    .textField("§7Texto del titulo §8(usa {fire}, {volcano}... para iconos)", "§l§bMI SERVIDOR", { defaultValue: cfg.title || DEFAULT_TITLE })
    .dropdown("§7Icono extra del titulo", ICON_KEYS.map((k) => ICON_LABELS[k] || k), { defaultValueIndex: Math.max(0, ICON_KEYS.indexOf(cfg.titleIcon)) });
  showForm(player, form, (res) => {
    if (res.canceled) { openMain(player); return; }
    const [text, iconIdx] = res.formValues;
    setTitle(String(text), ICON_KEYS[iconIdx] || "none");
    player.sendMessage("§a[CS] Titulo actualizado.");
    openMain(player);
  });
}

function openLines(player) {
  const cfg = loadConfig();
  const form = new ActionFormData().title("§l§dEditar lineas");
  form.body(cfg.lines.length === 0 ? "§7No hay lineas. Anade una desde el menu." : "§7Selecciona una linea para editarla:");
  cfg.lines.forEach((l, i) => {
    const ic = l.icon && l.icon !== "none" ? "§8[" + (ICON_LABELS[l.icon] || l.icon) + "] " : "";
    form.button("§7#" + (i + 1) + " " + ic + "§r" + (l.text || "§8(vacia)"));
  });
  form.button("§aAnadir linea", "textures/custom_ui/icon_add");
  form.button("§7« Volver");
  showForm(player, form, (res) => {
    if (res.canceled) return;
    if (res.selection === cfg.lines.length) { openAddLine(player); return; }
    if (res.selection === cfg.lines.length + 1) { openMain(player); return; }
    openLineEdit(player, res.selection);
  });
}

function openLineEdit(player, index) {
  const cfg = loadConfig();
  if (!cfg.lines[index]) { openLines(player); return; }
  const l = cfg.lines[index];
  const form = new ModalFormData()
    .title("§l§dLinea #" + (index + 1))
    .textField("§7Texto §8(usa {online}, {day}, {time}, {date})", "§7Kills §8» §f0", { defaultValue: l.text || "" })
    .dropdown("§7Icono", ICON_KEYS.map((k) => ICON_LABELS[k] || k), { defaultValueIndex: Math.max(0, ICON_KEYS.indexOf(l.icon || "none")) })
    .toggle("§cEliminar esta linea", { defaultValue: false });
  showForm(player, form, (res) => {
    if (res.canceled) { openLines(player); return; }
    const [text, iconIdx, del] = res.formValues;
    const c2 = loadConfig();
    if (!c2.lines[index]) { openLines(player); return; }
    if (del) {
      c2.lines.splice(index, 1);
      saveConfig(c2);
      refreshNow();
      player.sendMessage("§c[CS] Linea eliminada.");
      openLines(player);
      return;
    }
    c2.lines[index].text = String(text);
    c2.lines[index].icon = ICON_KEYS[iconIdx] || "none";
    saveConfig(c2);
    refreshNow();
    player.sendMessage("§a[CS] Linea #" + (index + 1) + " actualizada.");
    openLines(player);
  });
}

function openAddLine(player) {
  const form = new ModalFormData()
    .title("§l§aAnadir linea")
    .textField("§7Texto de la linea", "§eMonedas §8» §f0", { defaultValue: "" })
    .dropdown("§7Icono", ICON_KEYS.map((k) => ICON_LABELS[k] || k), { defaultValueIndex: 0 });
  showForm(player, form, (res) => {
    if (res.canceled) { openMain(player); return; }
    const [text, iconIdx] = res.formValues;
    const n = addLine(String(text), ICON_KEYS[iconIdx] || "none");
    player.sendMessage("§a[CS] Linea #" + n + " anadida.");
    openLines(player);
  });
}

function openInfo(player) {
  const cfg = loadConfig();
  const form = new MessageFormData()
    .title("§l§3Info del scoreboard")
    .body(infoText(cfg))
    .button1("§aRecargar")
    .button2("§7Cerrar");
  showForm(player, form, (res) => {
    if (!res.canceled && res.selection === 0) { refreshNow(); openMain(player); }
  });
}

function openReset(player) {
  const form = new MessageFormData()
    .title("§l§cReset total")
    .body("§e¿Seguro que quieres borrar el titulo y todas las lineas?\n§7El scoreboard quedara vacio y apagado.")
    .button1("§cSi, resetear")
    .button2("§7Cancelar");
  showForm(player, form, (res) => {
    if (res.canceled) { openMain(player); return; }
    if (res.selection === 0) {
      resetConfig();
      player.sendMessage("§c[CS] Scoreboard reseteado.");
    }
    openMain(player);
  });
}

// --------------------------------------------------------------- API de comandos /cs:
function getPlayer(origin) {
  try {
    const e = origin && origin.sourceEntity;
    if (e && e.typeId === "minecraft:player") return e;
  } catch (e) {}
  return null;
}
function ok(msg) { return { status: CCStatus.Success, message: msg || "" }; }
function fail(msg) { return { status: CCStatus.Failure, message: msg || "" }; }

function registerCommands(registry) {
  // enums
  try { registry.registerEnum("cs:template", TEMPLATE_KEYS); } catch (e) { log("enum template: " + e); }
  try { registry.registerEnum("cs:icon", ICON_KEYS); } catch (e) { log("enum icon: " + e); }

  const adminCmd = (name, description, opts) => Object.assign({
    name, description, permissionLevel: PERM_ADMIN, cheatsRequired: false
  }, opts || {});

  // /cs:menu  y  /cs:edit  -> abrir editor
  const openCb = (origin) => {
    const p = getPlayer(origin);
    if (!p) return fail("§cSolo un jugador puede abrir el menu.");
    system.run(() => openMain(p));
    return ok("§7Abriendo editor...");
  };
  registry.registerCommand(adminCmd("cs:menu", "Abre el editor del scoreboard"), openCb);
  registry.registerCommand(adminCmd("cs:edit", "Abre el editor del scoreboard"), openCb);

  // /cs:create <template> [title]
  registry.registerCommand(adminCmd("cs:create", "Crea un scoreboard desde una plantilla", {
    mandatoryParameters: [{ name: "cs:template", type: PType.Enum }],
    optionalParameters: [{ name: "title", type: PType.String }]
  }), (origin, template, title) => {
    const p = getPlayer(origin);
    if (!TEMPLATES[template]) return fail("§cPlantilla invalida.");
    system.run(() => {
      applyTemplate(template);
      if (typeof title === "string" && title.length) setTitle(title, undefined);
      if (p) p.sendMessage("§a[CS] Scoreboard creado con plantilla §f" + TEMPLATES[template].label + "§a.");
    });
    return ok("§aScoreboard creado: " + template);
  });

  // /cs:delete  -> apaga y limpia display
  registry.registerCommand(adminCmd("cs:delete", "Apaga y oculta el scoreboard"), (origin) => {
    const p = getPlayer(origin);
    system.run(() => { setActive(false); if (p) p.sendMessage("§e[CS] Scoreboard apagado."); });
    return ok("§eScoreboard apagado.");
  });

  // /cs:toggle
  registry.registerCommand(adminCmd("cs:toggle", "Enciende/apaga el scoreboard"), (origin) => {
    const p = getPlayer(origin);
    system.run(() => {
      const c = loadConfig();
      setActive(!c.active);
      if (p) p.sendMessage("§a[CS] Scoreboard " + (!c.active ? "§aencendido" : "§capagado") + "§a.");
    });
    return ok("§7Cambiando estado...");
  });

  // /cs:reload
  registry.registerCommand(adminCmd("cs:reload", "Recarga/redibuja el scoreboard"), (origin) => {
    const p = getPlayer(origin);
    system.run(() => { refreshNow(); if (p) p.sendMessage("§a[CS] Scoreboard recargado."); });
    return ok("§aRecargado.");
  });

  // /cs:reset
  registry.registerCommand(adminCmd("cs:reset", "Borra titulo y lineas (reset total)"), (origin) => {
    const p = getPlayer(origin);
    system.run(() => { resetConfig(); if (p) p.sendMessage("§c[CS] Scoreboard reseteado."); });
    return ok("§cReseteado.");
  });

  // /cs:info  (cualquiera)
  registry.registerCommand({
    name: "cs:info", description: "Muestra la configuracion del scoreboard",
    permissionLevel: PERM_ANY, cheatsRequired: false
  }, (origin) => {
    const p = getPlayer(origin);
    const cfg = loadConfig();
    if (p) system.run(() => p.sendMessage("§3[CS] Info:\n" + infoText(cfg)));
    return ok("§3Lineas: " + cfg.lines.length + " | " + (cfg.active ? "ACTIVO" : "APAGADO"));
  });

  // /cs:title <text>
  registry.registerCommand(adminCmd("cs:title", "Cambia el titulo del scoreboard", {
    mandatoryParameters: [{ name: "text", type: PType.String }]
  }), (origin, text) => {
    const p = getPlayer(origin);
    system.run(() => { setTitle(String(text), undefined); if (p) p.sendMessage("§a[CS] Titulo actualizado."); });
    return ok("§aTitulo cambiado.");
  });

  // /cs:set <line> <text>
  registry.registerCommand(adminCmd("cs:set", "Define el texto de una linea (1 = arriba)", {
    mandatoryParameters: [{ name: "line", type: PType.Integer }, { name: "text", type: PType.String }]
  }), (origin, line, text) => {
    const p = getPlayer(origin);
    const n = clampLineIdx(null, line);
    if (n < 1) return fail("§cLa linea debe ser 1 o mayor.");
    system.run(() => { setLine(n, String(text)); if (p) p.sendMessage("§a[CS] Linea " + n + " definida."); });
    return ok("§aLinea " + n + " definida.");
  });

  // /cs:image <line> <icon>
  registry.registerCommand(adminCmd("cs:image", "Pone un icono/imagen a una linea", {
    mandatoryParameters: [{ name: "line", type: PType.Integer }, { name: "cs:icon", type: PType.Enum }]
  }), (origin, line, icon) => {
    const p = getPlayer(origin);
    const n = clampLineIdx(null, line);
    system.run(() => {
      const okk = setImage(n, icon);
      if (p) p.sendMessage(okk ? "§a[CS] Icono §f" + (ICON_LABELS[icon] || icon) + "§a en linea " + n + "." : "§cEsa linea no existe.");
    });
    return ok("§aIcono asignado.");
  });

  // /cs:addline <text> [icon]
  registry.registerCommand(adminCmd("cs:addline", "Anade una linea al final", {
    mandatoryParameters: [{ name: "text", type: PType.String }],
    optionalParameters: [{ name: "cs:icon", type: PType.Enum }]
  }), (origin, text, icon) => {
    const p = getPlayer(origin);
    system.run(() => {
      const n = addLine(String(text), icon || "none");
      if (p) p.sendMessage("§a[CS] Linea " + n + " anadida.");
    });
    return ok("§aLinea anadida.");
  });

  // /cs:removeline <line>
  registry.registerCommand(adminCmd("cs:removeline", "Elimina una linea", {
    mandatoryParameters: [{ name: "line", type: PType.Integer }]
  }), (origin, line) => {
    const p = getPlayer(origin);
    const n = clampLineIdx(null, line);
    system.run(() => {
      const okk = removeLine(n);
      if (p) p.sendMessage(okk ? "§e[CS] Linea " + n + " eliminada." : "§cEsa linea no existe.");
    });
    return ok("§eLinea eliminada.");
  });

  log("Comandos /cs: registrados.");
}

// --------------------------------------------------------------- chat fallback (cs: sin barra)
function handleChat(ev) {
  const msg = (ev.message || "").trim();
  if (!/^cs:/i.test(msg)) return;
  ev.cancel = true;
  const player = ev.sender;
  const parts = msg.slice(3).trim().split(/\s+/);
  const sub = (parts.shift() || "").toLowerCase();
  const rest = parts.join(" ");
  system.run(() => {
    if (!isAdmin(player) && sub !== "info") {
      player.sendMessage("§c[CS] Necesitas el tag §e" + ADMIN_TAG + "§c o ser operador.");
      return;
    }
    switch (sub) {
      case "menu": case "edit": openMain(player); break;
      case "create": {
        const k = (parts[0] || "").toLowerCase();
        if (!TEMPLATES[k]) { player.sendMessage("§cPlantillas: §f" + TEMPLATE_KEYS.join(", ")); break; }
        applyTemplate(k);
        player.sendMessage("§a[CS] Plantilla §f" + TEMPLATES[k].label + "§a aplicada.");
        break;
      }
      case "delete": setActive(false); player.sendMessage("§e[CS] Apagado."); break;
      case "toggle": { const c = loadConfig(); setActive(!c.active); player.sendMessage("§a[CS] Estado cambiado."); break; }
      case "reload": refreshNow(); player.sendMessage("§a[CS] Recargado."); break;
      case "reset": resetConfig(); player.sendMessage("§c[CS] Reseteado."); break;
      case "title": setTitle(rest, undefined); player.sendMessage("§a[CS] Titulo actualizado."); break;
      case "info": player.sendMessage("§3[CS] Info:\n" + infoText(loadConfig())); break;
      case "set": {
        const n = parseInt(parts.shift(), 10);
        if (!n || n < 1) { player.sendMessage("§cUso: cs:set <linea> <texto>"); break; }
        setLine(n, parts.join(" "));
        player.sendMessage("§a[CS] Linea " + n + " definida.");
        break;
      }
      case "image": {
        const n = parseInt(parts.shift(), 10);
        const ic = (parts.shift() || "none").toLowerCase();
        player.sendMessage(setImage(n, ic) ? "§a[CS] Icono asignado." : "§cUso: cs:image <linea> <icono>");
        break;
      }
      case "addline": addLine(rest, "none"); player.sendMessage("§a[CS] Linea anadida."); break;
      case "removeline": {
        const n = parseInt(parts.shift(), 10);
        player.sendMessage(removeLine(n) ? "§e[CS] Linea eliminada." : "§cUso: cs:removeline <linea>");
        break;
      }
      default:
        player.sendMessage("§7[CS] Subcomandos: §fcreate, edit, delete, info, reload, reset, set, image, title, addline, removeline, toggle, menu");
    }
  });
}

// --------------------------------------------------------------- arranque
system.beforeEvents.startup.subscribe((init) => {
  try {
    if (init && init.customCommandRegistry) registerCommands(init.customCommandRegistry);
  } catch (e) {
    log("No se pudieron registrar comandos custom: " + e);
  }
});

world.afterEvents.worldLoad?.subscribe?.(() => {
  system.run(() => { refreshNow(); log("Cargado v0.1.0"); });
});

// compat: si worldLoad no existe en esta version, renderiza igualmente
system.run(() => { try { render(); } catch (e) {} });

// loop de refresco (placeholders dinamicos: {online} {time} {day}...)
system.runInterval(() => { try { render(); } catch (e) {} }, 20);

// abrir menu con brujula (admins)
world.afterEvents.itemUse?.subscribe?.((ev) => {
  try {
    if (ev.itemStack && ev.itemStack.typeId === "minecraft:compass" && isAdmin(ev.source)) {
      system.run(() => openMain(ev.source));
    }
  } catch (e) {}
});

// chat fallback
world.beforeEvents.chatSend?.subscribe?.(handleChat);
