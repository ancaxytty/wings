// ============================================================================
//  Hologram Studio  v6.3.0
//  Hologramas de texto e items con menu, 100% Script API (MC 1.21.50+ / 2.x).
//  Codigo y assets originales.
// ============================================================================
import * as mc from "@minecraft/server";
import * as ui from "@minecraft/server-ui";

const { world, system, ItemStack } = mc;
const ActionFormData = ui.ActionFormData;
const ModalFormData = ui.ModalFormData;

const ENT = "holo:text";
const WAND = "holo:wand";
const PREFIX = "§l§b[Holo]§r ";

const COLORS = [
  { name: "§fBlanco", code: "§f" }, { name: "§eAmarillo", code: "§e" },
  { name: "§6Dorado", code: "§6" }, { name: "§aVerde", code: "§a" },
  { name: "§2Verde oscuro", code: "§2" }, { name: "§bCian", code: "§b" },
  { name: "§3Cian oscuro", code: "§3" }, { name: "§9Azul", code: "§9" },
  { name: "§dRosa", code: "§d" }, { name: "§5Morado", code: "§5" },
  { name: "§cRojo", code: "§c" }, { name: "§4Rojo oscuro", code: "§4" },
  { name: "§7Gris", code: "§7" }, { name: "§0Negro", code: "§0" },
];

const PARTICLES = [
  { name: "Ninguna", id: null }, { name: "Arcoiris", id: "ft:rainbow" },
  { name: "Fuego", id: "ft:fire" }, { name: "Hielo", id: "ft:ice" },
  { name: "Oro", id: "ft:gold" }, { name: "Amor", id: "ft:love" },
  { name: "Ender", id: "ft:ender" }, { name: "Toxico", id: "ft:toxic" },
  { name: "Galaxia", id: "ft:galaxy" }, { name: "Esmeralda", id: "ft:emerald" },
  { name: "Oceano", id: "ft:ocean" }, { name: "Lava", id: "ft:lava" },
  { name: "Nieve", id: "ft:snow" },
];
const PARTICLE_NAMES = PARTICLES.map((p) => p.name);

const ITEM_OPTIONS = [
  { name: "Diamante", id: "minecraft:diamond" }, { name: "Lingote de oro", id: "minecraft:gold_ingot" },
  { name: "Lingote de hierro", id: "minecraft:iron_ingot" }, { name: "Esmeralda", id: "minecraft:emerald" },
  { name: "Netherita", id: "minecraft:netherite_ingot" }, { name: "Espada de diamante", id: "minecraft:diamond_sword" },
  { name: "Espada de netherita", id: "minecraft:netherite_sword" }, { name: "Pico de diamante", id: "minecraft:diamond_pickaxe" },
  { name: "Peto de diamante", id: "minecraft:diamond_chestplate" }, { name: "Arco", id: "minecraft:bow" },
  { name: "Manzana dorada", id: "minecraft:golden_apple" }, { name: "Totem", id: "minecraft:totem_of_undying" },
  { name: "Bloque de diamante", id: "minecraft:diamond_block" }, { name: "Bloque de oro", id: "minecraft:gold_block" },
  { name: "Bloque de esmeralda", id: "minecraft:emerald_block" }, { name: "Faro", id: "minecraft:beacon" },
  { name: "Cofre", id: "minecraft:chest" }, { name: "Estrella del Nether", id: "minecraft:nether_star" },
  { name: "Cabeza de creeper", id: "minecraft:creeper_head" }, { name: "Cohete", id: "minecraft:firework_rocket" },
];
const ITEM_NAMES = ITEM_OPTIONS.map((i) => i.name);

const DIM_IDS = ["minecraft:overworld", "minecraft:nether", "minecraft:the_end"];
function dims() {
  const out = [];
  for (const d of DIM_IDS) { try { out.push(world.getDimension(d)); } catch (_) {} }
  return out;
}

function stripColors(s) { return (s || "").replace(/§./g, ""); }
function buildNameTag(text, colorIdx) {
  const code = COLORS[colorIdx]?.code ?? "§f";
  const t = (text || "").replace(/\\n/g, "\n").replace(/\|/g, "\n");
  return t.split("\n").map((l) => code + l).join("\n");
}
function front(player, dist) {
  const h = player.getHeadLocation();
  const d = player.getViewDirection();
  return { x: h.x + d.x * dist, y: h.y + d.y * dist, z: h.z + d.z * dist };
}

