/**
 * The Search v0.1 PE — main.js (entry point)
 * -------------------------------------------------------------
 * Add-on que recrea las mecanicas del plugin de Java "The Search" de ajneb97:
 * cabezas custom ocultas por el mapa que los jugadores deben encontrar, con
 * progreso por jugador, title/actionbar dinamico, particula custom 3D,
 * sonidos custom y un sistema completo de comandos /ts:* + interfaces UI.
 *
 * Estructura modular:
 *   config.js       -> constantes y catalogo de cabezas
 *   data.js         -> persistencia (dynamic properties) busquedas + progreso
 *   effects.js      -> title/actionbar, particula 3D, sonidos, bloques
 *   interaction.js  -> deteccion de hallazgo y entrega de recompensas
 *   ui.js           -> formularios (@minecraft/server-ui 2.x)
 *   commands.js     -> registro de los comandos custom /ts:* (API 1.21.100+)
 */

import { world } from "@minecraft/server";
import { PREFIX } from "./config.js";
import { registerCommands } from "./commands.js";
import { registerInteractionListeners } from "./interaction.js";

// 1) Los comandos deben registrarse en el evento startup -> se hace dentro.
registerCommands();

// 2) Listeners de interaccion (encontrar cabezas).
registerInteractionListeners();

// 3) Mensaje de bienvenida / ayuda al entrar al mundo.
world.afterEvents.playerSpawn.subscribe((ev) => {
  if (!ev.initialSpawn) return;
  const p = ev.player;
  p.sendMessage(`${PREFIX}§7The Search v2.0 PE cargado. Admins: §e/ts:create [nombre]§7, §e/ts:set [nombre]§7, §e/ts:edit [nombre]§7.`);
});

console.warn("[The Search] v2.0 PE inicializado correctamente.");
