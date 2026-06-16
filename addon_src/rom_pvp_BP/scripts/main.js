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
 * ROOM PvP Zones v0.2.0
 * ===========================================================================
 * - Zonas PvP 1v1 / 2v2 / 3v3. pos1/pos2 (Varita Nether) definen la zona.
 * - PAREDES AUTOMÁTICAS: cuando entran los jugadores necesarios, se construyen
 *   solas (cristal) y se quitan al terminar el combate.
 * - DENTRO de la zona: NO se rompe ningún bloque, NO se construye...
 *   solo se pueden poner LANAS y TELAS (wool + carpet). La room no se rompe.
 * - 15 comandos custom /room: (create, delete, edit, rename, info, list, tp,
 *   protect, start, stop, setsize, wand, menu, language, help).
 * - Multi-idioma: es, en, fr, pt, de, zh (/room:language).
 */

// ----------------------------------------------------------------- constantes
const NS = "room";
const ZONES_KEY = "room:zones";
const SEL_KEY = "room:sel";
const LANG_KEY = "room:lang";
const ADMIN_TAG = "room_admin";
const ZONE_WAND = "room:zone_wand";
const SIZES = ["1v1", "2v2", "3v3"];
const LANGS = ["es", "en", "fr", "pt", "de", "zh"];
const PER_TEAM = { "1v1": 1, "2v2": 2, "3v3": 3 };
const WALL_BLOCK = "minecraft:glass";
const PREFIX = "§8[§cROOM§6PvP§8]§r ";

let zonesCache = null;
let worldLang = null;
const selCache = new Map();