// ---- Mostrar formulario con reintento ante UserBusy -------------------------
function wait(ticks) { return new Promise((r) => system.runTimeout(r, ticks)); }
async function showForm(form, player) {
  for (let i = 0; i < 30; i++) {
    let res;
    try { res = await form.show(player); }
    catch (e) { return { canceled: true }; }
    if (res && res.canceled && String(res.cancelationReason || "").includes("Busy")) {
      await wait(8);
      continue;
    }
    return res;
  }
  return { canceled: true };
}

function getTextHolos() {
  const out = [];
  for (const dim of dims()) {
    let ents;
    try { ents = dim.getEntities({ type: ENT }); } catch (e) { continue; }
    for (const e of ents) { try { if (e.getDynamicProperty("ft")) out.push(e); } catch (_) {} }
  }
  return out;
}
function lookingHolo(player) {
  let hits;
  try { hits = player.getEntitiesFromViewDirection({ maxDistance: 16 }); } catch (e) { return undefined; }
  for (const h of hits) {
    const e = h.entity;
    if (e && e.typeId === ENT) { try { if (e.getDynamicProperty("ft")) return e; } catch (_) {} }
  }
  return undefined;
}
function getItemReg() {
  try { const raw = world.getDynamicProperty("holo_items"); return raw ? JSON.parse(raw) : []; }
  catch (e) { return []; }
}
function setItemReg(arr) { try { world.setDynamicProperty("holo_items", JSON.stringify(arr)); } catch (e) {} }

// ============================================================================
//  TICK LOOP
// ============================================================================
let tick = 0;
function tickLoop() {
  tick++;
  for (const e of getTextHolos()) {
    let p = 0, s = 0, b = false, base = null;
    try {
      p = e.getDynamicProperty("p") ?? 0;
      s = e.getDynamicProperty("s") ?? 0;
      b = e.getDynamicProperty("b") ?? false;
      const bs = e.getDynamicProperty("base");
      base = bs ? String(bs).split(",").map(Number) : [e.location.x, e.location.y, e.location.z];
    } catch (_) { continue; }
    let y = base[1];
    if (b) {
      y = base[1] + Math.sin(tick * 0.12) * 0.22;
      try { e.teleport({ x: base[0], y, z: base[2] }); } catch (_) {}
    }
    if (p > 0 && tick % 4 === 0) {
      let loc;
      if (s === 0) { loc = { x: base[0], y: y + 1.05, z: base[2] }; }
      else {
        const factor = s === 5 ? 4 : s;
        const dir = s === 5 ? -1 : 1;
        const ang = tick * 0.10 * factor * dir;
        loc = { x: base[0] + Math.cos(ang) * 0.55, y: y + 1.05, z: base[2] + Math.sin(ang) * 0.55 };
      }
      const pid = PARTICLES[p]?.id;
      if (pid) { try { e.dimension.spawnParticle(pid, loc); } catch (_) {} }
    }
  }
  if (tick % 4 === 0) {
    const reg = getItemReg();
    for (const it of reg) {
      let dim; try { dim = world.getDimension(it.dim); } catch (e) { continue; }
      let found;
      try {
        const ents = dim.getEntities({ type: "minecraft:item", location: { x: it.x, y: it.y, z: it.z }, maxDistance: 5 });
        for (const e of ents) { if (e.getDynamicProperty("fti") === it.uid) { found = e; break; } }
      } catch (e) { continue; }
      if (found) { try { found.clearVelocity(); found.teleport({ x: it.x, y: it.y, z: it.z }); } catch (_) {} }
      else {
        try { const e2 = dim.spawnItem(new ItemStack(it.item, 1), { x: it.x, y: it.y, z: it.z }); e2.setDynamicProperty("fti", it.uid); e2.clearVelocity(); } catch (_) {}
      }
    }
  }
}

