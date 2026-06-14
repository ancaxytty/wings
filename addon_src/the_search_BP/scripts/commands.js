/**
 * The Search v0.1 PE — commands.js
 * -------------------------------------------------------------
 * Registro de los comandos personalizados /ts:* con la API NATIVA de
 * Custom Commands (Minecraft Bedrock 1.21.100+, @minecraft/server 2.x).
 *
 * IMPORTANTE sobre el contexto de ejecucion:
 *   El callback de un comando se ejecuta en una fase de "solo lectura":
 *   se pueden LEER datos, pero NO mutar el mundo ni mostrar formularios.
 *   Por eso toda mutacion (crear/guardar/teleport) y la UI se difieren con
 *   system.run(), y el comando devuelve un mensaje de confirmacion inmediato.
 *
 * Comandos:
 *   /ts:create  [nombre]
 *   /ts:delete  [nombre]
 *   /ts:edit    [nombre]                 (abre UI)
 *   /ts:set     [nombre]                 (coloca una cabeza donde miras)
 *   /ts:rename  [nombre] [nuevo_nombre]
 *   /ts:list
 *   /ts:reset   [jugador] [nombre]
 *   /ts:rewards [nombre]                 (abre UI)
 *   /ts:tp      [nombre] [numero_cabeza]
 */

import {
  system, world,
  CustomCommandParamType, CommandPermissionLevel, CustomCommandStatus
} from "@minecraft/server";

import { PREFIX, HEAD_CATALOG, SIZE_NAMES, colorCode } from "./config.js";
import {
  loadDB, listSearches, getSearch, toKey,
  createSearch, deleteSearch, renameSearch, addHead, resetProgress
} from "./data.js";
import { placeHeadBlock, actionBar } from "./effects.js";
import { openEditForm, openRewardsForm } from "./ui.js";

// ----------------------------- helpers de resultado -----------------------------

const ok = (message) => ({ status: CustomCommandStatus.Success, message });
const fail = (message) => ({ status: CustomCommandStatus.Failure, message: `§c${message}` });

/** Comprueba que quien ejecuta el comando es un jugador y lo devuelve. */
function requirePlayer(origin) {
  const ent = origin.sourceEntity;
  if (ent && ent.typeId === "minecraft:player") return ent;
  return null;
}

// ----------------------------- handlers -----------------------------

function cmdCreate(origin, nombre) {
  const key = toKey(nombre);
  if (!key) return fail("El nombre no puede estar vacio.");
  if (getSearch(nombre)) return fail(`Ya existe una busqueda llamada "${nombre}".`);
  const player = requirePlayer(origin);
  system.run(() => {
    const r = createSearch(nombre);
    if (player) {
      player.sendMessage(r.ok
        ? `${PREFIX}§aBusqueda §f${nombre}§a creada. Usa §e/ts:set ${nombre}§a para ocultar cabezas.`
        : `${PREFIX}§c${r.error}`);
    }
  });
  return ok(`Creando busqueda "${nombre}"...`);
}

function cmdDelete(origin, nombre) {
  if (!getSearch(nombre)) return fail(`No existe la busqueda "${nombre}".`);
  const player = requirePlayer(origin);
  system.run(() => {
    const r = deleteSearch(nombre);
    if (player) player.sendMessage(r.ok ? `${PREFIX}§aBusqueda §f${nombre}§a eliminada.` : `${PREFIX}§c${r.error}`);
  });
  return ok(`Eliminando "${nombre}"...`);
}

function cmdEdit(origin, nombre) {
  const player = requirePlayer(origin);
  if (!player) return fail("Este comando debe ejecutarlo un jugador.");
  if (!getSearch(nombre)) return fail(`No existe la busqueda "${nombre}".`);
  // La UI no puede abrirse en contexto de solo lectura: se difiere.
  system.run(() => openEditForm(player, nombre));
  return ok(`Abriendo editor de "${nombre}"...`);
}

function cmdRewards(origin, nombre) {
  const player = requirePlayer(origin);
  if (!player) return fail("Este comando debe ejecutarlo un jugador.");
  if (!getSearch(nombre)) return fail(`No existe la busqueda "${nombre}".`);
  system.run(() => openRewardsForm(player, nombre));
  return ok(`Abriendo recompensas de "${nombre}"...`);
}