// ----------------------------------------------------------------- idiomas
const T = {
  es: {
    only_players: "Solo los jugadores pueden usar esto.",
    no_perm: "Sin permiso (necesitas tag room_admin o ser OP).",
    wand_got: "§aRecibiste la §5Varita Nether§a (pos1/pos2).",
    pos_set: "§d{0} §7definida: §f{1}, {2}, {3}",
    need_sel: "§cFalta selección. Varita Nether: §eizq§c=pos1, §eder§c=pos2.",
    diff_dim: "§cpos1 y pos2 deben estar en la misma dimensión.",
    name_req: "§cDebes indicar un nombre.",
    name_long: "§cNombre demasiado largo (máx 24).",
    exists: "§cYa existe una zona llamada §e{0}§c.",
    created: "§a✔ Zona §e{0} §acreada §7(§f{1}§7, §f{2}§7 bloques).",
    notfound: "§cNo existe la zona §e{0}§c.",
    deleted: "§a✔ Zona §e{0} §aeliminada.",
    renamed: "§a✔ §e{0} §aahora se llama §e{1}§a.",
    size_set: "§a✔ Modo de §e{0} §acambiado a §b{1}§a.",
    edited: "§a✔ Área de §e{0} §aactualizada a la selección actual.",
    prot_on: "§7Protección de §e{0}§7: §aACTIVADA",
    prot_off: "§7Protección de §e{0}§7: §cDESACTIVADA",
    only_cloth: "§c⛔ Aquí solo puedes poner §flanas y telas§c.",
    no_break: "§c⛔ No puedes romper bloques en §e{0}§c.",
    match_start: "§6⚔ ¡Combate en §e{0}§6! Paredes activadas.",
    match_end: "§a✔ Combate terminado en §e{0}§a. Paredes retiradas.",
    lang_set: "§a✔ Idioma cambiado a §e{0}§a.",
    in_zone: "§c⚔ §eZona PvP: §f{0} §8(§b{1}§8)",
    tp_done: "§aTeletransportado a §e{0}§a.",
    tp_fail: "§cNo se pudo teletransportar.",
    list_none: "§7No hay zonas creadas todavía.",
    list_header: "§6Zonas: §f{0}",
    menu_title: "§l§cROOM §6PvP Zones",
    menu_body: "§7Zonas: §f{0}\n§7Elige una acción:",
    b_create: "§aCrear zona",
    b_list: "§bMis zonas / Info",
    b_delete: "§cEliminar zona",
    b_wand: "§eObtener varita",
    b_sel: "§dVer selección",
    b_lang: "§9Idioma",
    b_help: "§7Ayuda",
    b_tp: "§bTeletransportarme",
    b_prot: "§6Protección on/off",
    b_back: "§7Volver",
    b_close: "§7Cerrar",
    b_confirm: "§cSí, eliminar",
    b_cancel: "§7Cancelar",
    f_create_title: "§l§aCrear zona PvP",
    f_name: "§eNombre de la zona",
    f_size: "§bModo de combate",
    f_sel: "Selección",
    confirm_title: "§cConfirmar",
    confirm_body: "§7¿Eliminar la zona §e{0}§7?",
    sel_title: "§l§dTu selección",
    lang_title: "§l§9Idioma / Language",
    help_title: "§l§7Ayuda · ROOM PvP",
    help_body:
      "§61) §f/room:wand §7para la varita.\n§62) Varita Nether: §eizq§7=pos1, §eder§7=pos2.\n§63) §f/room:create <nombre> <1v1|2v2|3v3>\n\n§aLas paredes se construyen solas cuando entran\n§alos jugadores. Dentro NO se rompe nada y solo\n§ase pueden poner §flanas y telas§a.\n\n§eComandos: create delete edit rename info list\n§etp protect start stop setsize wand menu language",
  },
  en: {
    only_players: "Only players can use this.",
    no_perm: "No permission (need room_admin tag or be OP).",
    wand_got: "§aYou received the §5Nether Wand§a (pos1/pos2).",
    pos_set: "§d{0} §7set: §f{1}, {2}, {3}",
    need_sel: "§cMissing selection. Nether Wand: §eleft§c=pos1, §eright§c=pos2.",
    diff_dim: "§cpos1 and pos2 must be in the same dimension.",
    name_req: "§cYou must provide a name.",
    name_long: "§cName too long (max 24).",
    exists: "§cA zone named §e{0} §calready exists.",
    created: "§a✔ Zone §e{0} §acreated §7(§f{1}§7, §f{2}§7 blocks).",
    notfound: "§cZone §e{0} §cdoes not exist.",
    deleted: "§a✔ Zone §e{0} §adeleted.",
    renamed: "§a✔ §e{0} §ais now named §e{1}§a.",
    size_set: "§a✔ Mode of §e{0} §achanged to §b{1}§a.",
    edited: "§a✔ Area of §e{0} §aupdated to current selection.",
    prot_on: "§7Protection of §e{0}§7: §aON",
    prot_off: "§7Protection of §e{0}§7: §cOFF",
    only_cloth: "§c⛔ Here you can only place §fwool and carpet§c.",
    no_break: "§c⛔ You can't break blocks in §e{0}§c.",
    match_start: "§6⚔ Fight in §e{0}§6! Walls up.",
    match_end: "§a✔ Fight ended in §e{0}§a. Walls removed.",
    lang_set: "§a✔ Language changed to §e{0}§a.",
    in_zone: "§c⚔ §ePvP Zone: §f{0} §8(§b{1}§8)",
    tp_done: "§aTeleported to §e{0}§a.",
    tp_fail: "§cCould not teleport.",
    list_none: "§7No zones created yet.",
    list_header: "§6Zones: §f{0}",
    menu_title: "§l§cROOM §6PvP Zones",
    menu_body: "§7Zones: §f{0}\n§7Choose an action:",
    b_create: "§aCreate zone",
    b_list: "§bMy zones / Info",
    b_delete: "§cDelete zone",
    b_wand: "§eGet wand",
    b_sel: "§dView selection",
    b_lang: "§9Language",
    b_help: "§7Help",
    b_tp: "§bTeleport me",
    b_prot: "§6Protection on/off",
    b_back: "§7Back",
    b_close: "§7Close",
    b_confirm: "§cYes, delete",
    b_cancel: "§7Cancel",
    f_create_title: "§l§aCreate PvP zone",
    f_name: "§eZone name",
    f_size: "§bCombat mode",
    f_sel: "Selection",
    confirm_title: "§cConfirm",
    confirm_body: "§7Delete zone §e{0}§7?",
    sel_title: "§l§dYour selection",
    lang_title: "§l§9Language",
    help_title: "§l§7Help · ROOM PvP",
    help_body:
      "§61) §f/room:wand §7for the wand.\n§62) Nether Wand: §eleft§7=pos1, §eright§7=pos2.\n§63) §f/room:create <name> <1v1|2v2|3v3>\n\n§aWalls build automatically when players enter.\n§aInside, nothing can be broken and you can only\n§aplace §fwool and carpet§a.\n\n§eCommands: create delete edit rename info list\n§etp protect start stop setsize wand menu language",
  },
  fr: {
    only_players: "Seuls les joueurs peuvent utiliser ceci.",
    no_perm: "Pas de permission (tag room_admin ou OP requis).",
    wand_got: "§aVous avez reçu la §5Baguette Nether§a (pos1/pos2).",
    pos_set: "§d{0} §7définie: §f{1}, {2}, {3}",
    need_sel: "§cSélection manquante. Baguette: §egauche§c=pos1, §edroite§c=pos2.",
    diff_dim: "§cpos1 et pos2 doivent être dans la même dimension.",
    name_req: "§cVous devez indiquer un nom.",
    name_long: "§cNom trop long (max 24).",
    exists: "§cUne zone nommée §e{0} §cexiste déjà.",
    created: "§a✔ Zone §e{0} §acréée §7(§f{1}§7, §f{2}§7 blocs).",
    notfound: "§cLa zone §e{0} §cn'existe pas.",
    deleted: "§a✔ Zone §e{0} §asupprimée.",
    renamed: "§a✔ §e{0} §as'appelle maintenant §e{1}§a.",
    size_set: "§a✔ Mode de §e{0} §achangé en §b{1}§a.",
    edited: "§a✔ Zone §e{0} §amise à jour avec la sélection.",
    prot_on: "§7Protection de §e{0}§7: §aACTIVÉE",
    prot_off: "§7Protection de §e{0}§7: §cDÉSACTIVÉE",
    only_cloth: "§c⛔ Ici vous ne pouvez poser que §flaine et tapis§c.",
    no_break: "§c⛔ Vous ne pouvez pas casser de blocs dans §e{0}§c.",
    match_start: "§6⚔ Combat dans §e{0}§6! Murs activés.",
    match_end: "§a✔ Combat terminé dans §e{0}§a. Murs retirés.",
    lang_set: "§a✔ Langue changée en §e{0}§a.",
    in_zone: "§c⚔ §eZone PvP: §f{0} §8(§b{1}§8)",
    tp_done: "§aTéléporté vers §e{0}§a.",
    tp_fail: "§cTéléportation impossible.",
    list_none: "§7Aucune zone créée pour l'instant.",
    list_header: "§6Zones: §f{0}",
    menu_title: "§l§cROOM §6PvP Zones",
    menu_body: "§7Zones: §f{0}\n§7Choisissez une action:",
    b_create: "§aCréer une zone",
    b_list: "§bMes zones / Info",
    b_delete: "§cSupprimer une zone",
    b_wand: "§eObtenir la baguette",
    b_sel: "§dVoir la sélection",
    b_lang: "§9Langue",
    b_help: "§7Aide",
    b_tp: "§bMe téléporter",
    b_prot: "§6Protection on/off",
    b_back: "§7Retour",
    b_close: "§7Fermer",
    b_confirm: "§cOui, supprimer",
    b_cancel: "§7Annuler",
    f_create_title: "§l§aCréer une zone PvP",
    f_name: "§eNom de la zone",
    f_size: "§bMode de combat",
    f_sel: "Sélection",
    confirm_title: "§cConfirmer",
    confirm_body: "§7Supprimer la zone §e{0}§7?",
    sel_title: "§l§dVotre sélection",
    lang_title: "§l§9Langue",
    help_title: "§l§7Aide · ROOM PvP",
    help_body:
      "§61) §f/room:wand §7pour la baguette.\n§62) Baguette: §egauche§7=pos1, §edroite§7=pos2.\n§63) §f/room:create <nom> <1v1|2v2|3v3>\n\n§aLes murs se construisent automatiquement.\n§aRien ne peut être cassé, seuls §flaine et tapis§a\n§apeuvent être posés.",
  },
  pt: {
    only_players: "Apenas jogadores podem usar isto.",
    no_perm: "Sem permissão (precisa da tag room_admin ou ser OP).",
    wand_got: "§aVocê recebeu a §5Varinha Nether§a (pos1/pos2).",
    pos_set: "§d{0} §7definida: §f{1}, {2}, {3}",
    need_sel: "§cFalta seleção. Varinha: §eesq§c=pos1, §edir§c=pos2.",
    diff_dim: "§cpos1 e pos2 devem estar na mesma dimensão.",
    name_req: "§cVocê deve indicar um nome.",
    name_long: "§cNome muito longo (máx 24).",
    exists: "§cJá existe uma zona chamada §e{0}§c.",
    created: "§a✔ Zona §e{0} §acriada §7(§f{1}§7, §f{2}§7 blocos).",
    notfound: "§cA zona §e{0} §cnão existe.",
    deleted: "§a✔ Zona §e{0} §aremovida.",
    renamed: "§a✔ §e{0} §aagora se chama §e{1}§a.",
    size_set: "§a✔ Modo de §e{0} §amudado para §b{1}§a.",
    edited: "§a✔ Área de §e{0} §aatualizada com a seleção.",
    prot_on: "§7Proteção de §e{0}§7: §aATIVADA",
    prot_off: "§7Proteção de §e{0}§7: §cDESATIVADA",
    only_cloth: "§c⛔ Aqui só pode colocar §flã e tapete§c.",
    no_break: "§c⛔ Você não pode quebrar blocos em §e{0}§c.",
    match_start: "§6⚔ Combate em §e{0}§6! Paredes ativadas.",
    match_end: "§a✔ Combate terminado em §e{0}§a. Paredes removidas.",
    lang_set: "§a✔ Idioma alterado para §e{0}§a.",
    in_zone: "§c⚔ §eZona PvP: §f{0} §8(§b{1}§8)",
    tp_done: "§aTeleportado para §e{0}§a.",
    tp_fail: "§cNão foi possível teleportar.",
    list_none: "§7Nenhuma zona criada ainda.",
    list_header: "§6Zonas: §f{0}",
    menu_title: "§l§cROOM §6PvP Zones",
    menu_body: "§7Zonas: §f{0}\n§7Escolha uma ação:",
    b_create: "§aCriar zona",
    b_list: "§bMinhas zonas / Info",
    b_delete: "§cRemover zona",
    b_wand: "§eObter varinha",
    b_sel: "§dVer seleção",
    b_lang: "§9Idioma",
    b_help: "§7Ajuda",
    b_tp: "§bTeleportar-me",
    b_prot: "§6Proteção on/off",
    b_back: "§7Voltar",
    b_close: "§7Fechar",
    b_confirm: "§cSim, remover",
    b_cancel: "§7Cancelar",
    f_create_title: "§l§aCriar zona PvP",
    f_name: "§eNome da zona",
    f_size: "§bModo de combate",
    f_sel: "Seleção",
    confirm_title: "§cConfirmar",
    confirm_body: "§7Remover a zona §e{0}§7?",
    sel_title: "§l§dSua seleção",
    lang_title: "§l§9Idioma",
    help_title: "§l§7Ajuda · ROOM PvP",
    help_body:
      "§61) §f/room:wand §7para a varinha.\n§62) Varinha: §eesq§7=pos1, §edir§7=pos2.\n§63) §f/room:create <nome> <1v1|2v2|3v3>\n\n§aAs paredes se constroem automaticamente.\n§aNada pode ser quebrado, só §flã e tapete§a.",
  },
  de: {
    only_players: "Nur Spieler können dies nutzen.",
    no_perm: "Keine Berechtigung (Tag room_admin oder OP nötig).",
    wand_got: "§aDu hast den §5Nether-Zauberstab§a erhalten (pos1/pos2).",
    pos_set: "§d{0} §7gesetzt: §f{1}, {2}, {3}",
    need_sel: "§cAuswahl fehlt. Zauberstab: §elinks§c=pos1, §erechts§c=pos2.",
    diff_dim: "§cpos1 und pos2 müssen in derselben Dimension sein.",
    name_req: "§cDu musst einen Namen angeben.",
    name_long: "§cName zu lang (max 24).",
    exists: "§cEine Zone namens §e{0} §cexistiert bereits.",
    created: "§a✔ Zone §e{0} §aerstellt §7(§f{1}§7, §f{2}§7 Blöcke).",
    notfound: "§cZone §e{0} §cexistiert nicht.",
    deleted: "§a✔ Zone §e{0} §agelöscht.",
    renamed: "§a✔ §e{0} §aheißt jetzt §e{1}§a.",
    size_set: "§a✔ Modus von §e{0} §azu §b{1} §ageändert.",
    edited: "§a✔ Bereich von §e{0} §aaktualisiert.",
    prot_on: "§7Schutz von §e{0}§7: §aAN",
    prot_off: "§7Schutz von §e{0}§7: §cAUS",
    only_cloth: "§c⛔ Hier kannst du nur §fWolle und Teppich§c platzieren.",
    no_break: "§c⛔ Du kannst in §e{0} §ckeine Blöcke abbauen.",
    match_start: "§6⚔ Kampf in §e{0}§6! Wände aktiviert.",
    match_end: "§a✔ Kampf beendet in §e{0}§a. Wände entfernt.",
    lang_set: "§a✔ Sprache geändert zu §e{0}§a.",
    in_zone: "§c⚔ §ePvP-Zone: §f{0} §8(§b{1}§8)",
    tp_done: "§aTeleportiert zu §e{0}§a.",
    tp_fail: "§cTeleport fehlgeschlagen.",
    list_none: "§7Noch keine Zonen erstellt.",
    list_header: "§6Zonen: §f{0}",
    menu_title: "§l§cROOM §6PvP Zones",
    menu_body: "§7Zonen: §f{0}\n§7Wähle eine Aktion:",
    b_create: "§aZone erstellen",
    b_list: "§bMeine Zonen / Info",
    b_delete: "§cZone löschen",
    b_wand: "§eZauberstab holen",
    b_sel: "§dAuswahl ansehen",
    b_lang: "§9Sprache",
    b_help: "§7Hilfe",
    b_tp: "§bTeleportieren",
    b_prot: "§6Schutz an/aus",
    b_back: "§7Zurück",
    b_close: "§7Schließen",
    b_confirm: "§cJa, löschen",
    b_cancel: "§7Abbrechen",
    f_create_title: "§l§aPvP-Zone erstellen",
    f_name: "§eZonenname",
    f_size: "§bKampfmodus",
    f_sel: "Auswahl",
    confirm_title: "§cBestätigen",
    confirm_body: "§7Zone §e{0} §7löschen?",
    sel_title: "§l§dDeine Auswahl",
    lang_title: "§l§9Sprache",
    help_title: "§l§7Hilfe · ROOM PvP",
    help_body:
      "§61) §f/room:wand §7für den Zauberstab.\n§62) Zauberstab: §elinks§7=pos1, §erechts§7=pos2.\n§63) §f/room:create <name> <1v1|2v2|3v3>\n\n§aWände bauen sich automatisch.\n§aNichts kann abgebaut werden, nur §fWolle/Teppich§a.",
  },
  zh: {
    only_players: "只有玩家可以使用此功能。",
    no_perm: "没有权限（需要 room_admin 标签或 OP）。",
    wand_got: "§a你获得了§5下界魔杖§a（pos1/pos2）。",
    pos_set: "§d{0} §7已设置：§f{1}, {2}, {3}",
    need_sel: "§c缺少选择。魔杖：§e左键§c=pos1，§e右键§c=pos2。",
    diff_dim: "§cpos1 和 pos2 必须在同一维度。",
    name_req: "§c你必须提供一个名称。",
    name_long: "§c名称太长（最多 24）。",
    exists: "§c已存在名为 §e{0} §c的区域。",
    created: "§a✔ 区域 §e{0} §a已创建 §7(§f{1}§7, §f{2}§7 方块)。",
    notfound: "§c区域 §e{0} §c不存在。",
    deleted: "§a✔ 区域 §e{0} §a已删除。",
    renamed: "§a✔ §e{0} §a现已改名为 §e{1}§a。",
    size_set: "§a✔ §e{0} §a的模式已改为 §b{1}§a。",
    edited: "§a✔ §e{0} §a的区域已更新为当前选择。",
    prot_on: "§7§e{0} §7的保护：§a开启",
    prot_off: "§7§e{0} §7的保护：§c关闭",
    only_cloth: "§c⛔ 这里只能放置§f羊毛和地毯§c。",
    no_break: "§c⛔ 你不能在 §e{0} §c中破坏方块。",
    match_start: "§6⚔ §e{0} §6开始战斗！墙已生成。",
    match_end: "§a✔ §e{0} §a战斗结束。墙已移除。",
    lang_set: "§a✔ 语言已切换为 §e{0}§a。",
    in_zone: "§c⚔ §ePvP 区域：§f{0} §8(§b{1}§8)",
    tp_done: "§a已传送到 §e{0}§a。",
    tp_fail: "§c无法传送。",
    list_none: "§7还没有创建任何区域。",
    list_header: "§6区域：§f{0}",
    menu_title: "§l§cROOM §6PvP Zones",
    menu_body: "§7区域：§f{0}\n§7选择一个操作：",
    b_create: "§a创建区域",
    b_list: "§b我的区域 / 信息",
    b_delete: "§c删除区域",
    b_wand: "§e获取魔杖",
    b_sel: "§d查看选择",
    b_lang: "§9语言",
    b_help: "§7帮助",
    b_tp: "§b传送我",
    b_prot: "§6保护 开/关",
    b_back: "§7返回",
    b_close: "§7关闭",
    b_confirm: "§c是的，删除",
    b_cancel: "§7取消",
    f_create_title: "§l§a创建 PvP 区域",
    f_name: "§e区域名称",
    f_size: "§b战斗模式",
    f_sel: "选择",
    confirm_title: "§c确认",
    confirm_body: "§7删除区域 §e{0}§7？",
    sel_title: "§l§d你的选择",
    lang_title: "§l§9语言",
    help_title: "§l§7帮助 · ROOM PvP",
    help_body:
      "§61) §f/room:wand §7获取魔杖。\n§62) 魔杖：§e左§7=pos1，§e右§7=pos2。\n§63) §f/room:create <名称> <1v1|2v2|3v3>\n\n§a墙会在玩家进入时自动生成。\n§a里面不能破坏任何东西，只能放§f羊毛和地毯§a。",
  },
};

