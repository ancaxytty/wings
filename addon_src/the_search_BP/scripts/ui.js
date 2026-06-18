/**
 * The Search v0.1 PE — ui.js
 * -------------------------------------------------------------
 * Formularios interactivos con @minecraft/server-ui (API 2.x).
 *   - openEditForm:    hub de edicion (apariencia, mensajes, info).
 *   - openRewardsForm: gestion de recompensas al completar.
 *
 * NOTA: se usa la firma MODERNA de server-ui 2.x, donde los valores por
 * defecto van en un objeto de opciones:
 *   textField(label, placeholder, { defaultValue })
 *   dropdown(label, items, { defaultValueIndex })
 * Los botones de ActionFormData aceptan una textura custom como icono.
 */

import { ActionFormData, ModalFormData, MessageFormData } from "@minecraft/server-ui";
import { HEAD_CATALOG, SIZE_NAMES, EFFECT_NAMES, ICONS, headIcon, colorCode } from "./config.js";
import { getSearch, updateSearchMeta, persist } from "./data.js";

const HEAD_NAMES = HEAD_CATALOG.map((c) => c.name);

// ----------------------------- /ts:edit -----------------------------

/**
 * Hub principal de edicion de una busqueda. Usa iconos custom en los botones
 * para demostrar la integracion de texturas en los formularios.
 */
export function openEditForm(player, searchName) {
  const search = getSearch(searchName);
  if (!search) {
    player.sendMessage(`§cNo existe la busqueda "${searchName}".`);
    return;
  }

  const form = new ActionFormData()
    .title(`Editar: ${search.name}`)
    .body(
      `§7Cabezas: §f${search.heads.length}\n` +
      `§7Cabeza por defecto: §${colorCode(HEAD_CATALOG[search.defaultSkin].color)}${HEAD_NAMES[search.defaultSkin]}\n` +
      `§7Tamano por defecto: §f${SIZE_NAMES[search.defaultSize]}\n` +
      `§7Efecto al encontrar: §f${EFFECT_NAMES[search.effect || 0]}\n` +
      `§7Recompensas: §f${(search.rewards || []).length}`
    )
    .button("§lApariencia\n§r§7skin · tamano · color", headIcon(search.defaultSkin))
    .button("§lMensajes\n§r§7title · subtitle", ICONS.review)
    .button("§lRecompensas\n§r§7comandos al 100%", ICONS.create)
    .button("§lInformacion\n§r§7ver detalles", ICONS.help)
    .button("§7Cerrar", ICONS.delete);

  form.show(player).then((res) => {
    if (res.canceled) return;
    switch (res.selection) {
      case 0: openAppearanceForm(player, search.name); break;
      case 1: openMessagesForm(player, search.name); break;
      case 2: openRewardsForm(player, search.name); break;
      case 3: openInfoForm(player, search.name); break;
      default: break;
    }
  });
}

/** Sub-formulario: apariencia por defecto de las cabezas (skin, tamano, color). */
function openAppearanceForm(player, searchName) {
  const search = getSearch(searchName);
  if (!search) return;

  const form = new ModalFormData()
    .title(`Apariencia: ${search.name}`)
    .dropdown("Cabeza por defecto (para /ts:set)", HEAD_NAMES, { defaultValueIndex: search.defaultSkin })
    .dropdown("Tamano por defecto", SIZE_NAMES, { defaultValueIndex: search.defaultSize })
    .dropdown("Efecto 3D al encontrar", EFFECT_NAMES, { defaultValueIndex: search.effect || 0 })
    .textField("Color del nombre (0-9, a-f)", "e", { defaultValue: search.color });

  form.show(player).then((res) => {
    if (res.canceled) return;
    const [skin, size, effect, color] = res.formValues;
    updateSearchMeta(search, { defaultSkin: skin, defaultSize: size, effect, color });
    player.sendMessage(`§aApariencia de §f${search.name}§a actualizada.`);
    openEditForm(player, search.name);
  });
}

/** Sub-formulario: plantillas de title/subtitle. */
function openMessagesForm(player, searchName) {
  const search = getSearch(searchName);
  if (!search) return;

  const form = new ModalFormData()
    .title(`Mensajes: ${search.name}`)
    .textField(
      "Title al encontrar\n§7Placeholders: {found} {total} {head} {search} {player}",
      "§a¡Conseguiste {found}/{total} cabezas!",
      { defaultValue: search.title }
    )
    .textField(
      "Subtitle al encontrar",
      "§7Encontraste §f{head}",
      { defaultValue: search.subtitle }
    );

  form.show(player).then((res) => {
    if (res.canceled) return;
    const [title, subtitle] = res.formValues;
    updateSearchMeta(search, { title, subtitle });
    player.sendMessage(`§aMensajes de §f${search.name}§a actualizados.`);
    openEditForm(player, search.name);
  });
}

