// ============================================================================
//  Floating Text Ultimate v6.0.0  —  Scripts edition
//  Fusiona los 3 add-ons (semplice + item + update) en uno solo, 100% por script.
//  Base/concepto: add-on original de Death_Aruban (creditos preservados).
// ============================================================================
import { world, system, ItemStack } from "@minecraft/server";
import { ActionFormData, ModalFormData } from "@minecraft/server-ui";

const ENT = "da:floating_text";
const WAND = "ft:wand";
const PREFIX = "§l§7[§bFT§7]§r ";

// ---- Colores base seleccionables --------------------------------------------
const COLORS = [
  { name: "§fBlanco / White", code: "§f" },
  { name: "§eAmarillo / Yellow", code: "§e" },
  { name: "§6Dorado / Gold", code: "§6" },
  { name: "§aVerde / Green", code: "§a" },
  { name: "§2Verde oscuro", code: "§2" },
  { name: "§bCian / Aqua", code: "§b" },
  { name: "§3Cian oscuro", code: "§3" },
  { name: "§9Azul / Blue", code: "§9" },
  { name: "§dRosa / Pink", code: "§d" },
  { name: "§5Morado / Purple", code: "§5" },
  { name: "§cRojo / Red", code: "§c" },
  { name: "§4Rojo oscuro", code: "§4" },
  { name: "§7Gris / Gray", code: "§7" },
  { name: "§0Negro / Black", code: "§0" },
];

// ---- Particulas (indice -> efecto). 0 = ninguna -----------------------------
const PARTICLES = [
  { name: "Ninguna / None", id: null },
  { name: "Arcoiris", id: "ft:rainbow" },
  { name: "Fuego", id: "ft:fire" },
  { name: "Hielo", id: "ft:ice" },
  { name: "Oro", id: "ft:gold" },
  { name: "Amor", id: "ft:love" },
  { name: "Ender", id: "ft:ender" },
  { name: "Toxico", id: "ft:toxic" },
  { name: "Galaxia", id: "ft:galaxy" },
  { name: "Esmeralda", id: "ft:emerald" },
  { name: "Oceano", id: "ft:ocean" },
  { name: "Lava", id: "ft:lava" },
  { name: "Nieve", id: "ft:snow" },
];
const PARTICLE_NAMES = PARTICLES.map((p) => p.name);

// ---- Items comunes para hologramas de item ----------------------------------
const ITEM_OPTIONS = [
  { name: "Diamante", id: "minecraft:diamond" },
  { name: "Lingote de oro", id: "minecraft:gold_ingot" },
  { name: "Lingote de hierro", id: "minecraft:iron_ingot" },
  { name: "Esmeralda", id: "minecraft:emerald" },
  { name: "Netherita", id: "minecraft:netherite_ingot" },
  { name: "Espada de diamante", id: "minecraft:diamond_sword" },
  { name: "Espada de netherita", id: "minecraft:netherite_sword" },
  { name: "Pico de diamante", id: "minecraft:diamond_pickaxe" },
  { name: "Peto de diamante", id: "minecraft:diamond_chestplate" },
  { name: "Arco", id: "minecraft:bow" },
  { name: "Manzana dorada", id: "minecraft:golden_apple" },
  { name: "Totem", id: "minecraft:totem_of_undying" },
  { name: "Cabeza de creeper", id: "minecraft:creeper_head" },
  { name: "Bloque de diamante", id: "minecraft:diamond_block" },
  { name: "Bloque de oro", id: "minecraft:gold_block" },
  { name: "Bloque de esmeralda", id: "minecraft:emerald_block" },
  { name: "Faro / Beacon", id: "minecraft:beacon" },
  { name: "Cofre", id: "minecraft:chest" },
  { name: "Estrella del Nether", id: "minecraft:nether_star" },
  { name: "Cohete", id: "minecraft:firework_rocket" },
];
const ITEM_NAMES = ITEM_OPTIONS.map((i) => i.name);

const DIM_IDS = ["minecraft:overworld", "minecraft:nether", "minecraft:the_end"];
function dims() {
  return DIM_IDS.map((d) => {
    try { return world.getDimension(d); } catch (e) { return null; }
  }).filter(Boolean);
}

// ---- Helpers de texto -------------------------------------------------------
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

// ---- Acceso a hologramas de TEXTO ------------------------------------------
function getTextHolos() {
  const out = [];
  for (const dim of dims()) {
    let ents;
    try { ents = dim.getEntities({ type: ENT }); } catch (e) { continue; }
    for (const e of ents) {
      try { if (e.getDynamicProperty("ft")) out.push(e); } catch (_) {}
    }
  }
  return out;
}