function cmdSet(origin, nombre) {
  const player = requirePlayer(origin);
  if (!player) return fail("Este comando debe ejecutarlo un jugador.");
  const search = getSearch(nombre);
  if (!search) return fail(`No existe la busqueda "${nombre}".`);

  system.run(() => {
    // Bloque al que mira el jugador (hasta 8 bloques); si no, su propia posicion.
    let target = null;
    try {
      const hit = player.getBlockFromViewDirection({ maxDistance: 8, includeLiquidBlocks: false, includePassableBlocks: false });
      if (hit && hit.block) target = hit.block;
    } catch (e) {}
    if (!target) {
      try {
        target = player.dimension.getBlock({
          x: Math.floor(player.location.x),
          y: Math.floor(player.location.y),
          z: Math.floor(player.location.z)
        });
      } catch (e) {}
    }
    if (!target) {
      player.sendMessage(`${PREFIX}§cNo pude determinar el bloque objetivo.`);
      return;
    }
    const loc = target.location;
    const skin = search.defaultSkin;
    const size = search.defaultSize;
    placeHeadBlock(player.dimension, loc.x, loc.y, loc.z, skin, size);
    const total = addHead(search, loc.x, loc.y, loc.z, player.dimension.id, skin, size);
    const cat = HEAD_CATALOG[skin];
    player.sendMessage(`${PREFIX}§aCabeza §${colorCode(cat.color)}${cat.name}§a (${SIZE_NAMES[size]}) oculta en §f${loc.x}, ${loc.y}, ${loc.z}§a. §7Total: ${total}`);
    actionBar(player, `§a+1 cabeza en §f${search.name}§7 (${total})`);
  });
  return ok(`Colocando cabeza en "${nombre}"...`);
}

function cmdRename(origin, nombre, nuevoNombre) {
  if (!getSearch(nombre)) return fail(`No existe la busqueda "${nombre}".`);
  if (!toKey(nuevoNombre)) return fail("El nuevo nombre no puede estar vacio.");
  const player = requirePlayer(origin);
  system.run(() => {
    const r = renameSearch(nombre, nuevoNombre);
    if (player) player.sendMessage(r.ok
      ? `${PREFIX}§aBusqueda renombrada: §f${nombre} §7→ §f${nuevoNombre}`
      : `${PREFIX}§c${r.error}`);
  });
  return ok(`Renombrando "${nombre}" a "${nuevoNombre}"...`);
}

function cmdList(origin) {
  const list = listSearches(loadDB());
  if (list.length === 0) return ok("§7No hay busquedas creadas. Usa §e/ts:create [nombre]§7.");
  let msg = `§6§l== Busquedas (${list.length}) ==§r`;
  for (const s of list) {
    const found = s.heads.length;
    msg += `\n§7• §${colorCode(s.color)}${s.name}§7: §f${found}§7 cabeza(s), §f${(s.rewards || []).length}§7 recompensa(s)`;
  }
  return ok(msg);
}

function cmdReset(origin, jugador, nombre) {
  const search = getSearch(nombre);
  if (!search) return fail(`No existe la busqueda "${nombre}".`);
  const wanted = String(jugador || "").trim();
  if (!wanted) return fail("Debes indicar el nombre del jugador (o * / @a para todos).");
  const admin = requirePlayer(origin);
  system.run(() => {
    const all = world.getAllPlayers();
    const everyone = wanted === "*" || wanted === "@a";
    const targets = everyone
      ? all
      : all.filter((p) => p.name.toLowerCase() === wanted.toLowerCase());
    if (targets.length === 0) {
      if (admin) admin.sendMessage(`${PREFIX}§cNo se encontro al jugador "${wanted}" conectado.`);
      return;
    }
    let n = 0;
    for (const target of targets) {
      try {
        resetProgress(target, search);
        target.sendMessage(`${PREFIX}§eTu progreso en §f${search.name}§e fue reiniciado.`);
        n++;
      } catch (e) {}
    }
    if (admin) admin.sendMessage(`${PREFIX}§aProgreso reiniciado para §f${n}§a jugador(es) en §f${search.name}§a.`);
  });
  return ok(`Reiniciando progreso en "${nombre}"...`);
}

