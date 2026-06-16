import {
  world,
  system,
  ItemStack,
  CustomCommandParamType,
  CommandPermissionLevel,
  CustomCommandStatus,
} from "@minecraft/server";
import { ActionFormData, ModalFormData, MessageFormData } from "@minecraft/server-ui";

/*
 * ROM PvP Zones v1.0.0
 * --------------------------------------------------------------------------
 * - Crea zonas PvP 1v1 / 2v2 / 3v3 PROTEGIDAS (nadie puede romper/poner bloques
 *   dentro = "sin dañar la zona").
 * - Custom Commands API:
 *     /rom:wand            -> entrega las 2 varitas (nether = pos, palo = pared)
 *     /rom:menu            -> abre el formulario principal
 *     /rom:create <nombre> <1v1|2v2|3v3>
 *     /rom:delete <nombre>
 *     /rom:info [nombre]
 * - Varita NETHER (rom:zone_wand): IZQ = pos1, DER = pos2  (área del arena).
 * - Palo MARCADOR (rom:wall_wand): IZQ = pd1, DER = pd2     (pared a proteger).
 * - Formularios (ActionForm / ModalForm) y texturas custom.
 */

// ----------------------------------------------------------------- constantes
const ZONES_KEY = "rom:zones";
const SEL_KEY = "rom:sel";
const ADMIN_TAG = "rom_admin"; // /tag @s add rom_admin  -> puede editar dentro de zonas
const ZONE_WAND = "rom:zone_wand";
const WALL_WAND = "rom:wall_wand";
const SIZES = ["1v1", "2v2", "3v3"];
const MAX_PER_TEAM = { "1v1": 1, "2v2": 2, "3v3": 3 };
const PREFIX = "§8[§cROM§6PvP§8] §r";

// selección en memoria (rápida); se persiste en dynamic property del jugador
const selCache = new Map();
// caché de zonas para no parsear JSON en cada evento de bloque
let zonesCache = null;

// ----------------------------------------------------------------- utilidades
function log(msg) {
  try {
    console.warn(`[ROM PvP] ${msg}`);
  } catch (e) {}
}

function tell(player, msg) {
  try {
    player.sendMessage(PREFIX + msg);
  } catch (e) {}
}

function canEdit(player) {
  return player.hasTag(ADMIN_TAG) || player.commandPermissionLevel > 0;
}

function loadZones() {
  if (zonesCache !== null) return zonesCache;
  try {
    const raw = world.getDynamicProperty(ZONES_KEY);
    if (typeof raw !== "string" || raw.length === 0) {
      zonesCache = [];
      return zonesCache;
    }
    const arr = JSON.parse(raw);
    zonesCache = Array.isArray(arr) ? arr : [];
  } catch (e) {
    zonesCache = [];
  }
  return zonesCache;
}

function saveZones(zones) {
  // siempre se llama dentro de un contexto con permiso de escritura (system.run / form)
  zonesCache = zones;
  world.setDynamicProperty(ZONES_KEY, JSON.stringify(zones));
}

function getZone(name) {
  const n = String(name).toLowerCase();
  return loadZones().find((z) => z.name.toLowerCase() === n) || null;
}

function getSel(player) {
  if (selCache.has(player.id)) return selCache.get(player.id);
  let sel = { p1: null, p2: null, pd1: null, pd2: null };
  try {
    const raw = player.getDynamicProperty(SEL_KEY);
    if (typeof raw === "string" && raw.length) sel = JSON.parse(raw);
  } catch (e) {}
  selCache.set(player.id, sel);
  return sel;
}

function setSel(player, sel) {
  selCache.set(player.id, sel);
  const json = JSON.stringify(sel);
  system.run(() => {
    try {
      player.setDynamicProperty(SEL_KEY, json);
    } catch (e) {}
  });
}

function point(loc, dim) {
  return { x: Math.floor(loc.x), y: Math.floor(loc.y), z: Math.floor(loc.z), dim };
}

function normalizeBox(a, b) {
  return {
    min: { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), z: Math.min(a.z, b.z) },
    max: { x: Math.max(a.x, b.x), y: Math.max(a.y, b.y), z: Math.max(a.z, b.z) },
  };
}

function boxVolume(box) {
  return (
    (box.max.x - box.min.x + 1) *
    (box.max.y - box.min.y + 1) *
    (box.max.z - box.min.z + 1)
  );
}