function lookingHolo(player) {
  let hits;
  try { hits = player.getEntitiesFromViewDirection({ maxDistance: 16 }); } catch (e) { return undefined; }
  for (const h of hits) {
    const e = h.entity;
    if (e && e.typeId === ENT) {
      try { if (e.getDynamicProperty("ft")) return e; } catch (_) {}
    }
  }
  return undefined;
}

// ---- Registro persistente de ITEMS flotantes (world DP) ---------------------
function getItemReg() {
  try {
    const raw = world.getDynamicProperty("ft_items");
    return raw ? JSON.parse(raw) : [];
  } catch (e) { return []; }
}
function setItemReg(arr) {
  try { world.setDynamicProperty("ft_items", JSON.stringify(arr)); } catch (e) {}
}

// ============================================================================
//  TICK LOOP
// ============================================================================
let tick = 0;
system.runInterval(() => {
  tick++;

  // ---- Texto: flotar + particulas ----
  const holos = getTextHolos();
  for (const e of holos) {
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
      try { e.teleport({ x: base[0], y: y, z: base[2] }); } catch (_) {}
    }

    if (p > 0 && tick % 4 === 0) {
      let loc;
      if (s === 0) {
        loc = { x: base[0], y: y + 1.05, z: base[2] };
      } else {
        const factor = s === 5 ? 4 : s;
        const dir = s === 5 ? -1 : 1;
        const ang = tick * 0.10 * factor * dir;
        const r = 0.55;
        loc = { x: base[0] + Math.cos(ang) * r, y: y + 1.05, z: base[2] + Math.sin(ang) * r };
      }
      const pid = PARTICLES[p]?.id;
      if (pid) { try { e.dimension.spawnParticle(pid, loc); } catch (_) {} }
    }
  }

  // ---- Items flotantes: congelar + reponer (cada 4 ticks) ----
  if (tick % 4 === 0) {
    const reg = getItemReg();
    for (const it of reg) {
      let dim;
      try { dim = world.getDimension(it.dim); } catch (e) { continue; }
      let found;
      try {
        const ents = dim.getEntities({ type: "minecraft:item", location: { x: it.x, y: it.y, z: it.z }, maxDistance: 5 });
        for (const e of ents) {
          if (e.getDynamicProperty("fti") === it.uid) { found = e; break; }
        }
      } catch (e) { continue; }
      if (found) {
        try { found.clearVelocity(); found.teleport({ x: it.x, y: it.y, z: it.z }); } catch (_) {}
      } else {
        try {
          const st = new ItemStack(it.item, 1);
          const e2 = dim.spawnItem(st, { x: it.x, y: it.y, z: it.z });
          e2.setDynamicProperty("fti", it.uid);
          e2.clearVelocity();
        } catch (_) {}
      }
    }
  }
}, 1);

// ============================================================================
//  MENUS
// ============================================================================
function openMain(player) {
  const f = new ActionFormData()
    .title("§l§bFloating §eText §6Ultimate")
    .body("§7Crea y administra hologramas de texto e items.")
    .button("§a➕ Crear Texto", "textures/items/ft_wand")
    .button("§e📦 Crear Item Flotante")
    .button("§b✏️ Editar Texto §7(mira el holo)")
    .button("§c🗑️ Borrar Texto §7(mira el holo)")
    .button("§f📜 Lista / Teletransporte")
    .button("§4🧹 Borrar TODO")
    .button("§7❓ Ayuda");
  f.show(player).then((r) => {
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
  }).catch(() => {});
}

function createTextForm(player) {
  const f = new ModalFormData()
    .title("§l§aCrear Texto Flotante")
    .textField("Texto §7(usa | o \\n para varias lineas)", "Hola mundo")
    .dropdown("Color base", COLORS.map((c) => c.name), 0)
    .dropdown("Particula", PARTICLE_NAMES, 0)
    .slider("Velocidad orbita §7(0=quieto, 5=reversa)", 0, 5, 1, 0)
    .toggle("Animacion flotar ↑↓", false);
  f.show(player).then((r) => {
    if (r.canceled) return;
    const [text, colorIdx, partIdx, speed, bob] = r.formValues;
    if (!text || !String(text).trim()) { player.sendMessage(PREFIX + "§cEscribe algun texto."); return; }
    const loc = front(player, 3);
    let e;
    try { e = player.dimension.spawnEntity(ENT, loc); }
    catch (err) { player.sendMessage(PREFIX + "§cNo se pudo crear aqui."); return; }
    e.nameTag = buildNameTag(text, colorIdx);
    e.setDynamicProperty("ft", true);
    e.setDynamicProperty("p", partIdx);
    e.setDynamicProperty("s", speed);
    e.setDynamicProperty("b", bob);
    e.setDynamicProperty("color", colorIdx);
    e.setDynamicProperty("base", `${loc.x},${loc.y},${loc.z}`);
    e.setDynamicProperty("owner", player.name);
    player.sendMessage(PREFIX + "§aTexto creado. §7(" + PARTICLES[partIdx].name + ", vel " + speed + (bob ? ", flotar" : "") + ")");
  }).catch(() => {});
}

