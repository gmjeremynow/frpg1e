/**
 * 1e FRPG for Foundry VTT (V14).
 * Private table system built from the PHB, Dungeon Masters
 * Guide and UA.
 */
import { CharacterData, NpcData, MonsterData, WeaponData, ArmorData, SpellData, GearData, PsionicData, MagicData, TreasureData, ProficiencyData } from "./module/data/models.mjs";
import { ADnDActor, ADnDItem, ADnDChatMessage, ADnDCombat, registerInitiativeReset } from "./module/documents.mjs";
import { CharacterSheet, NpcSheet, MonsterSheet, ADnDItemSheet } from "./module/sheets.mjs";
import * as Rolls from "./module/rolls.mjs";
import * as Tables from "./module/tables.mjs";
import * as Rules from "./module/rules.mjs";
import * as Psionics from "./module/psionics.mjs";
import * as Treasure from "./module/treasure.mjs";
import { importCompendia, offerImport } from "./module/compendia.mjs";
import { api as SettingAPI } from "./module/extend.mjs";
import { applyMonsterArt, ensureArtFolder, fixMonsterTokens } from "./module/monsterart.mjs";

const ID = "frpg1e";

Hooks.once("init", () => {
  console.log(`${ID} | Initializing 1e FRPG`);

  CONFIG.Actor.documentClass = ADnDActor;
  CONFIG.Item.documentClass = ADnDItem;
  CONFIG.ChatMessage.documentClass = ADnDChatMessage;
  CONFIG.Combat.documentClass = ADnDCombat;

  CONFIG.Actor.dataModels = { character: CharacterData, npc: NpcData, monster: MonsterData };
  CONFIG.Item.dataModels = { weapon: WeaponData, armor: ArmorData, spell: SpellData, gear: GearData, psionic: PsionicData, magic: MagicData, treasure: TreasureData, proficiency: ProficiencyData };
  CONFIG.Actor.trackableAttributes = {
    character: { bar: ["hp"], value: [] },
    npc: { bar: ["hp"], value: [] },
    monster: { bar: ["hp"], value: [] }
  };
  // Fallback only: ADnDCombat.rollInitiative rolls one d6 per side.
  CONFIG.Combat.initiative = { formula: "1d6", decimals: 0 };

  const DSC = foundry.applications.apps.DocumentSheetConfig;
  DSC.unregisterSheet(Actor, "core", foundry.appv1.sheets.ActorSheet);
  DSC.unregisterSheet(Item, "core", foundry.appv1.sheets.ItemSheet);
  DSC.registerSheet(Actor, ID, CharacterSheet, { types: ["character"], makeDefault: true, label: "1e FRPG Character Record" });
  DSC.registerSheet(Actor, ID, NpcSheet, { types: ["npc"], makeDefault: true, label: "1e FRPG NPC" });
  DSC.registerSheet(Actor, ID, MonsterSheet, { types: ["monster"], makeDefault: true, label: "1e FRPG Monster" });
  DSC.registerSheet(Item, ID, ADnDItemSheet, { makeDefault: true, label: "1e FRPG Item" });

  registerSettings();
  registerHelpers();
  registerInitiativeReset();

  foundry.applications.handlebars.loadTemplates([
    `systems/${ID}/templates/actor/parts/weapon-row.hbs`,
    `systems/${ID}/templates/actor/parts/spell-row.hbs`,
    `systems/${ID}/templates/actor/parts/psi-row.hbs`,
    ...["abilities", "saves", "classes", "thief", "features", "race", "weapons", "armor-list", "tab-magic", "tab-psionics", "tab-profs", "tab-gear", "tab-notes", "npc-service"]
      .map(n => `systems/${ID}/templates/actor/parts/${n}.hbs`)
  ]);

  // Our own statuses for the discipline markers (also selectable from the token HUD)
  for (const def of Object.values(Psionics.DISCIPLINE_EFFECTS)) {
    if (Array.isArray(CONFIG.statusEffects) && !CONFIG.statusEffects.some(e => e.id === def.status)) CONFIG.statusEffects.push({ id: def.status, name: def.name, img: def.img });
  }

  game.frpg1e = { Rolls, Tables, Rules, Psionics, Treasure, rollTreasure: Treasure.treasureDialog, importCompendia, rollSurprise: Rolls.rollSurprise, rollAbilityScores: Rolls.rollAbilityScores, api: SettingAPI };
  // Setting modules register races, classes and spell tables here (module/extend.mjs).
  Hooks.callAll("frpg1e.init", SettingAPI);
});

