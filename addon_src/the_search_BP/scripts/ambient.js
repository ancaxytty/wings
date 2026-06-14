/**
 * The Search v0.3 PE — ambient.js
 * -------------------------------------------------------------
 * Particulas ambientales tipo "antorcha" flotando sobre cada cabeza oculta,
 * como pista visual para los jugadores. Solo se generan para cabezas con un
 * jugador cerca (optimizacion) y con un tope por tick para evitar lag.
 */

import { world, system } from "@minecraft/server";
import {
  TORCH_INTERVAL_TICKS, TORCH_RENDER_DISTANCE, TORCH_MAX_PER_TICK
} from "./config.js";
import { loadDB, listSearches } from "./data.js";
import { spawnTorchAbove } from "./effects.js";

/** Distancia al cuadrado entre dos puntos (evita la raiz cuadrada). */
function dist2(a, bx, by, bz) {
  const dx = a.x - bx, dy = a.y - by, dz = a.z - bz;
  return dx * dx + dy * dy + dz * dz;
}

/** Arranca el bucle de particulas-antorcha sobre las cabezas. */
export function startAmbientTorches() {
  system.runInterval(() => {
    const players = world.getAllPlayers();
    if (players.length === 0) return;

    const maxD2 = TORCH_RENDER_DISTANCE * TORCH_RENDER_DISTANCE;
    let processed = 0;

    for (const search of listSearches(loadDB())) {
      for (const head of search.heads) {
        if (processed >= TORCH_MAX_PER_TICK) return;
        const dimId = head.dim || "minecraft:overworld";

        // ¿Hay algun jugador cerca, en la misma dimension?
        let near = false;
        for (const p of players) {
          if (p.dimension.id !== dimId) continue;
          if (dist2(p.location, head.x + 0.5, head.y + 0.5, head.z + 0.5) <= maxD2) {
            near = true;
            break;
          }
        }
        if (!near) continue;

        try {
          const dim = world.getDimension(dimId);
          spawnTorchAbove(dim, head);
          processed++;
        } catch (e) {}
      }
    }
  }, TORCH_INTERVAL_TICKS);
}