// ============================================================================
//  MENUS  (async + showForm con reintento)
// ============================================================================
async function openMain(player) {
  if (!ActionFormData) { player.sendMessage(PREFIX + "§cUI no disponible en esta version."); return; }
  const f = new ActionFormData()
    .title("§l§bHologram §3Studio")
    .body("§7Crea y administra hologramas de texto e items.")
    .button("§a+ Crear Texto", "textures/items/holo_wand")
    .button("§e+ Crear Item Flotante")
    .button("§b/ Editar Texto §7(mira el holo)")
    .button("§c- Borrar Texto §7(mira el holo)")
    .button("§f# Lista / Teleport")
    .button("§4!! Borrar TODO")
    .button("§7? Ayuda");
  const r = await showForm(f, player);
  if (r.canceled) return;
  switch (r.selection) {
    case 0: return createTextForm(player);
    case 1: return createItemForm(player);
    case 2: return editTextForm(player);
    case 3: return deleteLooking(player);
    case 4: return listForm(player);
    case 5: return deleteAll(player);
    case 6: return helpForm(player);
  }
}

async function createTextForm(player) {
  const f = new ModalFormData().title("§l§aCrear Texto Flotante")
    .textField("Texto §7(usa | o \\n para varias lineas)", "Hola mundo")
    .dropdown("Color base", COLORS.map((c) => c.name))
    .dropdown("Particula", PARTICLE_NAMES)
    .slider("Velocidad orbita §7(0=quieto, 5=reversa)", 0, 5, { valueStep: 1, defaultValue: 0 })
    .toggle("Animacion flotar");
  const r = await showForm(f, player);
  if (r.canceled) return;
  const [text, colorIdx, partIdx, speed, bob] = r.formValues;
  if (!text || !String(text).trim()) { player.sendMessage(PREFIX + "§cEscribe algun texto."); return; }
  const loc = front(player, 3);
  let e; try { e = player.dimension.spawnEntity(ENT, loc); }
  catch (err) { player.sendMessage(PREFIX + "§cNo se pudo crear aqui."); return; }
  e.nameTag = buildNameTag(text, colorIdx);
  e.setDynamicProperty("ft", true);
  e.setDynamicProperty("p", partIdx);
  e.setDynamicProperty("s", speed);
  e.setDynamicProperty("b", bob);
  e.setDynamicProperty("color", colorIdx);
  e.setDynamicProperty("base", `${loc.x},${loc.y},${loc.z}`);
  player.sendMessage(PREFIX + "§aTexto creado.");
}

async function editTextForm(player) {
  const e = lookingHolo(player);
  if (!e) { player.sendMessage(PREFIX + "§cMira directamente un holograma de texto."); return; }
  const curText = stripColors(e.nameTag).replace(/\n/g, "|");
  const curColor = e.getDynamicProperty("color") ?? 0;
  const curPart = e.getDynamicProperty("p") ?? 0;
  const curSpeed = e.getDynamicProperty("s") ?? 0;
  const curBob = e.getDynamicProperty("b") ?? false;
  const f = new ModalFormData().title("§l§bEditar Texto")
    .textField("Texto §7(| o \\n = lineas)", "texto", { defaultValue: curText })
    .dropdown("Color base", COLORS.map((c) => c.name), { defaultValueIndex: curColor })
    .dropdown("Particula", PARTICLE_NAMES, { defaultValueIndex: curPart })
    .slider("Velocidad orbita", 0, 5, { valueStep: 1, defaultValue: curSpeed })
    .toggle("Animacion flotar", { defaultValue: !!curBob });
  const r = await showForm(f, player);
  if (r.canceled) return;
  const [text, colorIdx, partIdx, speed, bob] = r.formValues;
  e.nameTag = buildNameTag(text, colorIdx);
  e.setDynamicProperty("color", colorIdx);
  e.setDynamicProperty("p", partIdx);
  e.setDynamicProperty("s", speed);
  e.setDynamicProperty("b", bob);
  if (!bob) { try { const bs = e.getDynamicProperty("base"); if (bs) { const a = String(bs).split(",").map(Number); e.teleport({ x: a[0], y: a[1], z: a[2] }); } } catch (_) {} }
  player.sendMessage(PREFIX + "§aTexto actualizado.");
}

