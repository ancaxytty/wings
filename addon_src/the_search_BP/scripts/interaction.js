/**
 * The Search v0.1 PE — interaction.js
 * -------------------------------------------------------------
 * Logica de interaccion: detecta cuando un jugador toca/interactua con
 * una cabeza oculta, verifica el progreso (dynamic properties por jugador),
 * lo actualiza, envia el title/actionbar, genera la particula 3D, reproduce
 * el sonido custom y entrega recompensas al completar.
 */

import { world, system } from "@minecraft/server";
import { HEAD_BLOCK_ID, HEAD_CATALOG, DEFAULT_TITLE, DEFAULT_SUBTITLE, PREFIX, clampSkin, colorCode } from "./config.js";
import { loadDB, listSearches, markFound } from "./data.js";
import {
  showTitle, actionBar, applyTemplate,
  spawnFoundParticles, playFoundSound, playCompleteSound
} from "./effects.js";

/**
 * Busca a que busqueda + indice pertenece una cabeza situada en unas
 * coordenadas de bloque concretas. Devuelve { search, index, head } o null.
 */
export function findHeadAt(x, y, z, dimId) {
  for (const search of listSearches(loadDB())) {
    for (let i = 0; i < search.heads.length; i++) {
      const h = search.heads[i];
      if (h.x === x && h.y === y && h.z === z && (h.dim || "minecraft:overworld") === dimId) {
        return { search, index: i, head: h };
      }
    }
  }
  return null;
}

/** Devuelve el nombre legible de una cabeza segun su skin. */
function headName(head) {
  return HEAD_CATALOG[clampSkin(head.skin)].name;
}

/**
 * Procesa el "hallazgo" de una cabeza por parte de un jugador.
 * Devuelve true si la posicion correspondia a una cabeza registrada.
 */
export function processFind(player, block) {
  const loc = block.location; // coords enteras del bloque
  const match = findHeadAt(loc.x, loc.y, loc.z, block.dimension.id);
  if (!match) return false;

  const { search, index, head } = match;
  const total = search.heads.length;

  // Verifica/actualiza el progreso del jugador (dynamic property por jugador).
  const { added, foundCount } = markFound(player, search, index);

  if (!added) {
    // Ya la habia encontrado: solo recordatorio sutil, sin spamear efectos.
    actionBar(player, `§7Ya encontraste §f${headName(head)}§7 (${foundCount}/${total})`);
    return true;
  }

  // --- Feedback al encontrar una cabeza nueva ---
  const center = { x: loc.x + 0.5, y: loc.y, z: loc.z + 0.5 };
  spawnFoundParticles(block.dimension, center, head.skin);
  playFoundSound(player);

  const ctx = {
    found: foundCount,
    total,
    head: headName(head),
    search: search.name,
    player: player.name
  };
  showTitle(
    player,
    applyTemplate(search.title || DEFAULT_TITLE, ctx),
    applyTemplate(search.subtitle || DEFAULT_SUBTITLE, ctx)
  );
  const cat = HEAD_CATALOG[clampSkin(head.skin)];
  player.sendMessage(`${PREFIX}§a¡Conseguiste §${colorCode(cat.color)}${cat.name}§a! §7(${foundCount}/${total})`);

  // --- Completada la busqueda entera ---
  if (foundCount >= total && total > 0) {
    completeSearch(player, search);
  }
  return true;
}

/** Logica al completar el 100% de una busqueda: sonido epico + recompensas. */
function completeSearch(player, search) {
  showTitle(player, "§6§l¡BUSQUEDA COMPLETADA!", `§e${search.name}§7 · §a¡todas las cabezas!`);
  playCompleteSound(player);
  world.sendMessage(`${PREFIX}§e${player.name}§a completo la busqueda §${colorCode(search.color)}${search.name}§a!`);

  // Entrega de recompensas (lista de comandos configurada en /ts:rewards).
  const rewards = Array.isArray(search.rewards) ? search.rewards : [];
  for (const cmd of rewards) {
    const command = String(cmd || "").trim();
    if (!command.length) continue;
    try {
      // Se ejecuta como el jugador para que @s lo referencie.
      player.runCommand(command);
    } catch (e) {
      console.warn(`[The Search] Recompensa fallida "${command}": ${e}`);
    }
  }
}

/**
 * Registra el listener de interaccion. Se llama una vez desde main.js.
 * Usamos afterEvents.playerInteractWithBlock (clic derecho / toque) y
 * tambien capturamos el golpe inicial como alternativa de "tocar".
 */
export function registerInteractionListeners() {
  // Interaccion (clic derecho / toque) con el bloque-cabeza.
  world.afterEvents.playerInteractWithBlock.subscribe((ev) => {
    const { player, block } = ev;
    if (!block || block.typeId !== HEAD_BLOCK_ID) return;
    try {
      processFind(player, block);
    } catch (e) {
      console.warn(`[The Search] Error en interaccion: ${e}`);
    }
  });

  // Alternativa: golpear la cabeza tambien cuenta como "tocarla" (sin romperla).
  world.beforeEvents.playerBreakBlock.subscribe((ev) => {
    const { player, block } = ev;
    if (!block || block.typeId !== HEAD_BLOCK_ID) return;
    // Cancelamos la rotura: la cabeza permanece oculta para otros jugadores.
    ev.cancel = true;
    system.run(() => {
      try {
        processFind(player, block);
      } catch (e) {
        console.warn(`[The Search] Error al golpear: ${e}`);
      }
    });
  });
}