const LANG_NAMES = {
  es: "Español",
  en: "English",
  fr: "Français",
  pt: "Português",
  de: "Deutsch",
  zh: "中文",
};

function getLang() {
  if (worldLang !== null) return worldLang;
  try {
    const v = world.getDynamicProperty(LANG_KEY);
    worldLang = LANGS.includes(v) ? v : "es";
  } catch (e) {
    worldLang = "es";
  }
  return worldLang;
}

function t(key, ...args) {
  const lang = getLang();
  let s = (T[lang] && T[lang][key]) || T.en[key] || T.es[key] || key;
  for (let i = 0; i < args.length; i++) s = s.split("{" + i + "}").join(String(args[i]));
  return s;
}

// ----------------------------------------------------------------- utilidades
function log(msg) {
  try {
    console.warn(`[ROOM PvP] ${msg}`);
  } catch (e) {}
}

function tell(player, msg) {
  try {
    player.sendMessage(PREFIX + msg);
  } catch (e) {}
}

function actionbar(player, msg) {
  try {
    player.onScreenDisplay.setActionBar(msg);
  } catch (e) {}
}

function stripColors(s) {
  return String(s).replace(/§./g, "");
}

function canEdit(player) {
  try {
    return player.hasTag(ADMIN_TAG) || player.commandPermissionLevel > 0;
  } catch (e) {
    return false;
  }
}

