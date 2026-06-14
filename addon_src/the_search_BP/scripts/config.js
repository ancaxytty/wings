/**
 * The Search v0.1 PE — config.js
 * -------------------------------------------------------------
 * Constantes globales del add-on: identificadores de bloques,
 * particulas, sonidos, catalogo de cabezas y textos por defecto.
 * Centralizar todo aqui evita "numeros magicos" repartidos por el codigo.
 */

// Identificador del bloque-cabeza custom (definido en blocks/head.json).
export const HEAD_BLOCK_ID = "wings:head";

// Estados de bloque que controlan el skin (0-15) y el tamano (0-3).
export const STATE_SKIN = "wings:skin";
export const STATE_SIZE = "wings:size";

// Particula custom 3D que se invoca al encontrar una cabeza.
export const PARTICLE_FOUND = "ts:found";

// Sonidos custom registrados en sounds/sound_definitions.json del RP.
export const SOUND_FOUND = "ts.found";       // al encontrar 1 cabeza
export const SOUND_COMPLETE = "ts.complete"; // al completar la busqueda

// Clave de la dynamic property global del mundo donde guardamos las busquedas.
export const DB_KEY = "ts:searches";

// Clave de la dynamic property por jugador donde guardamos su progreso.
export const PROGRESS_KEY = "ts:progress";

// Etiqueta (tag) usada para distinguir administradores (opcional, ademas
// del permission_level de los comandos).
export const ADMIN_TAG = "ts_admin";

// Dimensiones donde pueden existir cabezas.
export const DIMENSIONS = ["minecraft:overworld", "minecraft:nether", "minecraft:the_end"];

// Prefijo de mensajes en chat.
export const PREFIX = "§6[The Search]§r ";

/**
 * Catalogo de 16 cabezas. El indice = estado "wings:skin".
 * color: codigo de color Bedrock (§x). rgb: tinte de la particula 3D.
 */
export const HEAD_CATALOG = [
  { name: "Halloween",       color: "6", rgb: [0.90, 0.52, 0.12] },
  { name: "Navidad",         color: "a", rgb: [0.29, 0.66, 0.34] },
  { name: "Santa",           color: "c", rgb: [0.83, 0.18, 0.20] },
  { name: "Frozen",          color: "b", rgb: [0.47, 0.71, 0.93] },
  { name: "Olaf",            color: "f", rgb: [0.93, 0.95, 0.97] },
  { name: "Fantasma",        color: "7", rgb: [0.80, 0.83, 0.88] },
  { name: "Esqueleto",       color: "f", rgb: [0.86, 0.88, 0.92] },
  { name: "Reno",            color: "6", rgb: [0.55, 0.36, 0.20] },
  { name: "Muneco de Nieve", color: "b", rgb: [0.72, 0.82, 0.96] },
  { name: "Regalo",          color: "c", rgb: [0.85, 0.20, 0.24] },
  { name: "Zombie",          color: "2", rgb: [0.32, 0.68, 0.36] },
  { name: "Bruja",           color: "5", rgb: [0.58, 0.34, 0.74] },
  { name: "Master Chief",    color: "2", rgb: [0.32, 0.45, 0.28] },
  { name: "God of War",      color: "c", rgb: [0.72, 0.20, 0.18] },
  { name: "Gears of War",    color: "4", rgb: [0.55, 0.12, 0.12] },
  { name: "Bob Esponja",     color: "e", rgb: [0.96, 0.86, 0.28] }
];

// Nombres legibles de los 4 tamanos (estado wings:size).
export const SIZE_NAMES = ["Pequena", "Normal", "Grande", "Gigante"];

// Plantillas por defecto del title / subtitle al encontrar una cabeza.
// Placeholders soportados: {found} {total} {head} {search} {player}
export const DEFAULT_TITLE = "§a¡Conseguiste {found}/{total} cabezas!";
export const DEFAULT_SUBTITLE = "§7Encontraste §f{head}§7 en §e{search}";

// Iconos de textura para los botones de los formularios (en el RP).
export const ICONS = {
  create: "textures/custom_ui/icon_create",
  review: "textures/custom_ui/icon_review",
  help: "textures/custom_ui/icon_help",
  place: "textures/custom_ui/icon_place",
  reload: "textures/custom_ui/icon_reload",
  delete: "textures/custom_ui/icon_delete",
  wand: "textures/custom_ui/icon_wand"
};

/** Devuelve la ruta del icono de cabeza para la galeria de la UI. */
export function headIcon(skin) {
  return `textures/custom_ui/heads/h${clampSkin(skin)}`;
}

/** Limita el skin al rango valido del catalogo. */
export function clampSkin(n) {
  n = Math.floor(Number(n));
  if (!Number.isFinite(n) || n < 0) return 0;
  if (n > HEAD_CATALOG.length - 1) return HEAD_CATALOG.length - 1;
  return n;
}

/** Limita el tamano al rango 0-3 (por defecto Normal = 1). */
export function clampSize(n) {
  n = Math.floor(Number(n));
  return Number.isFinite(n) && n >= 0 && n <= 3 ? n : 1;
}

/** Valida un codigo de color Bedrock de 1 caracter (0-9, a-f). */
export function colorCode(c) {
  const ok = "0123456789abcdef";
  if (typeof c !== "string" || c.length !== 1 || !ok.includes(c.toLowerCase())) return "e";
  return c.toLowerCase();
}