function pointInBox(x, y, z, box) {
  return (
    x >= box.min.x &&
    x <= box.max.x &&
    y >= box.min.y &&
    y <= box.max.y &&
    z >= box.min.z &&
    z <= box.max.z
  );
}

// devuelve la zona protegida que contiene (dim,x,y,z), o null
function protectingZone(dim, x, y, z, zones) {
  for (const z0 of zones) {
    if (z0.dim !== dim || z0.protected === false) continue;
    if (pointInBox(x, y, z, z0.box)) return z0;
    if (z0.walls && pointInBox(x, y, z, z0.walls)) return z0;
  }
  return null;
}

function boxCenterTop(box) {
  return {
    x: Math.floor((box.min.x + box.max.x) / 2) + 0.5,
    y: box.max.y + 1,
    z: Math.floor((box.min.z + box.max.z) / 2) + 0.5,
  };
}

// ----------------------------------------------------------------- items
function makeZoneWand() {
  const it = new ItemStack(ZONE_WAND, 1);
  it.nameTag = "§5§l✦ Varita Nether ✦";
  it.setLore([
    "§7Define el §dárea del arena§7.",
    "§eIzquierda §8» §dPos 1",
    "§eDerecha §8» §dPos 2",
    "§8» Crea con §f/rom:create",
  ]);
  return it;
}

function makeWallWand() {
  const it = new ItemStack(WALL_WAND, 1);
  it.nameTag = "§6§l⚒ Palo Marcador ⚒";
  it.setLore([
    "§7Define las §6paredes§7 (pd1/pd2).",
    "§eIzquierda §8» §6PD 1",
    "§eDerecha §8» §6PD 2",
    "§8» Opcional, protege los muros",
  ]);
  return it;
}

function giveItem(player, item) {
  const inv = player.getComponent("minecraft:inventory");
  if (inv && inv.container) {
    inv.container.addItem(item);
    return true;
  }
  return false;
}

// ----------------------------------------------------------------- crear zona
function createZone(player, name, size, useWalls) {
  name = String(name || "").trim();
  if (!name) return { ok: false, msg: "§cDebes indicar un nombre para la zona." };
  if (name.length > 24) return { ok: false, msg: "§cEl nombre es demasiado largo (máx 24)." };
  if (!SIZES.includes(size)) size = "1v1";

  const sel = getSel(player);
  if (!sel.p1 || !sel.p2)
    return {
      ok: false,
      msg: "§cFalta selección. Usa la §dVarita Nether§c: §eizq§c=Pos1, §eder§c=Pos2.",
    };
  if (sel.p1.dim !== sel.p2.dim)
    return { ok: false, msg: "§cPos1 y Pos2 deben estar en la misma dimensión." };

  const zones = loadZones();
  if (zones.some((z) => z.name.toLowerCase() === name.toLowerCase()))
    return { ok: false, msg: `§cYa existe una zona llamada §e${name}§c.` };

  const box = normalizeBox(sel.p1, sel.p2);
  let walls = null;
  if (useWalls) {
    if (!sel.pd1 || !sel.pd2)
      return {
        ok: false,
        msg: "§cActivaste paredes pero falta §6pd1/pd2§c. Usa el §6Palo Marcador§c.",
      };
    if (sel.pd1.dim !== sel.p1.dim)
      return { ok: false, msg: "§cLas paredes deben estar en la misma dimensión que el área." };
    walls = normalizeBox(sel.pd1, sel.pd2);
  }

  const zone = {
    name,
    dim: sel.p1.dim,
    size,
    box,
    walls,
    protected: true,
    owner: player.name,
    created: Date.now(),
  };
  zones.push(zone);

  system.run(() => {
    saveZones(zones);
  });

  const vol = boxVolume(box);
  log(`${player.name} creó la zona "${name}" (${size}) vol=${vol}`);
  return {
    ok: true,
    msg:
      `§a✔ Zona §e${name} §acreada §7(§f${size}§7, §f${vol}§7 bloques)` +
      (walls ? " §7+ paredes" : "") +
      ".",
  };
}