function isPlayer(e) {
  return e && e.typeId === "minecraft:player";
}

// solo se pueden poner LANAS (wool) y TELAS (carpet)
function isCloth(typeId) {
  if (!typeId) return false;
  return (
    typeId === "minecraft:wool" ||
    typeId.endsWith("_wool") ||
    typeId === "minecraft:carpet" ||
    typeId.endsWith("_carpet")
  );
}

function loadZones() {
  if (zonesCache !== null) return zonesCache;
  try {
    const raw = world.getDynamicProperty(ZONES_KEY);
    zonesCache = typeof raw === "string" && raw.length ? JSON.parse(raw) : [];
    if (!Array.isArray(zonesCache)) zonesCache = [];
  } catch (e) {
    zonesCache = [];
  }
  return zonesCache;
}

function saveZones(zones) {
  zonesCache = zones;
  try {
    world.setDynamicProperty(ZONES_KEY, JSON.stringify(zones));
  } catch (e) {
    log("No se pudo guardar zonas: " + e);
  }
}

function getZone(name) {
  const n = String(name).toLowerCase();
  return loadZones().find((z) => z.name.toLowerCase() === n) || null;
}

function getSel(player) {
  if (selCache.has(player.id)) return selCache.get(player.id);
  let sel = { p1: null, p2: null };
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

function boxVolume(b) {
  return (b.max.x - b.min.x + 1) * (b.max.y - b.min.y + 1) * (b.max.z - b.min.z + 1);
}

function inBox(x, y, z, b) {
  return x >= b.min.x && x <= b.max.x && y >= b.min.y && y <= b.max.y && z >= b.min.z && z <= b.max.z;
}

function protectingZone(dim, x, y, z, zones) {
  for (const z0 of zones) {
    if (z0.dim !== dim || z0.protected === false) continue;
    if (inBox(x, y, z, z0.box)) return z0;
  }
  return null;
}

function zoneOf(dim, x, y, z, zones) {
  for (const z0 of zones) if (z0.dim === dim && inBox(x, y, z, z0.box)) return z0;
  return null;
}

function boxCenterTop(b) {
  return {
    x: Math.floor((b.min.x + b.max.x) / 2) + 0.5,
    y: b.max.y + 1,
    z: Math.floor((b.min.z + b.max.z) / 2) + 0.5,
  };
}

function wallTopY(b) {
  return Math.max(b.max.y, b.min.y + 3);
}

// ----------------------------------------------------------------- item
function makeWand() {
  const it = new ItemStack(ZONE_WAND, 1);
  it.nameTag = "§5§l✦ Varita Nether ✦";
  it.setLore([
    "§7Define el §dárea PvP§7.",
    "§eIzquierda §8» §dPos 1",
    "§eDerecha §8» §dPos 2",
    "§8» Crea con §f/room:create",
  ]);
  return it;
}

function giveWand(player) {
  try {
    const inv = player.getComponent("minecraft:inventory");
    if (inv && inv.container) inv.container.addItem(makeWand());
  } catch (e) {
    log("giveWand: " + e);
  }
}

// ----------------------------------------------------------------- paredes auto
function fillCmd(dim, x1, y1, z1, x2, y2, z2, block, replaceFilter) {
  try {
    const f = replaceFilter ? ` replace ${replaceFilter}` : "";
    dim.runCommand(`fill ${x1} ${y1} ${z1} ${x2} ${y2} ${z2} ${block}${f}`);
  } catch (e) {
    log("fill: " + e);
  }
}

function buildWalls(zone) {
  const dim = world.getDimension(zone.dim);
  const b = zone.box;
  const ty = wallTopY(b);
  // 4 muros verticales, solo reemplazando aire (no destruye lo que ya hay)
  fillCmd(dim, b.min.x, b.min.y, b.min.z, b.min.x, ty, b.max.z, WALL_BLOCK, "air");
  fillCmd(dim, b.max.x, b.min.y, b.min.z, b.max.x, ty, b.max.z, WALL_BLOCK, "air");
  fillCmd(dim, b.min.x, b.min.y, b.min.z, b.max.x, ty, b.min.z, WALL_BLOCK, "air");
  fillCmd(dim, b.min.x, b.min.y, b.max.z, b.max.x, ty, b.max.z, WALL_BLOCK, "air");
}

function removeWalls(zone) {
  const dim = world.getDimension(zone.dim);
  const b = zone.box;
  const ty = wallTopY(b);
  // quita SOLO nuestros muros de cristal (preserva el resto)
  fillCmd(dim, b.min.x, b.min.y, b.min.z, b.min.x, ty, b.max.z, "air", WALL_BLOCK);
  fillCmd(dim, b.max.x, b.min.y, b.min.z, b.max.x, ty, b.max.z, "air", WALL_BLOCK);
  fillCmd(dim, b.min.x, b.min.y, b.min.z, b.max.x, ty, b.min.z, "air", WALL_BLOCK);
  fillCmd(dim, b.min.x, b.min.y, b.max.z, b.max.x, ty, b.max.z, "air", WALL_BLOCK);
}

// ----------------------------------------------------------------- lógica zonas
function createZone(player, name, size, _walls) {
  name = String(name || "").trim();
  if (!name) return { ok: false, msg: t("name_req") };
  if (name.length > 24) return { ok: false, msg: t("name_long") };
  if (!SIZES.includes(size)) size = "1v1";

  const sel = getSel(player);
  if (!sel.p1 || !sel.p2) return { ok: false, msg: t("need_sel") };
  if (sel.p1.dim !== sel.p2.dim) return { ok: false, msg: t("diff_dim") };

  const zones = loadZones();
  if (zones.some((z) => z.name.toLowerCase() === name.toLowerCase()))
    return { ok: false, msg: t("exists", name) };

  const box = normalizeBox(sel.p1, sel.p2);
  zones.push({
    name,
    dim: sel.p1.dim,
    size,
    box,
    protected: true,
    active: false,
    owner: player.name,
    created: Date.now(),
  });
  system.run(() => saveZones(zones));
  log(`${player.name} creó "${name}" (${size})`);
  return { ok: true, msg: t("created", name, size, boxVolume(box)) };
}

function deleteZone(name) {
  const zones = loadZones();
  const idx = zones.findIndex((z) => z.name.toLowerCase() === String(name).toLowerCase());
  if (idx === -1) return { ok: false, msg: t("notfound", name) };
  const removed = zones.splice(idx, 1)[0];
  system.run(() => {
    if (removed.active) removeWalls(removed);
    saveZones(zones);
  });
  return { ok: true, msg: t("deleted", removed.name) };
}

function renameZone(name, newName) {
  newName = String(newName || "").trim();
  if (!newName) return { ok: false, msg: t("name_req") };
  if (newName.length > 24) return { ok: false, msg: t("name_long") };
  const zones = loadZones();
  const z = zones.find((zz) => zz.name.toLowerCase() === String(name).toLowerCase());
  if (!z) return { ok: false, msg: t("notfound", name) };
  if (zones.some((zz) => zz.name.toLowerCase() === newName.toLowerCase()))
    return { ok: false, msg: t("exists", newName) };
  const old = z.name;
  z.name = newName;
  system.run(() => saveZones(zones));
  return { ok: true, msg: t("renamed", old, newName) };
}

function editZone(player, name) {
  const sel = getSel(player);
  if (!sel.p1 || !sel.p2) return { ok: false, msg: t("need_sel") };
  if (sel.p1.dim !== sel.p2.dim) return { ok: false, msg: t("diff_dim") };
  const zones = loadZones();
  const z = zones.find((zz) => zz.name.toLowerCase() === String(name).toLowerCase());
  if (!z) return { ok: false, msg: t("notfound", name) };
  if (z.active) removeWalls(z);
  z.box = normalizeBox(sel.p1, sel.p2);
  z.dim = sel.p1.dim;
  z.active = false;
  system.run(() => saveZones(zones));
  return { ok: true, msg: t("edited", z.name) };
}

function setSize(name, size) {
  if (!SIZES.includes(size)) size = "1v1";
  const zones = loadZones();
  const z = zones.find((zz) => zz.name.toLowerCase() === String(name).toLowerCase());
  if (!z) return { ok: false, msg: t("notfound", name) };
  z.size = size;
  system.run(() => saveZones(zones));
  return { ok: true, msg: t("size_set", z.name, size) };
}

function toggleProtect(name) {
  const zones = loadZones();
  const z = zones.find((zz) => zz.name.toLowerCase() === String(name).toLowerCase());
  if (!z) return { ok: false, msg: t("notfound", name) };
  z.protected = z.protected === false;
  system.run(() => saveZones(zones));
  return { ok: true, msg: z.protected ? t("prot_on", z.name) : t("prot_off", z.name) };
}

function startMatch(name) {
  const zones = loadZones();
  const z = zones.find((zz) => zz.name.toLowerCase() === String(name).toLowerCase());
  if (!z) return { ok: false, msg: t("notfound", name) };
  if (!z.active) {
    z.active = true;
    system.run(() => {
      buildWalls(z);
      saveZones(zones);
    });
  }
  return { ok: true, msg: t("match_start", z.name) };
}

function stopMatch(name) {
  const zones = loadZones();
  const z = zones.find((zz) => zz.name.toLowerCase() === String(name).toLowerCase());
  if (!z) return { ok: false, msg: t("notfound", name) };
  if (z.active) {
    z.active = false;
    system.run(() => {
      removeWalls(z);
      saveZones(zones);
    });
  }
  return { ok: true, msg: t("match_end", z.name) };
}

function zoneInfo(z) {
  const b = z.box;
  return [
    `§6▌ §e${z.name}`,
    `§7${t("f_size")}: §b${z.size} §8(${PER_TEAM[z.size]}v${PER_TEAM[z.size]})`,
    `§7Dim: §f${z.dim.replace("minecraft:", "")}`,
    `§7${b.min.x},${b.min.y},${b.min.z} §8→ §f${b.max.x},${b.max.y},${b.max.z}`,
    `§7Vol: §f${boxVolume(b)} §8| §7${z.protected === false ? "§c⛔" : "§a✔"} §8| ${z.active ? "§c⚔" : "§7–"}`,
    `§7${z.owner || "?"}`,
  ].join("\n");
}

// ----------------------------------------------------------------- formularios
function openMenu(player) {
  const zones = loadZones();
  const f = new ActionFormData()
    .title(t("menu_title"))
    .body(t("menu_body", zones.length))
    .button(t("b_create"), "textures/rom_ui/icon_create")
    .button(t("b_list"), "textures/rom_ui/icon_info")
    .button(t("b_delete"), "textures/rom_ui/icon_delete")
    .button(t("b_wand"), "textures/rom_ui/icon_wand")
    .button(t("b_sel"), "textures/rom_ui/icon_pos")
    .button(t("b_lang"), "textures/rom_ui/icon_info")
    .button(t("b_help"), "textures/rom_ui/icon_help");
  f.show(player).then((r) => {
    if (r.canceled) return;
    if (r.selection === 0) openCreateForm(player);
    else if (r.selection === 1) openZonesList(player);
    else if (r.selection === 2) openDeleteList(player);
    else if (r.selection === 3) system.run(() => { giveWand(player); tell(player, t("wand_got")); });
    else if (r.selection === 4) openSelection(player);
    else if (r.selection === 5) openLangForm(player);
    else if (r.selection === 6) openHelp(player);
  });
}

function openCreateForm(player) {
  if (!canEdit(player)) return tell(player, t("no_perm"));
  const sel = getSel(player);
  const selTxt = (sel.p1 ? "§aP1✔" : "§cP1✘") + " §8| " + (sel.p2 ? "§aP2✔" : "§cP2✘");
  const f = new ModalFormData()
    .title(t("f_create_title"))
    .textField(t("f_sel") + ": " + selTxt + "\n" + t("f_name"), "arena1")
    .dropdown(t("f_size"), ["§a1v1", "§b2v2", "§d3v3"], { defaultValueIndex: 0 });
  f.show(player).then((r) => {
    if (r.canceled) return;
    const [name, sizeIdx] = r.formValues;
    tell(player, createZone(player, name, SIZES[sizeIdx], false).msg);
  });
}

function openZonesList(player) {
  const zones = loadZones();
  if (zones.length === 0) return tell(player, t("list_none"));
  const f = new ActionFormData().title(t("b_list"));
  for (const z of zones)
    f.button(`§f${z.name}\n§8${z.size} · ${z.dim.replace("minecraft:", "")}`, "textures/rom_ui/icon_info");
  f.show(player).then((r) => {
    if (r.canceled) return;
    openZoneDetail(player, zones[r.selection]);
  });
}

function openZoneDetail(player, zone) {
  if (!zone) return;
  const f = new ActionFormData()
    .title("§l§e" + zone.name)
    .body(zoneInfo(zone))
    .button(t("b_tp"), "textures/rom_ui/icon_pos")
    .button(t("b_prot"), "textures/rom_ui/icon_create")
    .button(t("b_delete"), "textures/rom_ui/icon_delete")
    .button(t("b_back"), "textures/rom_ui/icon_help");
  f.show(player).then((r) => {
    if (r.canceled) return;
    if (r.selection === 0)
      system.run(() => {
        try {
          player.teleport(boxCenterTop(zone.box), { dimension: world.getDimension(zone.dim) });
          tell(player, t("tp_done", zone.name));
        } catch (e) {
          tell(player, t("tp_fail"));
        }
      });
    else if (r.selection === 1) tell(player, toggleProtect(zone.name).msg);
    else if (r.selection === 2) tell(player, deleteZone(zone.name).msg);
    else if (r.selection === 3) openZonesList(player);
  });
}

function openDeleteList(player) {
  if (!canEdit(player)) return tell(player, t("no_perm"));
  const zones = loadZones();
  if (zones.length === 0) return tell(player, t("list_none"));
  const f = new ActionFormData().title(t("b_delete"));
  for (const z of zones) f.button(`§c${z.name}\n§8${z.size}`, "textures/rom_ui/icon_delete");
  f.show(player).then((r) => {
    if (r.canceled) return;
    const z = zones[r.selection];
    new MessageFormData()
      .title(t("confirm_title"))
      .body(t("confirm_body", z.name))
      .button1(t("b_confirm"))
      .button2(t("b_cancel"))
      .show(player)
      .then((r2) => {
        if (r2.canceled || r2.selection !== 0) return;
        tell(player, deleteZone(z.name).msg);
      });
  });
}

function openSelection(player) {
  const sel = getSel(player);
  const fmt = (p) => (p ? `§f${p.x}, ${p.y}, ${p.z}` : "§8—");
  new ActionFormData()
    .title(t("sel_title"))
    .body("§dPos1: " + fmt(sel.p1) + "\n§dPos2: " + fmt(sel.p2))
    .button(t("b_close"))
    .show(player);
}

function openLangForm(player) {
  const f = new ActionFormData().title(t("lang_title")).body("§7" + LANG_NAMES[getLang()]);
  for (const code of LANGS) f.button(LANG_NAMES[code] + " §8(" + code + ")");
  f.show(player).then((r) => {
    if (r.canceled) return;
    const code = LANGS[r.selection];
    worldLang = code;
    system.run(() => {
      try {
        world.setDynamicProperty(LANG_KEY, code);
      } catch (e) {}
      tell(player, t("lang_set", LANG_NAMES[code]));
    });
  });
}

function openHelp(player) {
  new ActionFormData().title(t("help_title")).body(t("help_body")).button(t("b_close")).show(player);
}

// ----------------------------------------------------------------- comandos custom
system.beforeEvents.startup.subscribe((init) => {
  const reg = init.customCommandRegistry;
  reg.registerEnum(`${NS}:size`, SIZES);
  reg.registerEnum(`${NS}:lang`, LANGS);

  const ANY = CommandPermissionLevel.Any;
  const ok = (msg) => ({ status: CustomCommandStatus.Success, message: stripColors(msg) });
  const fail = (msg) => ({ status: CustomCommandStatus.Failure, message: stripColors(msg) });

  const needPlayer = (origin) => (isPlayer(origin.sourceEntity) ? origin.sourceEntity : null);
  const result = (r) => (r.ok ? ok(r.msg) : fail(r.msg));

  reg.registerCommand(
    { name: `${NS}:wand`, description: "Entrega la Varita Nether.", permissionLevel: ANY, cheatsRequired: false },
    (o) => {
      const p = needPlayer(o);
      if (!p) return fail(t("only_players"));
      system.run(() => giveWand(p));
      return ok(t("wand_got"));
    }
  );

  reg.registerCommand(
    { name: `${NS}:menu`, description: "Abre el menú PvP.", permissionLevel: ANY, cheatsRequired: false },
    (o) => {
      const p = needPlayer(o);
      if (!p) return fail(t("only_players"));
      system.run(() => openMenu(p));
      return ok("OK");
    }
  );

  reg.registerCommand(
    {
      name: `${NS}:create`,
      description: "Crea una zona PvP.",
      permissionLevel: ANY,
      cheatsRequired: false,
      mandatoryParameters: [
        { name: "nombre", type: CustomCommandParamType.String },
        { name: `${NS}:size`, type: CustomCommandParamType.Enum },
      ],
    },
    (o, nombre, size) => {
      const p = needPlayer(o);
      if (!p) return fail(t("only_players"));
      if (!canEdit(p)) return fail(t("no_perm"));
      return result(createZone(p, nombre, size, false));
    }
  );

  reg.registerCommand(
    {
      name: `${NS}:delete`,
      description: "Elimina una zona.",
      permissionLevel: ANY,
      cheatsRequired: false,
      mandatoryParameters: [{ name: "nombre", type: CustomCommandParamType.String }],
    },
    (o, nombre) => {
      const p = needPlayer(o);
      if (p && !canEdit(p)) return fail(t("no_perm"));
      return result(deleteZone(nombre));
    }
  );

  reg.registerCommand(
    {
      name: `${NS}:rename`,
      description: "Renombra una zona.",
      permissionLevel: ANY,
      cheatsRequired: false,
      mandatoryParameters: [
        { name: "nombre", type: CustomCommandParamType.String },
        { name: "nuevo", type: CustomCommandParamType.String },
      ],
    },
    (o, nombre, nuevo) => {
      const p = needPlayer(o);
      if (p && !canEdit(p)) return fail(t("no_perm"));
      return result(renameZone(nombre, nuevo));
    }
  );

  reg.registerCommand(
    {
      name: `${NS}:edit`,
      description: "Redefine el área de una zona con tu selección actual.",
      permissionLevel: ANY,
      cheatsRequired: false,
      mandatoryParameters: [{ name: "nombre", type: CustomCommandParamType.String }],
    },
    (o, nombre) => {
      const p = needPlayer(o);
      if (!p) return fail(t("only_players"));
      if (!canEdit(p)) return fail(t("no_perm"));
      return result(editZone(p, nombre));
    }
  );

  reg.registerCommand(
    {
      name: `${NS}:setsize`,
      description: "Cambia el modo (1v1/2v2/3v3) de una zona.",
      permissionLevel: ANY,
      cheatsRequired: false,
      mandatoryParameters: [
        { name: "nombre", type: CustomCommandParamType.String },
        { name: `${NS}:size`, type: CustomCommandParamType.Enum },
      ],
    },
    (o, nombre, size) => {
      const p = needPlayer(o);
      if (p && !canEdit(p)) return fail(t("no_perm"));
      return result(setSize(nombre, size));
    }
  );

  reg.registerCommand(
    {
      name: `${NS}:protect`,
      description: "Activa/desactiva la protección de una zona.",
      permissionLevel: ANY,
      cheatsRequired: false,
      mandatoryParameters: [{ name: "nombre", type: CustomCommandParamType.String }],
    },
    (o, nombre) => {
      const p = needPlayer(o);
      if (p && !canEdit(p)) return fail(t("no_perm"));
      return result(toggleProtect(nombre));
    }
  );

  reg.registerCommand(
    {
      name: `${NS}:start`,
      description: "Inicia el combate (construye las paredes).",
      permissionLevel: ANY,
      cheatsRequired: false,
      mandatoryParameters: [{ name: "nombre", type: CustomCommandParamType.String }],
    },
    (o, nombre) => {
      const p = needPlayer(o);
      if (p && !canEdit(p)) return fail(t("no_perm"));
      return result(startMatch(nombre));
    }
  );

  reg.registerCommand(
    {
      name: `${NS}:stop`,
      description: "Termina el combate (quita las paredes).",
      permissionLevel: ANY,
      cheatsRequired: false,
      mandatoryParameters: [{ name: "nombre", type: CustomCommandParamType.String }],
    },
    (o, nombre) => {
      const p = needPlayer(o);
      if (p && !canEdit(p)) return fail(t("no_perm"));
      return result(stopMatch(nombre));
    }
  );

  reg.registerCommand(
    {
      name: `${NS}:tp`,
      description: "Teletransporta a una zona.",
      permissionLevel: ANY,
      cheatsRequired: false,
      mandatoryParameters: [{ name: "nombre", type: CustomCommandParamType.String }],
    },
    (o, nombre) => {
      const p = needPlayer(o);
      if (!p) return fail(t("only_players"));
      const z = getZone(nombre);
      if (!z) return fail(t("notfound", nombre));
      system.run(() => {
        try {
          p.teleport(boxCenterTop(z.box), { dimension: world.getDimension(z.dim) });
          tell(p, t("tp_done", z.name));
        } catch (e) {
          tell(p, t("tp_fail"));
        }
      });
      return ok(t("tp_done", z.name));
    }
  );

  reg.registerCommand(
    {
      name: `${NS}:info`,
      description: "Info de una zona.",
      permissionLevel: ANY,
      cheatsRequired: false,
      optionalParameters: [{ name: "nombre", type: CustomCommandParamType.String }],
    },
    (o, nombre) => {
      const p = needPlayer(o);
      const zones = loadZones();
      if (!nombre) {
        if (zones.length === 0) return ok(t("list_none"));
        if (p) system.run(() => openZonesList(p));
        return ok(t("list_header", zones.map((z) => `${z.name} (${z.size})`).join(", ")));
      }
      const z = getZone(nombre);
      if (!z) return fail(t("notfound", nombre));
      if (p) system.run(() => openZoneDetail(p, z));
      return ok(zoneInfo(z));
    }
  );

  reg.registerCommand(
    {
      name: `${NS}:list`,
      description: "Lista todas las zonas.",
      permissionLevel: ANY,
      cheatsRequired: false,
    },
    (o) => {
      const p = needPlayer(o);
      const zones = loadZones();
      if (zones.length === 0) return ok(t("list_none"));
      if (p) system.run(() => openZonesList(p));
      return ok(t("list_header", zones.map((z) => `${z.name} (${z.size})`).join(", ")));
    }
  );

  reg.registerCommand(
    {
      name: `${NS}:language`,
      description: "Cambia el idioma (es/en/fr/pt/de/zh).",
      permissionLevel: ANY,
      cheatsRequired: false,
      mandatoryParameters: [{ name: `${NS}:lang`, type: CustomCommandParamType.Enum }],
    },
    (o, lang) => {
      if (!LANGS.includes(lang)) lang = "es";
      worldLang = lang;
      system.run(() => {
        try {
          world.setDynamicProperty(LANG_KEY, lang);
        } catch (e) {}
      });
      return ok(t("lang_set", LANG_NAMES[lang]));
    }
  );

  reg.registerCommand(
    { name: `${NS}:help`, description: "Ayuda de ROOM PvP.", permissionLevel: ANY, cheatsRequired: false },
    (o) => {
      const p = needPlayer(o);
      if (p) system.run(() => openHelp(p));
      return ok("/room: create delete edit rename info list tp protect start stop setsize wand menu language help");
    }
  );

  log("15 comandos /room: registrados.");
});

// ----------------------------------------------------------------- selección con varita
function safeSub(emitter, handler) {
  try {
    if (emitter && typeof emitter.subscribe === "function") {
      emitter.subscribe(handler);
      return true;
    }
  } catch (e) {
    log("subscribe error: " + e);
  }
  return false;
}

// IZQUIERDA (romper) = pos1 / o protección anti-romper
safeSub(world.beforeEvents.playerBreakBlock, (ev) => {
  const player = ev.player;
  const held = ev.itemStack;
  const dim = ev.dimension.id;
  const loc = ev.block.location;

  if (held && held.typeId === ZONE_WAND) {
    ev.cancel = true;
    const sel = getSel(player);
    sel.p1 = point(loc, dim);
    setSel(player, sel);
    system.run(() => tell(player, t("pos_set", "Pos1", sel.p1.x, sel.p1.y, sel.p1.z)));
    return;
  }

  if (!canEdit(player)) {
    const z = protectingZone(dim, loc.x, loc.y, loc.z, loadZones());
    if (z) {
      ev.cancel = true;
      system.run(() => actionbar(player, t("no_break", z.name)));
    }
  }
});

// DERECHA (interactuar) = pos2
safeSub(world.beforeEvents.playerInteractWithBlock, (ev) => {
  const player = ev.player;
  const held = ev.itemStack;
  if (!held || held.typeId !== ZONE_WAND) return;
  ev.cancel = true;
  const dim = player.dimension.id;
  const loc = ev.block.location;
  const sel = getSel(player);
  sel.p2 = point(loc, dim);
  setSel(player, sel);
  system.run(() => tell(player, t("pos_set", "Pos2", sel.p2.x, sel.p2.y, sel.p2.z)));
});

// ----------------------------------------------------------------- colocar (solo lana/tela)
// El before-event playerPlaceBlock no existe en todas las versiones:
// si existe lo usamos (cancelar limpio), si no, revertimos en el after-event.
const placedHandledByBefore = safeSub(world.beforeEvents.playerPlaceBlock, (ev) => {
  const player = ev.player;
  if (canEdit(player)) return;
  const dim = (ev.dimension && ev.dimension.id) || player.dimension.id;
  const loc = ev.block.location;
  const z = protectingZone(dim, loc.x, loc.y, loc.z, loadZones());
  if (!z) return;
  let typeId;
  try {
    typeId = ev.permutationBeingPlaced && ev.permutationBeingPlaced.type.id;
  } catch (e) {}
  if (!isCloth(typeId)) {
    ev.cancel = true;
    system.run(() => actionbar(player, t("only_cloth")));
  }
});

if (!placedHandledByBefore) {
  safeSub(world.afterEvents.playerPlaceBlock, (ev) => {
    const player = ev.player;
    if (canEdit(player)) return;
    const block = ev.block;
    const dim = block.dimension.id;
    const loc = block.location;
    const z = protectingZone(dim, loc.x, loc.y, loc.z, loadZones());
    if (!z) return;
    const typeId = block.typeId;
    if (isCloth(typeId)) return;
    // revertir: no se permite construir aquí (solo lana/tela)
    try {
      block.setType("minecraft:air");
    } catch (e) {}
    try {
      const inv = player.getComponent("minecraft:inventory");
      if (inv && inv.container) inv.container.addItem(new ItemStack(typeId, 1));
    } catch (e) {}
    actionbar(player, t("only_cloth"));
  });
}

// ----------------------------------------------------------------- explosiones
safeSub(world.beforeEvents.explosion, (ev) => {
  const zones = loadZones();
  if (zones.length === 0) return;
  const dim = ev.dimension.id;
  const impacted = ev.getImpactedBlocks();
  const kept = impacted.filter((b) => !protectingZone(dim, b.location.x, b.location.y, b.location.z, zones));
  if (kept.length !== impacted.length) ev.setImpactedBlocks(kept);
});

// ----------------------------------------------------------------- bucle: paredes auto + aviso
system.runInterval(() => {
  const zones = loadZones();
  if (zones.length === 0) return;

  const counts = new Map();
  for (const player of world.getAllPlayers()) {
    const l = player.location;
    const z = zoneOf(player.dimension.id, Math.floor(l.x), Math.floor(l.y), Math.floor(l.z), zones);
    if (z) {
      actionbar(player, t("in_zone", z.name, z.size));
      counts.set(z.name, (counts.get(z.name) || 0) + 1);
    }
  }

  let changed = false;
  for (const z of zones) {
    const inside = counts.get(z.name) || 0;
    const needed = PER_TEAM[z.size] * 2; // jugadores para iniciar
    if (!z.active && inside >= needed) {
      z.active = true;
      changed = true;
      buildWalls(z);
      for (const p of world.getAllPlayers()) tell(p, t("match_start", z.name));
    } else if (z.active && inside <= 1) {
      z.active = false;
      changed = true;
      removeWalls(z);
      for (const p of world.getAllPlayers()) tell(p, t("match_end", z.name));
    }
  }
  if (changed) saveZones(zones);
}, 20);

system.run(() => log(`ROOM PvP Zones v0.2.0 cargado. Idioma: ${getLang()}, zonas: ${loadZones().length}`));