function cmdTp(origin, nombre, numeroCabeza) {
  const player = requirePlayer(origin);
  if (!player) return fail("Este comando debe ejecutarlo un jugador.");
  const search = getSearch(nombre);
  if (!search) return fail(`No existe la busqueda "${nombre}".`);
  const idx = Math.floor(Number(numeroCabeza)) - 1; // el usuario cuenta desde 1
  if (idx < 0 || idx >= search.heads.length) {
    return fail(`Numero de cabeza invalido. "${nombre}" tiene ${search.heads.length} cabeza(s).`);
  }
  const h = search.heads[idx];
  system.run(() => {
    try {
      const dim = world.getDimension(h.dim || "minecraft:overworld");
      player.teleport({ x: h.x + 0.5, y: h.y + 1, z: h.z + 0.5 }, { dimension: dim });
      player.sendMessage(`${PREFIX}§aTeletransportado a la cabeza §f#${idx + 1}§a de §f${search.name}§a.`);
    } catch (e) {
      player.sendMessage(`${PREFIX}§cNo pude teletransportarte: ${e}`);
    }
  });
  return ok(`Teletransportando a la cabeza #${idx + 1}...`);
}

// ----------------------------- registro -----------------------------

/**
 * Registra todos los comandos en el evento startup. Debe llamarse al inicio
 * (desde main.js). La firma de cada comando define nombre, permiso y parametros.
 */
export function registerCommands() {
  system.beforeEvents.startup.subscribe((init) => {
    const reg = init.customCommandRegistry;

    const P = CommandPermissionLevel.GameDirectors; // requiere operador/cheats
    const S = CustomCommandParamType.String;
    const I = CustomCommandParamType.Integer;

    reg.registerCommand(
      { name: "ts:create", description: "Crea una nueva busqueda.", permissionLevel: P, mandatoryParameters: [{ name: "nombre", type: S }] },
      cmdCreate
    );
    reg.registerCommand(
      { name: "ts:delete", description: "Elimina una busqueda existente.", permissionLevel: P, mandatoryParameters: [{ name: "nombre", type: S }] },
      cmdDelete
    );
    reg.registerCommand(
      { name: "ts:edit", description: "Abre el menu de edicion de una busqueda.", permissionLevel: P, mandatoryParameters: [{ name: "nombre", type: S }] },
      cmdEdit
    );
    reg.registerCommand(
      { name: "ts:set", description: "Coloca una cabeza oculta donde miras.", permissionLevel: P, mandatoryParameters: [{ name: "nombre", type: S }] },
      cmdSet
    );
    reg.registerCommand(
      {
        name: "ts:rename", description: "Renombra una busqueda.", permissionLevel: P,
        mandatoryParameters: [{ name: "nombre", type: S }, { name: "nuevo_nombre", type: S }]
      },
      cmdRename
    );
    reg.registerCommand(
      { name: "ts:list", description: "Lista todas las busquedas activas.", permissionLevel: P },
      cmdList
    );
    reg.registerCommand(
      {
        name: "ts:reset", description: "Reinicia el progreso de un jugador en una busqueda.", permissionLevel: P,
        mandatoryParameters: [{ name: "jugador", type: S }, { name: "nombre", type: S }]
      },
      cmdReset
    );
    reg.registerCommand(
      { name: "ts:rewards", description: "Configura las recompensas de una busqueda.", permissionLevel: P, mandatoryParameters: [{ name: "nombre", type: S }] },
      cmdRewards
    );
    reg.registerCommand(
      {
        name: "ts:tp", description: "Teletransporta a una cabeza concreta.", permissionLevel: P,
        mandatoryParameters: [{ name: "nombre", type: S }, { name: "numero_cabeza", type: I }]
      },
      cmdTp
    );

    console.warn("[The Search] Comandos /ts:* registrados.");
  });
}