function deleteZone(name) {
  const zones = loadZones();
  const idx = zones.findIndex((z) => z.name.toLowerCase() === String(name).toLowerCase());
  if (idx === -1) return { ok: false, msg: `§cNo existe la zona §e${name}§c.` };
  const removed = zones.splice(idx, 1)[0];
  system.run(() => saveZones(zones));
  log(`Zona eliminada: ${removed.name}`);
  return { ok: true, msg: `§a✔ Zona §e${removed.name} §aeliminada.` };
}

function zoneInfoText(z) {
  const b = z.box;
  const lines = [
    `§6▌ §eZona: §f${z.name}`,
    `§7Modo: §b${z.size} §8(${MAX_PER_TEAM[z.size]} vs ${MAX_PER_TEAM[z.size]})`,
    `§7Dimensión: §f${z.dim.replace("minecraft:", "")}`,
    `§7Área: §f${b.min.x},${b.min.y},${b.min.z} §8→ §f${b.max.x},${b.max.y},${b.max.z}`,
    `§7Volumen: §f${boxVolume(b)} §7bloques`,
    `§7Paredes: §f${z.walls ? "sí" : "no"}`,
    `§7Protegida: ${z.protected === false ? "§cNO" : "§aSÍ"}`,
    `§7Dueño: §f${z.owner || "?"}`,
  ];
  return lines.join("\n");
}

// ----------------------------------------------------------------- formularios
function openMenu(player) {
  const zones = loadZones();
  const form = new ActionFormData()
    .title("§l§cROM §6PvP Zones")
    .body(`§7Zonas creadas: §f${zones.length}\n§7Selecciona una acción:`)
    .button("§aCrear zona", "textures/rom_ui/icon_create")
    .button("§bMis zonas / Info", "textures/rom_ui/icon_info")
    .button("§cEliminar zona", "textures/rom_ui/icon_delete")
    .button("§eObtener varitas", "textures/rom_ui/icon_wand")
    .button("§dVer selección", "textures/rom_ui/icon_pos")
    .button("§7Ayuda", "textures/rom_ui/icon_help");

  form.show(player).then((res) => {
    if (res.canceled) return;
    switch (res.selection) {
      case 0:
        openCreateForm(player);
        break;
      case 1:
        openZonesList(player);
        break;
      case 2:
        openDeleteList(player);
        break;
      case 3:
        system.run(() => {
          giveItem(player, makeZoneWand());
          giveItem(player, makeWallWand());
          tell(player, "§aRecibiste la §5Varita Nether §ay el §6Palo Marcador§a.");
        });
        break;
      case 4:
        showSelection(player);
        break;
      case 5:
        openHelp(player);
        break;
    }
  });
}

function openCreateForm(player) {
  if (!canEdit(player)) {
    tell(player, "§cNo tienes permiso. Pide el tag §e" + ADMIN_TAG + "§c o ser OP.");
    return;
  }
  const sel = getSel(player);
  const selTxt =
    (sel.p1 ? "§aPos1 ✔" : "§cPos1 ✘") + " §8| " + (sel.p2 ? "§aPos2 ✔" : "§cPos2 ✘");
  const form = new ModalFormData()
    .title("§l§aCrear zona PvP")
    .textField("§7Selección: " + selTxt + "\n§eNombre de la zona", "ej: arena1")
    .dropdown("§bModo de combate", ["§a1v1", "§b2v2", "§d3v3"], 0)
    .toggle("§6Proteger también las paredes (pd1/pd2)", false);

  form.show(player).then((res) => {
    if (res.canceled) return;
    const [name, sizeIdx, useWalls] = res.formValues;
    const result = createZone(player, name, SIZES[sizeIdx], useWalls);
    tell(player, result.msg);
  });
}

function openZonesList(player) {
  const zones = loadZones();
  if (zones.length === 0) {
    tell(player, "§7No hay zonas creadas todavía.");
    return;
  }
  const form = new ActionFormData().title("§l§bMis zonas").body("§7Toca una zona para ver detalles:");
  for (const z of zones) {
    form.button(`§f${z.name}\n§8${z.size} · ${z.dim.replace("minecraft:", "")}`, "textures/rom_ui/icon_info");
  }
  form.show(player).then((res) => {
    if (res.canceled) return;
    openZoneDetail(player, zones[res.selection]);
  });
}