/** Sub-formulario: informacion detallada (solo lectura). */
function openInfoForm(player, searchName) {
  const search = getSearch(searchName);
  if (!search) return;

  let body = `§${colorCode(search.color)}§l${search.name}§r\n\n`;
  body += `§7Total de cabezas: §f${search.heads.length}\n`;
  body += `§7Recompensas: §f${(search.rewards || []).length}\n\n`;
  search.heads.forEach((h, i) => {
    const cat = HEAD_CATALOG[h.skin] || HEAD_CATALOG[0];
    body += `§7#${i + 1} §${colorCode(cat.color)}${cat.name}§7: §f${h.x}, ${h.y}, ${h.z}\n`;
  });

  new MessageFormData()
    .title("Informacion")
    .body(body)
    .button1("§7Volver")
    .button2("Cerrar")
    .show(player)
    .then((res) => {
      if (!res.canceled && res.selection === 0) openEditForm(player, search.name);
    });
}

// ----------------------------- /ts:rewards -----------------------------

/** Menu de recompensas: lista, anade y limpia comandos al completar. */
export function openRewardsForm(player, searchName) {
  const search = getSearch(searchName);
  if (!search) {
    player.sendMessage(`§cNo existe la busqueda "${searchName}".`);
    return;
  }
  const rewards = Array.isArray(search.rewards) ? search.rewards : [];

  const form = new ActionFormData()
    .title(`Recompensas: ${search.name}`)
    .body(
      rewards.length === 0
        ? "§7No hay recompensas configuradas.\n§7Se ejecutan al completar el 100%."
        : "§7Comandos que se ejecutan al completar (§e@s§7 = jugador):\n" +
            rewards.map((r, i) => `§7#${i + 1} §f${r}`).join("\n")
    )
    .button("§aAnadir recompensa", ICONS.create)
    .button("§eAnadir item (give)", ICONS.place)
    .button("§cQuitar una recompensa", ICONS.delete)
    .button("§7Volver", ICONS.review);

  form.show(player).then((res) => {
    if (res.canceled) return;
    switch (res.selection) {
      case 0: addRewardCommand(player, search.name); break;
      case 1: addRewardItem(player, search.name); break;
      case 2: removeReward(player, search.name); break;
      case 3: openEditForm(player, search.name); break;
      default: break;
    }
  });
}

/** Anade un comando de recompensa libre. */
function addRewardCommand(player, searchName) {
  const search = getSearch(searchName);
  if (!search) return;

  new ModalFormData()
    .title("Anadir comando")
    .textField("Comando (sin la barra /). Ej: §fgive @s diamond 3", "give @s diamond 1", { defaultValue: "" })
    .show(player)
    .then((res) => {
      if (res.canceled) return;
      const cmd = String(res.formValues[0] || "").trim();
      if (cmd.length) {
        if (!Array.isArray(search.rewards)) search.rewards = [];
        search.rewards.push(cmd);
        persist(search);
        player.sendMessage(`§aRecompensa anadida: §f${cmd}`);
      }
      openRewardsForm(player, search.name);
    });
}

/** Helper guiado para anadir un "give" de item de forma sencilla. */
function addRewardItem(player, searchName) {
  const search = getSearch(searchName);
  if (!search) return;

  new ModalFormData()
    .title("Anadir item")
    .textField("Identificador del item. Ej: §fminecraft:diamond", "minecraft:diamond", { defaultValue: "minecraft:diamond" })
    .textField("Cantidad", "1", { defaultValue: "1" })
    .show(player)
    .then((res) => {
      if (res.canceled) return;
      const item = String(res.formValues[0] || "").trim();
      const amount = Math.max(1, Math.floor(Number(res.formValues[1]) || 1));
      if (item.length) {
        const cmd = `give @s ${item} ${amount}`;
        if (!Array.isArray(search.rewards)) search.rewards = [];
        search.rewards.push(cmd);
        persist(search);
        player.sendMessage(`§aItem anadido como recompensa: §f${cmd}`);
      }
      openRewardsForm(player, search.name);
    });
}

/** Permite quitar una recompensa concreta de la lista. */
function removeReward(player, searchName) {
  const search = getSearch(searchName);
  if (!search) return;
  const rewards = Array.isArray(search.rewards) ? search.rewards : [];
  if (rewards.length === 0) {
    player.sendMessage("§7No hay recompensas para quitar.");
    openRewardsForm(player, search.name);
    return;
  }

  const form = new ActionFormData().title("Quitar recompensa").body("§7Selecciona la recompensa a eliminar:");
  rewards.forEach((r, i) => form.button(`§c✖ §f${r}`));
  form.button("§7Volver");

  form.show(player).then((res) => {
    if (res.canceled) return;
    if (res.selection < rewards.length) {
      const removed = rewards.splice(res.selection, 1);
      search.rewards = rewards;
      persist(search);
      player.sendMessage(`§cRecompensa eliminada: §f${removed[0]}`);
    }
    openRewardsForm(player, search.name);
  });
}