function editTextForm(player) {
  const e = lookingHolo(player);
  if (!e) { player.sendMessage(PREFIX + "§cMira directamente un holograma de texto y vuelve a abrir."); return; }
  const curText = stripColors(e.nameTag).replace(/\n/g, "|");
  const curColor = e.getDynamicProperty("color") ?? 0;
  const curPart = e.getDynamicProperty("p") ?? 0;
  const curSpeed = e.getDynamicProperty("s") ?? 0;
  const curBob = e.getDynamicProperty("b") ?? false;
  const f = new ModalFormData()
    .title("§l§bEditar Texto")
    .textField("Texto §7(| o \\n = lineas)", "texto", curText)
    .dropdown("Color base", COLORS.map((c) => c.name), curColor)
    .dropdown("Particula", PARTICLE_NAMES, curPart)
    .slider("Velocidad orbita", 0, 5, 1, curSpeed)
    .toggle("Animacion flotar ↑↓", !!curBob);
  f.show(player).then((r) => {
    if (r.canceled) return;
    const [text, colorIdx, partIdx, speed, bob] = r.formValues;
    e.nameTag = buildNameTag(text, colorIdx);
    e.setDynamicProperty("color", colorIdx);
    e.setDynamicProperty("p", partIdx);
    e.setDynamicProperty("s", speed);
    e.setDynamicProperty("b", bob);
    if (!bob) {
      // al apagar flotar, deja el holo en su base
      try {
        const bs = e.getDynamicProperty("base");
        if (bs) { const a = String(bs).split(",").map(Number); e.teleport({ x: a[0], y: a[1], z: a[2] }); }
      } catch (_) {}
    }
    player.sendMessage(PREFIX + "§aTexto actualizado.");
  }).catch(() => {});
}

function createItemForm(player) {
  const f = new ModalFormData()
    .title("§l§eCrear Item Flotante")
    .dropdown("Item", ITEM_NAMES, 0)
    .textField("ID personalizado §7(opcional, ej: minecraft:tnt)", "")
    .textField("Etiqueta de texto §7(opcional)", "");
  f.show(player).then((r) => {
    if (r.canceled) return;
    const [itemIdx, customId, label] = r.formValues;
    const itemId = (customId && String(customId).trim()) ? String(customId).trim() : ITEM_OPTIONS[itemIdx].id;
    const loc = front(player, 3);
    let stack;
    try { stack = new ItemStack(itemId, 1); }
    catch (e) { player.sendMessage(PREFIX + "§cID de item invalido: §f" + itemId); return; }
    let ent;
    try { ent = player.dimension.spawnItem(stack, loc); }
    catch (e) { player.sendMessage(PREFIX + "§cNo se pudo crear el item aqui."); return; }
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
        te.setDynamicProperty("ft", true);
        te.setDynamicProperty("p", 0);
        te.setDynamicProperty("s", 0);
        te.setDynamicProperty("b", false);
        te.setDynamicProperty("base", `${tl.x},${tl.y},${tl.z}`);
        te.setDynamicProperty("owner", player.name);
      } catch (_) {}
    }
    player.sendMessage(PREFIX + "§aItem flotante creado: §f" + itemId);
  }).catch(() => {});
}

function deleteLooking(player) {
  const e = lookingHolo(player);
  if (!e) { player.sendMessage(PREFIX + "§cMira directamente un holograma de texto."); return; }
  try { e.remove(); player.sendMessage(PREFIX + "§aHolograma borrado."); }
  catch (err) { player.sendMessage(PREFIX + "§cNo se pudo borrar."); }
}