function openZoneDetail(player, zone) {
  if (!zone) return;
  const form = new ActionFormData()
    .title("§l§e" + zone.name)
    .body(zoneInfoText(zone))
    .button("§bTeletransportarme", "textures/rom_ui/icon_pos")
    .button(zone.protected === false ? "§aActivar protección" : "§cDesactivar protección", "textures/rom_ui/icon_create")
    .button("§cEliminar zona", "textures/rom_ui/icon_delete")
    .button("§7Volver", "textures/rom_ui/icon_help");

  form.show(player).then((res) => {
    if (res.canceled) return;
    switch (res.selection) {
      case 0:
        system.run(() => {
          try {
            player.teleport(boxCenterTop(zone.box), { dimension: world.getDimension(zone.dim) });
            tell(player, `§aTeletransportado a §e${zone.name}§a.`);
          } catch (e) {
            tell(player, "§cNo se pudo teletransportar.");
          }
        });
        break;
      case 1: {
        const zones = loadZones();
        const target = zones.find((z) => z.name === zone.name);
        if (target) {
          target.protected = target.protected === false;
          system.run(() => saveZones(zones));
          tell(player, `§7Protección de §e${zone.name}§7: ${target.protected ? "§aACTIVADA" : "§cDESACTIVADA"}`);
        }
        break;
      }
      case 2: {
        const r = deleteZone(zone.name);
        tell(player, r.msg);
        break;
      }
      case 3:
        openZonesList(player);
        break;
    }
  });
}

function openDeleteList(player) {
  if (!canEdit(player)) {
    tell(player, "§cNo tienes permiso para eliminar zonas.");
    return;
  }
  const zones = loadZones();
  if (zones.length === 0) {
    tell(player, "§7No hay zonas para eliminar.");
    return;
  }
  const form = new ActionFormData().title("§l§cEliminar zona").body("§7Selecciona la zona a eliminar:");
  for (const z of zones) form.button(`§c${z.name}\n§8${z.size}`, "textures/rom_ui/icon_delete");
  form.show(player).then((res) => {
    if (res.canceled) return;
    const z = zones[res.selection];
    const confirm = new MessageFormData()
      .title("§cConfirmar")
      .body(`§7¿Eliminar la zona §e${z.name}§7?`)
      .button1("§cSí, eliminar")
      .button2("§7Cancelar");
    confirm.show(player).then((r2) => {
      if (r2.canceled || r2.selection !== 0) return;
      tell(player, deleteZone(z.name).msg);
    });
  });
}

function showSelection(player) {
  const sel = getSel(player);
  const fmt = (p) => (p ? `§f${p.x}, ${p.y}, ${p.z}` : "§8(sin definir)");
  const body = [
    "§5Varita Nether (área):",
    "  §ePos1: " + fmt(sel.p1),
    "  §ePos2: " + fmt(sel.p2),
    "",
    "§6Palo Marcador (paredes):",
    "  §ePD1: " + fmt(sel.pd1),
    "  §ePD2: " + fmt(sel.pd2),
  ].join("\n");
  new ActionFormData()
    .title("§l§dTu selección")
    .body(body)
    .button("§7Cerrar")
    .show(player);
}

function openHelp(player) {
  const body = [
    "§6§lCómo crear una zona PvP:",
    "§71. §f/rom:wand §7para recibir las varitas.",
    "§72. Con la §5Varita Nether§7: §eizq§7=Pos1, §eder§7=Pos2.",
    "§73. §f/rom:create <nombre> <1v1|2v2|3v3>",
    "§7   (o usa §f/rom:menu §7→ Crear zona).",
    "",
    "§6Paredes (opcional):",
    "§7Con el §6Palo Marcador§7: §eizq§7=pd1, §eder§7=pd2,",
    "§7y activa 'Proteger paredes' al crear.",
    "",
    "§aDentro de una zona NADIE puede romper/poner",
    "§abloques ni explotar nada (sin dañar la zona).",
    "§7Admins con tag §e" + ADMIN_TAG + " §7sí pueden editar.",
    "",
    "§eComandos: §f/rom:create /rom:delete /rom:info /rom:wand /rom:menu",
  ].join("\n");
  new ActionFormData().title("§l§7Ayuda · ROM PvP").body(body).button("§7Entendido").show(player);
}