Hooks.on("updateCombat", (combat, changed) => Psionics.onCombatRound(combat, changed));
// Discipline markers: remove them if the discipline is deleted or switched off by hand
Hooks.on("deleteItem", item => {
  if (item.type === "psionic" && item.parent && item.isOwner) Psionics.clearDisciplineEffects(item.parent, item.id);
});
Hooks.on("updateItem", (item, changed) => {
  if (item.type === "psionic" && item.parent && item.isOwner && changed.system?.active === false) Psionics.clearDisciplineEffects(item.parent, item.id);
});

Hooks.once("ready", async () => {
  if (!game.user.isGM) return;
  await ensureArtFolder();
  // one-time: L monsters already in the world get 2x2 tokens, bars on hover
  if (game.settings.get(ID, "tokenFix") !== "1") {
    const f = await fixMonsterTokens();
    await game.settings.set(ID, "tokenFix", "1");
    if (f.actors || f.tokens) ui.notifications.info(`1e FRPG: token size and bars updated on ${f.actors} monsters and ${f.tokens} placed tokens.`);
  }
  offerImport();
});

/* Actors sidebar: GM button to apply monster art */
Hooks.on("renderActorDirectory", (app, html) => {
  if (!game.user.isGM) return;
  const root = html instanceof HTMLElement ? html : html?.[0];
  if (!root || root.querySelector(".frpg1e-art")) return;
  const btn = document.createElement("button");
  btn.type = "button"; btn.className = "frpg1e-art";
  btn.innerHTML = `<i class="fa-solid fa-image"></i> Apply Monster Art`;
  btn.addEventListener("click", () => applyMonsterArt({ confirm: true }));
  const anchor = root.querySelector(".header-actions, .directory-header") ?? root;
  anchor.append(btn);
});

/* Items sidebar: GM treasure roller */
Hooks.on("renderItemDirectory", (app, html) => {
  if (!game.user.isGM) return;
  const root = html instanceof HTMLElement ? html : html?.[0];
  if (!root || root.querySelector(".frpg1e-treasure")) return;
  const btn = document.createElement("button");
  btn.type = "button"; btn.className = "frpg1e-treasure";
  btn.innerHTML = `<i class="fa-solid fa-gem"></i> Roll Treasure`;
  btn.addEventListener("click", () => Treasure.treasureDialog());
  const anchor = root.querySelector(".header-actions, .directory-header") ?? root;
  anchor.append(btn);
});

/* Combat tracker: GM buttons for surprise and side initiative */
Hooks.on("renderCombatTracker", (app, html) => {
  if (!game.user.isGM) return;
  const root = html instanceof HTMLElement ? html : html?.[0];
  if (!root || root.querySelector(".frpg1e-encounter")) return;
  const bar = document.createElement("div");
  bar.className = "frpg1e-encounter";
  bar.innerHTML = `
    <button type="button" data-adnd="surprise" title="Roll surprise for both sides (d6, surprised on 1-2)"><i class="fa-solid fa-eye-slash"></i> Surprise</button>
    <button type="button" data-adnd="sides" title="Roll one d6 per side"><i class="fa-solid fa-dice-six"></i> Side Initiative</button>`;
  bar.querySelector('[data-adnd="surprise"]').addEventListener("click", () => Rolls.rollSurprise());
  bar.querySelector('[data-adnd="sides"]').addEventListener("click", () => {
    const combat = game.combat;
    if (!combat) return ui.notifications.warn("No active encounter.");
    combat.rollInitiative(combat.combatants.filter(c => c.initiative === null).map(c => c.id));
  });
  const anchor = root.querySelector(".combat-tracker-header, header") ?? root;
  anchor.append(bar);
});