async function createItemForm(player) {
  const f = new ModalFormData().title("§l§eCrear Item Flotante")
    .dropdown("Item", ITEM_NAMES)
    .textField("ID personalizado §7(opcional, ej: minecraft:tnt)", "")
    .textField("Etiqueta de texto §7(opcional)", "");
  const r = await showForm(f, player);
  if (r.canceled) return;
  const [itemIdx, customId, label] = r.formValues;
  const itemId = (customId && String(customId).trim()) ? String(customId).trim() : ITEM_OPTIONS[itemIdx].id;
  const loc = front(player, 3);
  let stack; try { stack = new ItemStack(itemId, 1); } catch (e) { player.sendMessage(PREFIX + "§cID invalido: §f" + itemId); return; }
  let ent; try { ent = player.dimension.spawnItem(stack, loc); } catch (e) { player.sendMessage(PREFIX + "§cNo se pudo crear el item."); return; }
  const uid = "i" + Date.now() + "_" + Math.floor(Math.random() * 9999);
  try { ent.setDynamicProperty("fti", uid); ent.clearVelocity(); } catch (_) {}
  const reg = getItemReg();
  reg.push({ uid, item: itemId, x: loc.x, y: loc.y, z: loc.z, dim: player.dimension.id, label: label || "" });
  setItemReg(reg);
  if (label && String(label).trim()) {
    try {
      const tl = { x: loc.x, y: loc.y + 0.9, z: loc.z };
      const te = player.dimension.spawnEntity(ENT, tl);
      te.nameTag = "§f" + String(label).trim();
      te.setDynamicProperty("ft", true); te.setDynamicProperty("p", 0);
      te.setDynamicProperty("s", 0); te.setDynamicProperty("b", false);
      te.setDynamicProperty("base", `${tl.x},${tl.y},${tl.z}`);
    } catch (_) {}
  }
  player.sendMessage(PREFIX + "§aItem flotante creado: §f" + itemId);
}

function deleteLooking(player) {
  const e = lookingHolo(player);
  if (!e) { player.sendMessage(PREFIX + "§cMira directamente un holograma."); return; }
  try { e.remove(); player.sendMessage(PREFIX + "§aHolograma borrado."); } catch (err) { player.sendMessage(PREFIX + "§cNo se pudo borrar."); }
}

async function listForm(player) {
  const holos = getTextHolos();
  if (holos.length === 0) { player.sendMessage(PREFIX + "§7No hay hologramas de texto."); return; }
  const f = new ActionFormData().title("§l§fHologramas").body("§7Selecciona para teletransportarte.");
  for (const e of holos) {
    const label = (stripColors(e.nameTag).split("\n")[0] || "(vacio)").slice(0, 24);
    const l = e.location;
    f.button(`§e${label}\n§7${Math.round(l.x)}, ${Math.round(l.y)}, ${Math.round(l.z)}`);
  }
  const r = await showForm(f, player);
  if (r.canceled) return;
  const e = holos[r.selection]; if (!e) return;
  try { player.teleport(e.location, { dimension: e.dimension }); player.sendMessage(PREFIX + "§aTeletransportado."); } catch (err) {}
}

async function deleteAll(player) {
  const f = new ActionFormData().title("§l§4Borrar TODO")
    .body("§cBorra TODOS los hologramas de texto y los items flotantes. ¿Seguro?")
    .button("§cSi, borrar todo").button("§aCancelar");
  const r = await showForm(f, player);
  if (r.canceled || r.selection !== 0) return;
  let n = 0;
  for (const e of getTextHolos()) { try { e.remove(); n++; } catch (_) {} }
  for (const it of getItemReg()) {
    try {
      const dim = world.getDimension(it.dim);
      const ents = dim.getEntities({ type: "minecraft:item", location: { x: it.x, y: it.y, z: it.z }, maxDistance: 6 });
      for (const e of ents) { if (e.getDynamicProperty("fti") === it.uid) { e.remove(); n++; } }
    } catch (_) {}
  }
  setItemReg([]);
  player.sendMessage(PREFIX + "§aBorrados §f" + n + "§a.");
}