// ----------------------------------------------------------------- comandos custom
system.beforeEvents.startup.subscribe((init) => {
  const reg = init.customCommandRegistry;

  reg.registerEnum("rom:teamsize", SIZES);

  reg.registerCommand(
    {
      name: "rom:wand",
      description: "Entrega la Varita Nether (área) y el Palo Marcador (paredes).",
      permissionLevel: CommandPermissionLevel.Any,
      cheatsRequired: false,
    },
    (origin) => {
      const player = origin.sourceEntity;
      if (!player || player.typeId !== "minecraft:player")
        return { status: CustomCommandStatus.Failure, message: "Solo jugadores." };
      system.run(() => {
        giveItem(player, makeZoneWand());
        giveItem(player, makeWallWand());
      });
      return { status: CustomCommandStatus.Success, message: "§aRecibiste las varitas de ROM PvP." };
    }
  );

  reg.registerCommand(
    {
      name: "rom:menu",
      description: "Abre el menú de zonas PvP.",
      permissionLevel: CommandPermissionLevel.Any,
      cheatsRequired: false,
    },
    (origin) => {
      const player = origin.sourceEntity;
      if (!player || player.typeId !== "minecraft:player")
        return { status: CustomCommandStatus.Failure, message: "Solo jugadores." };
      system.run(() => openMenu(player));
      return { status: CustomCommandStatus.Success };
    }
  );

  reg.registerCommand(
    {
      name: "rom:create",
      description: "Crea una zona PvP con la selección de la Varita Nether.",
      permissionLevel: CommandPermissionLevel.Any,
      cheatsRequired: false,
      mandatoryParameters: [
        { name: "nombre", type: CustomCommandParamType.String },
        { name: "rom:teamsize", type: CustomCommandParamType.Enum },
      ],
      optionalParameters: [{ name: "paredes", type: CustomCommandParamType.Boolean }],
    },
    (origin, nombre, size, paredes) => {
      const player = origin.sourceEntity;
      if (!player || player.typeId !== "minecraft:player")
        return { status: CustomCommandStatus.Failure, message: "Solo jugadores." };
      if (!canEdit(player))
        return {
          status: CustomCommandStatus.Failure,
          message: "Sin permiso (necesitas tag rom_admin o ser OP).",
        };
      const r = createZone(player, nombre, size, paredes === true);
      return {
        status: r.ok ? CustomCommandStatus.Success : CustomCommandStatus.Failure,
        message: r.msg.replace(/§./g, ""),
      };
    }
  );

  reg.registerCommand(
    {
      name: "rom:delete",
      description: "Elimina una zona PvP por nombre.",
      permissionLevel: CommandPermissionLevel.Any,
      cheatsRequired: false,
      mandatoryParameters: [{ name: "nombre", type: CustomCommandParamType.String }],
    },
    (origin, nombre) => {
      const player = origin.sourceEntity;
      if (player && !canEdit(player))
        return { status: CustomCommandStatus.Failure, message: "Sin permiso." };
      const r = deleteZone(nombre);
      return {
        status: r.ok ? CustomCommandStatus.Success : CustomCommandStatus.Failure,
        message: r.msg.replace(/§./g, ""),
      };
    }
  );

  reg.registerCommand(
    {
      name: "rom:info",
      description: "Muestra info de una zona (o lista todas).",
      permissionLevel: CommandPermissionLevel.Any,
      cheatsRequired: false,
      optionalParameters: [{ name: "nombre", type: CustomCommandParamType.String }],
    },
    (origin, nombre) => {
      const player = origin.sourceEntity;
      const zones = loadZones();
      if (!nombre) {
        if (zones.length === 0)
          return { status: CustomCommandStatus.Success, message: "No hay zonas creadas." };
        const list = zones.map((z) => `${z.name} (${z.size})`).join(", ");
        if (player) system.run(() => openZonesList(player));
        return { status: CustomCommandStatus.Success, message: `Zonas: ${list}` };
      }
      const z = getZone(nombre);
      if (!z) return { status: CustomCommandStatus.Failure, message: `No existe la zona ${nombre}.` };
      if (player) system.run(() => openZoneDetail(player, z));
      return {
        status: CustomCommandStatus.Success,
        message: zoneInfoText(z).replace(/§./g, ""),
      };
    }
  );

  log("Comandos /rom: registrados (wand, menu, create, delete, info).");
});