function registerSettings() {
  game.settings.register(ID, "weaponVsArmor", {
    name: "Weapon vs. armor type adjustments",
    hint: "Apply the weapon type \"to hit\" adjustments by armor type (UA tables, AC 0-10). Armor types below 0 use the AC 0 column and above 10 the AC 10 column.",
    scope: "world", config: true, type: Boolean, default: true
  });
  game.settings.register(ID, "fighterPerLevel", {
    name: "Fighters improve every level (DMG p.74 option)",
    hint: "Fighters, paladins and rangers gain +1 \"to hit\" at the second level of each pair (2nd, 4th, 6th...).",
    scope: "world", config: true, type: Boolean, default: false
  });
  game.settings.register(ID, "rerollInitiative", {
    name: "Clear initiative each round",
    hint: "DMG p.61: initiative is determined at the start of each round. When the round advances, all initiative is cleared so sides roll again.",
    scope: "world", config: true, type: Boolean, default: true
  });
  game.settings.register(ID, "revealTargetAC", {
    name: "Show target armor class to players",
    hint: "When off, players see hit or miss on attack cards but not the target's armor class or score needed.",
    scope: "world", config: true, type: Boolean, default: false
  });
  game.settings.register(ID, "magicTables", {
    name: "Magic item tables",
    hint: "Default tables for random magic items: the revised tables of UA (p.84-89, which add the UA items) or the DMG tables III.A-H.",
    scope: "world", config: true, type: String, choices: { UA: "UA (revised)", DMG: "DMG" }, default: "UA"
  });
  game.settings.register(ID, "tokenFix", { scope: "world", config: false, type: String, default: "" });
  game.settings.register(ID, "compendiaVersion", {
    scope: "world", config: false, type: String, default: ""
  });
  game.settings.register(ID, "monsterArtFolder", {
    name: "Monster art folder",
    hint: "Folder in your Foundry data (default \"frpg1e_monster_art\", created for you) with images named \"Token \" + the monster's name, e.g. \"Token Owlbear.webp\". They become the portrait and token image when the book compendia are built, or when you press Apply Monster Art below. Subfolders one level down are searched too.",
    scope: "world", config: true, type: String, default: "frpg1e_monster_art", filePicker: "folder"
  });
  game.settings.registerMenu(ID, "artMenu", {
    name: "Monster art",
    label: "Apply Monster Art",
    hint: "Set the \"Token ...\" images from the monster art folder on the matching monsters in the book compendia and in this world (world monsters with their own picture are left alone).",
    icon: "fa-solid fa-image",
    type: ArtMenu,
    restricted: true
  });
  game.settings.registerMenu(ID, "importMenu", {
    name: "Book compendia",
    label: "Import Book Compendia",
    hint: "Create world compendia of the UA weapons, armor, PHB equipment, every PHB and UA spell and cantrip, the PHB psionic disciplines, the DMG and UA magic items and the DMG gems.",
    icon: "fa-solid fa-book",
    type: ImportMenu,
    restricted: true
  });
}

class ArtMenu extends foundry.applications.api.ApplicationV2 {
  async render() {
    await applyMonsterArt({ confirm: true });
    return this;
  }
}

class ImportMenu extends foundry.applications.api.ApplicationV2 {
  async render() {
    await importCompendia({ confirm: true });
    return this;
  }
}

function registerHelpers() {
  Handlebars.registerHelper("adnd-signed", n => (Number(n) > 0 ? `+${n}` : `${n}`));
  Handlebars.registerHelper("adnd-eq", (a, b) => a === b);
  Handlebars.registerHelper("adnd-selected", (a, b) => (String(a) === String(b) ? "selected" : ""));
  Handlebars.registerHelper("adnd-checked", a => (a ? "checked" : ""));
  Handlebars.registerHelper("adnd-pct", n => (n === null || n === undefined ? "—" : `${n}%`));
}
