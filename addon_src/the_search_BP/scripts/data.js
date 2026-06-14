/**
 * The Search v0.1 PE — data.js
 * -------------------------------------------------------------
 * Capa de persistencia con Dynamic Properties.
 *   - Las BUSQUEDAS se guardan en una propiedad GLOBAL del mundo (DB_KEY).
 *   - El PROGRESO se guarda POR JUGADOR (PROGRESS_KEY) para que cada jugador
 *     descubra las cabezas de forma independiente (igual que el plugin de Java).
 *
 * Modelo de datos de una busqueda:
 * {
 *   key: "halloween",        // identificador interno (nombre en minusculas)
 *   name: "Halloween",       // nombre visible
 *   color: "6",              // color del nombre (§x)
 *   defaultSkin: 0,          // skin usado por /ts:set
 *   defaultSize: 1,          // tamano usado por /ts:set
 *   title: "...",            // plantilla de title
 *   subtitle: "...",         // plantilla de subtitle
 *   rewards: ["give @s ...", "say ..."], // comandos al completar
 *   heads: [ { x, y, z, dim, skin, size }, ... ]
 * }
 */

import { world } from "@minecraft/server";
import {
  DB_KEY, PROGRESS_KEY, DEFAULT_TITLE, DEFAULT_SUBTITLE,
  clampSkin, clampSize, colorCode
} from "./config.js";

// ----------------------------- busquedas (global) -----------------------------

/** Carga el mapa completo de busquedas desde la dynamic property global. */
export function loadDB() {
  const raw = world.getDynamicProperty(DB_KEY);
  if (typeof raw !== "string" || raw.length === 0) return {};
  try {
    return JSON.parse(raw);
  } catch (e) {
    return {};
  }
}

/** Guarda el mapa completo de busquedas. */
export function saveDB(db) {
  world.setDynamicProperty(DB_KEY, JSON.stringify(db));
}

/** Normaliza un nombre a su clave interna (minusculas, sin espacios extra). */
export function toKey(name) {
  return String(name || "").trim().toLowerCase();
}

/** Devuelve un array con todas las busquedas. */
export function listSearches(db = loadDB()) {
  return Object.keys(db).map((k) => db[k]);
}

/** Obtiene una busqueda por nombre o clave (o null si no existe). */
export function getSearch(name, db = loadDB()) {
  return db[toKey(name)] || null;
}

/**
 * Crea una nueva busqueda. Devuelve { ok, search, error }.
 */
export function createSearch(name) {
  const key = toKey(name);
  if (!key) return { ok: false, error: "El nombre no puede estar vacio." };
  const db = loadDB();
  if (db[key]) return { ok: false, error: `Ya existe una busqueda llamada "${name}".` };
  const search = {
    key,
    name: String(name).trim(),
    color: "e",
    defaultSkin: 0,
    defaultSize: 1,
    title: DEFAULT_TITLE,
    subtitle: DEFAULT_SUBTITLE,
    rewards: [],
    heads: []
  };
  db[key] = search;
  saveDB(db);
  return { ok: true, search };
}

/** Elimina una busqueda por nombre. Devuelve { ok, error }. */
export function deleteSearch(name) {
  const key = toKey(name);
  const db = loadDB();
  if (!db[key]) return { ok: false, error: `No existe la busqueda "${name}".` };
  delete db[key];
  saveDB(db);
  return { ok: true };
}

/** Renombra una busqueda. Devuelve { ok, error }. */
export function renameSearch(oldName, newName) {
  const db = loadDB();
  const oldKey = toKey(oldName);
  const newKey = toKey(newName);
  if (!db[oldKey]) return { ok: false, error: `No existe la busqueda "${oldName}".` };
  if (!newKey) return { ok: false, error: "El nuevo nombre no puede estar vacio." };
  if (db[newKey] && newKey !== oldKey) return { ok: false, error: `Ya existe "${newName}".` };
  const search = db[oldKey];
  delete db[oldKey];
  search.key = newKey;
  search.name = String(newName).trim();
  db[newKey] = search;
  saveDB(db);
  return { ok: true, search };
}

/** Anade una cabeza (coordenadas de bloque) a una busqueda. */
export function addHead(search, x, y, z, dim, skin, size) {
  search.heads.push({
    x: Math.floor(x),
    y: Math.floor(y),
    z: Math.floor(z),
    dim,
    skin: clampSkin(skin),
    size: clampSize(size)
  });
  persist(search);
  return search.heads.length;
}

/** Persiste los cambios de una unica busqueda dentro del mapa global. */
export function persist(search) {
  const db = loadDB();
  db[search.key] = search;
  saveDB(db);
}

/** Aplica saneamiento de campos editables de una busqueda. */
export function updateSearchMeta(search, { color, defaultSkin, defaultSize, title, subtitle }) {
  if (color !== undefined) search.color = colorCode(color);
  if (defaultSkin !== undefined) search.defaultSkin = clampSkin(defaultSkin);
  if (defaultSize !== undefined) search.defaultSize = clampSize(defaultSize);
  if (title !== undefined) search.title = String(title).length ? String(title) : DEFAULT_TITLE;
  if (subtitle !== undefined) search.subtitle = String(subtitle).length ? String(subtitle) : DEFAULT_SUBTITLE;
  persist(search);
}

// ----------------------------- progreso (por jugador) -----------------------------

/** Lee el objeto de progreso de un jugador: { [searchKey]: number[] (indices). } */
export function loadProgress(player) {
  const raw = player.getDynamicProperty(PROGRESS_KEY);
  if (typeof raw !== "string" || raw.length === 0) return {};
  try {
    return JSON.parse(raw);
  } catch (e) {
    return {};
  }
}

/** Guarda el objeto de progreso completo de un jugador. */
export function saveProgress(player, progress) {
  player.setDynamicProperty(PROGRESS_KEY, JSON.stringify(progress));
}

/** Devuelve el array de indices de cabezas que el jugador ya encontro. */
export function getFoundIndexes(player, search) {
  const progress = loadProgress(player);
  const arr = progress[search.key];
  return Array.isArray(arr) ? arr : [];
}

/**
 * Marca una cabeza (por indice) como encontrada para un jugador.
 * Devuelve { added, foundCount } donde added=false si ya estaba.
 */
export function markFound(player, search, index) {
  const progress = loadProgress(player);
  const arr = Array.isArray(progress[search.key]) ? progress[search.key] : [];
  if (arr.includes(index)) {
    return { added: false, foundCount: arr.length };
  }
  arr.push(index);
  progress[search.key] = arr;
  saveProgress(player, progress);
  return { added: true, foundCount: arr.length };
}

/** Reinicia el progreso de un jugador en una busqueda concreta. */
export function resetProgress(player, search) {
  const progress = loadProgress(player);
  delete progress[search.key];
  saveProgress(player, progress);
}