function listForm(player) {
  const holos = getTextHolos();
  if (holos.length === 0) { player.sendMessage(PREFIX + "§7No hay hologramas de texto."); return; }
  const f = new ActionFormData().title("§l§fHologramas").body("§7Selecciona para teletransportarte.");
  for (const e of holos) {
    const label = (stripColors(e.nameTag).split("\n")[0] || "(vacio)").slice(0, 24);
    const l = e.location;
    f.button(`§e${label}\n§7${Math.round(l.x)}, ${Math.round(l.y)}, ${Math.round(l.z)}`);
  }
  f.show(player).then((r) => {
    if (r.canceled) return;
    const e = holos[r.selection];
    if (!e) return;
    try { player.teleport(e.location, { dimension: e.dimension }); player.sendMessage(PREFIX + "§aTeletransportado."); }
    catch (err) { player.sendMessage(PREFIX + "§cNo se pudo teletransportar."); }
  }).catch(() => {});
}

function deleteAll(player) {
  const f = new ActionFormData()
    .title("§l§4Borrar TODO")
    .body("§cEsto borra TODOS los hologramas de texto y los items flotantes. ¿Seguro?")
    .button("§cSi, borrar todo")
    .button("§aCancelar");
  f.show(player).then((r) => {
    if (r.canceled || r.selection !== 0) return;
    let n = 0;
    for (const e of getTextHolos()) { try { e.remove(); n++; } catch (_) {} }
    // items
    const reg = getItemReg();
    for (const it of reg) {
      try {
        const dim = world.getDimension(it.dim);
        const ents = dim.getEntities({ type: "minecraft:item", location: { x: it.x, y: it.y, z: it.z }, maxDistance: 6 });
        for (const e of ents) { if (e.getDynamicProperty("fti") === it.uid) { e.remove(); n++; } }
      } catch (_) {}
    }
    setItemReg([]);
    player.sendMessage(PREFIX + "§aBorrados §f" + n + " §aelementos.");
  }).catch(() => {});
}

function helpForm(player) {
  new ActionFormData()
    .title("§l§7Ayuda")
    .body(
      "§b§lFloating Text Ultimate§r\n\n" +
      "§e• Abrir menu: §fusa la §bVarita §fo escribe §a!ft§f en el chat.\n" +
      "§e• §fConseguir varita: §a!ftwand§f.\n" +
      "§e• Crear Texto: §fescribe el texto (usa §7|§f o §7\\n§f para varias lineas), elige color, particula, velocidad y flotar.\n" +
      "§e• Editar/Borrar: §fmira directamente el holograma y abre el menu.\n" +
      "§e• Items flotantes: §fflotan y giran solos; se reponen si despawnean.\n" +
      "§e• Velocidad: §f0 = particula quieta, 1-4 = orbita, 5 = reversa.\n\n" +
      "§7Base/concepto del addon original por Death_Aruban."
    )
    .button("§aOK")
    .show(player).catch(() => {});
}

// ---- Entrega de varita ------------------------------------------------------
function giveWand(player) {
  try {
    const inv = player.getComponent("minecraft:inventory");
    inv.container.addItem(new ItemStack(WAND, 1));
    player.sendMessage(PREFIX + "§aRecibiste la §bVarita de Hologramas§a.");
  } catch (e) { player.sendMessage(PREFIX + "§cNo se pudo dar la varita."); }
}

// ============================================================================
//  EVENTOS
// ============================================================================
world.afterEvents.itemUse.subscribe((ev) => {
  if (ev.itemStack && ev.itemStack.typeId === WAND) openMain(ev.source);
});

world.beforeEvents.chatSend.subscribe((ev) => {
  const msg = ev.message.trim().toLowerCase();
  if (msg === "!ft" || msg === "!holo") {
    ev.cancel = true;
    system.run(() => openMain(ev.sender));
  } else if (msg === "!ftwand" || msg === "!ftvarita") {
    ev.cancel = true;
    system.run(() => giveWand(ev.sender));
  }
});

world.afterEvents.playerSpawn.subscribe((ev) => {
  if (!ev.initialSpawn) return;
  ensureWand(ev.player);
});

// Reparto/confirmacion para jugadores ya presentes (al activar el pack o /reload)
function ensureWand(p) {
  try {
    if (!p.getDynamicProperty("ft_got")) {
      p.setDynamicProperty("ft_got", true);
      giveWand(p);
    }
  } catch (_) {}
  try {
    p.sendMessage(PREFIX + "§aListo. §fUsa la §bVarita §fo escribe §a!ft§f. (varita: §a!ftwand§f)");
  } catch (_) {}
}

// Confirmacion visible de que el script SI cargo + asegura varita a todos
system.runTimeout(() => {
  try {
    for (const p of world.getAllPlayers()) ensureWand(p);
  } catch (_) {}
}, 40);

console.warn("[Floating Text Ultimate] cargado v6.0.1 (API 2.x)");