// ----------------------------------------------------------------- varitas: selección
world.beforeEvents.playerBreakBlock.subscribe((ev) => {
  const player = ev.player;
  const held = ev.itemStack;
  const id = held ? held.typeId : undefined;
  const dim = ev.dimension.id;
  const loc = ev.block.location;

  if (id === ZONE_WAND) {
    ev.cancel = true;
    const sel = getSel(player);
    sel.p1 = point(loc, dim);
    setSel(player, sel);
    system.run(() => tell(player, `§dPos1 §7definida: §f${sel.p1.x}, ${sel.p1.y}, ${sel.p1.z}`));
    return;
  }
  if (id === WALL_WAND) {
    ev.cancel = true;
    const sel = getSel(player);
    sel.pd1 = point(loc, dim);
    setSel(player, sel);
    system.run(() => tell(player, `§6PD1 §7definida: §f${sel.pd1.x}, ${sel.pd1.y}, ${sel.pd1.z}`));
    return;
  }

  // protección
  if (!canEdit(player)) {
    const z = protectingZone(dim, loc.x, loc.y, loc.z, loadZones());
    if (z) {
      ev.cancel = true;
      system.run(() => player.onScreenDisplay.setActionBar(`§c⛔ Zona protegida: §e${z.name}`));
    }
  }
});

world.beforeEvents.playerInteractWithBlock.subscribe((ev) => {
  const player = ev.player;
  const held = ev.itemStack;
  const id = held ? held.typeId : undefined;
  if (id !== ZONE_WAND && id !== WALL_WAND) return;

  ev.cancel = true;
  const dim = player.dimension.id;
  const loc = ev.block.location;
  const sel = getSel(player);
  if (id === ZONE_WAND) {
    sel.p2 = point(loc, dim);
    setSel(player, sel);
    system.run(() => tell(player, `§dPos2 §7definida: §f${sel.p2.x}, ${sel.p2.y}, ${sel.p2.z}`));
  } else {
    sel.pd2 = point(loc, dim);
    setSel(player, sel);
    system.run(() => tell(player, `§6PD2 §7definida: §f${sel.pd2.x}, ${sel.pd2.y}, ${sel.pd2.z}`));
  }
});

// ----------------------------------------------------------------- protección: colocar
world.beforeEvents.playerPlaceBlock.subscribe((ev) => {
  const player = ev.player;
  if (canEdit(player)) return;
  const dim = ev.dimension.id;
  const loc = ev.block.location;
  const z = protectingZone(dim, loc.x, loc.y, loc.z, loadZones());
  if (z) {
    ev.cancel = true;
    system.run(() => player.onScreenDisplay.setActionBar(`§c⛔ Zona protegida: §e${z.name}`));
  }
});

// ----------------------------------------------------------------- protección: explosiones
world.beforeEvents.explosion.subscribe((ev) => {
  const zones = loadZones();
  if (zones.length === 0) return;
  const dim = ev.dimension.id;
  const impacted = ev.getImpactedBlocks();
  const kept = impacted.filter((b) => !protectingZone(dim, b.location.x, b.location.y, b.location.z, zones));
  if (kept.length !== impacted.length) ev.setImpactedBlocks(kept);
});

// ----------------------------------------------------------------- feedback al entrar
system.runInterval(() => {
  const zones = loadZones();
  if (zones.length === 0) return;
  for (const player of world.getAllPlayers()) {
    const l = player.location;
    const dim = player.dimension.id;
    const z = zones.find(
      (zz) => zz.dim === dim && pointInBox(Math.floor(l.x), Math.floor(l.y), Math.floor(l.z), zz.box)
    );
    if (z) {
      player.onScreenDisplay.setActionBar(`§c⚔ §eZona PvP: §f${z.name} §8(§b${z.size}§8)`);
      if (!player.hasTag("rom_inzone")) player.addTag("rom_inzone");
    } else if (player.hasTag("rom_inzone")) {
      player.removeTag("rom_inzone");
    }
  }
}, 20);

try {
  world.afterEvents.worldLoad.subscribe(() => {
    log(`ROM PvP Zones cargado. Zonas: ${loadZones().length}`);
  });
} catch (e) {
  system.run(() => log(`ROM PvP Zones cargado. Zonas: ${loadZones().length}`));
}