function helpForm(player) {
  const f = new ActionFormData().title("§l§7Ayuda - Hologram Studio")
    .body(
      "§bHologram Studio§r\n\n" +
      "§e- Abrir menu: §fusa la §bVarita §fo el comando §a/holo:menu§f.\n" +
      "§e- §fConseguir varita: §a/holo:wand§f.\n" +
      "§e- Crear Texto: §fescribe (usa §7|§f o §7\\n§f para varias lineas), color, particula, velocidad y flotar.\n" +
      "§e- Editar/Borrar: §fmira el holograma y abre el menu.\n" +
      "§e- Items flotantes: §fflotan, giran y se reponen solos.\n" +
      "§e- Velocidad: §f0=quieto, 1-4=orbita, 5=reversa."
    )
    .button("§aOK");
  showForm(f, player);
}

function giveWand(player) {
  try {
    const inv = player.getComponent("minecraft:inventory");
    inv.container.addItem(new ItemStack(WAND, 1));
    player.sendMessage(PREFIX + "§aRecibiste la §bVarita de Hologramas§a.");
  } catch (e) { player.sendMessage(PREFIX + "§cNo se pudo dar la varita (usa el comando /holo:wand)."); }
}

function ensureWelcome(p) {
  try {
    if (!p.getDynamicProperty("holo_got")) { p.setDynamicProperty("holo_got", true); giveWand(p); }
  } catch (_) {}
  try { p.sendMessage(PREFIX + "§aListo. §fUsa la §bVarita §fo el comando §a/holo:menu§f."); } catch (_) {}
}

// ============================================================================
//  REGISTRO DE EVENTOS (cada uno protegido)
// ============================================================================
function safe(label, fn) { try { fn(); } catch (e) { try { console.warn("[Holo] no se pudo registrar " + label + ": " + e); } catch (_) {} } }

// 1) Bucle principal
safe("tick", () => system.runInterval(tickLoop, 1));

// 2) Item -> menu
safe("itemUse", () => world.afterEvents.itemUse.subscribe((ev) => {
  if (ev.itemStack && ev.itemStack.typeId === WAND) openMain(ev.source);
}));

// 3) Comandos de chat (solo si la version aun soporta chatSend)
safe("chatSend", () => {
  if (world.beforeEvents && world.beforeEvents.chatSend) {
    world.beforeEvents.chatSend.subscribe((ev) => {
      const m = ev.message.trim().toLowerCase();
      if (m === "!holo" || m === "!ft" || m === "!menu") { ev.cancel = true; system.run(() => openMain(ev.sender)); }
      else if (m === "!varita" || m === "!wand") { ev.cancel = true; system.run(() => giveWand(ev.sender)); }
    });
  }
});

// 4) Comandos oficiales /holo:menu y /holo:wand
safe("customCommands", () => {
  system.beforeEvents.startup.subscribe((init) => {
    const reg = init.customCommandRegistry;
    if (!reg) return;
    const ANY = mc.CommandPermissionLevel ? mc.CommandPermissionLevel.Any : 0;
    const OK = mc.CustomCommandStatus ? mc.CustomCommandStatus.Success : 0;
    reg.registerCommand({ name: "holo:menu", description: "Abrir el menu de Hologramas", permissionLevel: ANY }, (origin) => {
      const e = origin.sourceEntity; if (e) system.run(() => openMain(e)); return { status: OK };
    });
    reg.registerCommand({ name: "holo:wand", description: "Recibir la varita de hologramas", permissionLevel: ANY }, (origin) => {
      const e = origin.sourceEntity; if (e) system.run(() => giveWand(e)); return { status: OK };
    });
  });
});

// 5) Bienvenida / varita al entrar
safe("playerSpawn", () => world.afterEvents.playerSpawn.subscribe((ev) => { if (ev.initialSpawn) ensureWelcome(ev.player); }));

// 6) Confirmacion visible de carga (cubre jugadores ya presentes)
safe("startupMsg", () => system.runTimeout(() => {
  try { for (const p of world.getAllPlayers()) ensureWelcome(p); } catch (_) {}
}, 40));

try { console.warn("[Hologram Studio] cargado v6.3.0 (API 2.x)"); } catch (_) {}
