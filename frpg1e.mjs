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
import { registerMagicWeaponHooks, migrateMagicWeapons } from "./module/magic-weapons.mjs";
import { registerSpellFolderButton, buildSpellFolders } from "./module/spell-folders.mjs";
import { applyMonsterArt, ensureArtFolder, fixMonsterTokens } from "./module/monsterart.mjs";
import { raceBaseMove } from "./module/races.mjs";

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
  registerMagicWeaponHooks();
  registerSpellFolderButton();
  applySheetStyle();
  registerHelpers();
  registerInitiativeReset();

  foundry.applications.handlebars.loadTemplates([
    `systems/${ID}/templates/actor/parts/weapon-row.hbs`,
    `systems/${ID}/templates/actor/parts/loc-select.hbs`,
    `systems/${ID}/templates/item/container.hbs`,
    `systems/${ID}/templates/item/weight-src.hbs`,
    `systems/${ID}/templates/actor/parts/spell-row.hbs`,
    `systems/${ID}/templates/actor/parts/psi-row.hbs`,
    ...["abilities", "saves", "classes", "thief", "features", "race", "weapons", "armor-list", "tab-magic", "tab-psionics", "tab-profs", "tab-gear", "tab-notes", "npc-service"]
      .map(n => `systems/${ID}/templates/actor/parts/${n}.hbs`)
  ]);

  // Our own statuses for the discipline markers (also selectable from the token HUD)
  for (const def of Object.values(Psionics.DISCIPLINE_EFFECTS)) {
    if (Array.isArray(CONFIG.statusEffects) && !CONFIG.statusEffects.some(e => e.id === def.status)) CONFIG.statusEffects.push({ id: def.status, name: def.name, img: def.img });
  }

  game.frpg1e = { Rolls, Tables, Rules, Psionics, Treasure, rollTreasure: Treasure.treasureDialog, importCompendia, rollSurprise: Rolls.rollSurprise, rollAbilityScores: Rolls.rollAbilityScores, buildSpellFolders, api: SettingAPI };
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

// "When found" rolls happen once, when an item is added to a character (the result is kept on the item).
Hooks.on("createItem", (item, options, userId) => {
  if (userId !== game.user.id || item.parent?.documentName !== "Actor") return;
  if (item.getFlag(ID, "found") || !item.system.rolls?.some(r => r.fn === "Determine type (when found)")) return;
  Rolls.rollWhenFound(item.parent, item).catch(e => console.warn("frpg1e | when found", e));
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
  // one-time: characters renamed before 0.41.11 kept their old token name; bring the prototype token and linked tokens on scenes in line
  if (game.settings.get(ID, "tokenNameFix") !== "1") {
    let a = 0, t = 0;
    for (const actor of game.actors.filter(x => x.type === "character")) {
      if (actor.prototypeToken.name !== actor.name) { await actor.update({ "prototypeToken.name": actor.name }); a++; }
    }
    for (const scene of game.scenes) {
      const ups = scene.tokens.filter(tk => tk.actorLink && tk.actor?.type === "character" && tk.name !== tk.actor.name).map(tk => ({ _id: tk.id, name: tk.actor.name }));
      if (ups.length) { await scene.updateEmbeddedDocuments("Token", ups); t += ups.length; }
    }
    await game.settings.set(ID, "tokenNameFix", "1");
    if (a || t) ui.notifications.info(`1e FRPG: token names now match the character name on ${a} characters and ${t} placed tokens.`);
  }
  // one-time: gems and jewelry used icons/svg/jewel.svg, which Foundry does not have; give them the system's gem icons
  if (game.settings.get(ID, "gemIconFix") !== "1") {
    const OLD = "icons/svg/jewel.svg";
    const slug = n => String(n).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    let names = new Set();
    try { names = new Set((await (await fetch(`systems/${ID}/data/gems.json`)).json()).map(g => g.name)); } catch (e) { console.warn("frpg1e | gems.json", e); }
    const iconFor = it => it.system?.kind === "gem" && names.has(it.name) ? `systems/${ID}/assets/gems/${slug(it.name)}.svg` : `systems/${ID}/assets/gems/jewelry.svg`;
    let n = 0;
    const worldUps = game.items.filter(i => i.img === OLD).map(i => ({ _id: i.id, img: iconFor(i) }));
    if (worldUps.length) { await Item.updateDocuments(worldUps); n += worldUps.length; }
    for (const a of game.actors) {
      const ups = a.items.filter(i => i.img === OLD).map(i => ({ _id: i.id, img: iconFor(i) }));
      if (ups.length) { await a.updateEmbeddedDocuments("Item", ups); n += ups.length; }
    }
    await game.settings.set(ID, "gemIconFix", "1");
    if (n) ui.notifications.info(`1e FRPG: gem and jewelry icons fixed on ${n} items.`);
  }
  // one-time (0.43.8): Sleep's 4+1 to 4+4 hit dice band was a separate roll made on every cast; it is now the 5th choice of
  // "Creatures affected". Update copies already in the world and in spellbooks (memorized counts are kept).
  if (game.settings.get(ID, "sleepFix") !== "1") {
    try {
      const fresh = (await (await fetch(`systems/${ID}/data/spells.json`)).json()).find(x => x.name === "Sleep");
      const old = it => it.type === "spell" && it.name === "Sleep" && (it.system.rolls ?? []).some(r => r.label === "4+1 to 4+4 hit dice");
      let n = 0;
      if (fresh) {
        const rolls = fresh.system.rolls;
        const w = game.items.filter(old).map(i => ({ _id: i.id, "system.rolls": rolls }));
        if (w.length) { await Item.updateDocuments(w); n += w.length; }
        for (const a of game.actors) {
          const ups = a.items.filter(old).map(i => ({ _id: i.id, "system.rolls": rolls }));
          if (ups.length) { await a.updateEmbeddedDocuments("Item", ups); n += ups.length; }
        }
      }
      await game.settings.set(ID, "sleepFix", "1");
      if (n) ui.notifications.info(`1e FRPG: Sleep updated on ${n} copies (one roll for the hit dice band chosen).`);
    } catch (e) { console.warn("frpg1e | sleep fix", e); }
  }
  // one-time (0.44.0): magic items that are also weapons (staves, rods, tridents...) get their weapon entries
  if (game.settings.get(ID, "magicWeaponFix") !== "1") {
    try {
      const n = await migrateMagicWeapons();
      await game.settings.set(ID, "magicWeaponFix", "1");
      if (n) ui.notifications.info(`1e FRPG: added ${n} weapon entries for magic items that can be used as weapons (staves, rods and the like).`);
    } catch (e) { console.warn("frpg1e | magic item weapons", e); }
  }
  // one-time (0.46.1): the Worn boxes are gone; armor and magic items ticked as worn get Location "Worn"
  if (game.settings.get(ID, "wornLocationFix") !== "1") {
    try {
      for (const a of game.actors) {
        const ups = a.items.filter(i => ["armor", "magic"].includes(i.type) && i.system.equipped && i.system.location !== "worn")
          .map(i => ({ _id: i.id, "system.location": "worn" }));
        if (ups.length) await a.updateEmbeddedDocuments("Item", ups);
      }
      await game.settings.set(ID, "wornLocationFix", "1");
    } catch (e) { console.warn("frpg1e | worn location", e); }
  }
  // one-time (0.47.0): containers, animals and vehicles already owned get their container settings from the system data
  if (game.settings.get(ID, "containerFix") !== "1") {
    try {
      const src = {};
      for (const f of ["equipment.json", "magic-items.json"]) {
        const data = await (await fetch(`systems/${ID}/data/${f}`)).json();
        for (const d of data) if (d.system?.container?.kind) src[`${d.type}|${d.name}`] = d.system;
      }
      const fix = i => {
        const d = src[`${i.type}|${i.name}`];
        if (!d || i.system.container?.kind) return null;
        const up = { _id: i.id, "system.container": d.container };
        if (d.weight && !i.system.weight) up["system.weight"] = d.weight;
        if (i.type === "gear" && d.notes && !i.system.notes) up["system.notes"] = d.notes;
        return up;
      };
      let n = 0;
      for (const a of game.actors) {
        const ups = a.items.map(fix).filter(Boolean);
        if (ups.length) { await a.updateEmbeddedDocuments("Item", ups); n += ups.length; }
      }
      const ups = game.items.map(fix).filter(Boolean);
      if (ups.length) { await Item.updateDocuments(ups); n += ups.length; }
      await game.settings.set(ID, "containerFix", "1");
      if (n) ui.notifications.info(`1e FRPG: container settings added to ${n} owned sacks, packs, animals and vehicles.`);
    } catch (e) { console.warn("frpg1e | container fix", e); }
  }
  // one-time (0.47.1): weight sources and citations, Dragon #142 container capacities, published weights; iron boxes lose the
  // weight borrowed from the iron chest (no published weight). Values a GM changed are kept.
  if (game.settings.get(ID, "weightSourceFix") !== "1") {
    try {
      const src = {};
      for (const f of ["equipment.json", "magic-items.json"]) {
        const data = await (await fetch(`systems/${ID}/data/${f}`)).json();
        for (const d of data) src[`${d.type}|${d.name}`] = d.system;
      }
      const OLD_BOX = { "Box, iron, large": 3000, "Box, iron, small": 350 };
      const oldNote = t => !t || /No weight limit given in the rules|^DMG p\.225: (large|small) (solid iron|wooden) chest|^Holds about/.test(t);
      const fix = i => {
        const d = src[`${i.type}|${i.name}`];
        if (!d) return null;
        const s = i.system, up = {};
        let w = Number(s.weight) || 0;
        if (i.name in OLD_BOX && w === OLD_BOX[i.name]) { up["system.weight"] = 0; w = 0; }
        if (!w && d.weight) { up["system.weight"] = d.weight; w = d.weight; }
        if (!s.weightSource && d.weightSource) {
          const keep = w && (d.weightSource === "unspecified" || (d.weight && w !== d.weight));
          up["system.weightSource"] = keep ? "dm" : d.weightSource;
          if (!keep && d.weightRef) up["system.weightRef"] = d.weightRef;
        }
        if (d.container?.capacity && s.container?.kind && !s.container.capacity) up["system.container.capacity"] = d.container.capacity;
        if (i.type === "gear" && d.notes && oldNote(s.notes) && s.notes !== d.notes) up["system.notes"] = d.notes;
        return Object.keys(up).length ? { _id: i.id, ...up } : null;
      };
      let n = 0;
      for (const a of game.actors) {
        const ups = a.items.map(fix).filter(Boolean);
        if (ups.length) { await a.updateEmbeddedDocuments("Item", ups); n += ups.length; }
      }
      const ups = game.items.map(fix).filter(Boolean);
      if (ups.length) { await Item.updateDocuments(ups); n += ups.length; }
      await game.settings.set(ID, "weightSourceFix", "1");
      if (n) ui.notifications.info(`1e FRPG: weight sources, capacities and published weights updated on ${n} owned items.`);
    } catch (e) { console.warn("frpg1e | weight source fix", e); }
  }
  // one-time (0.47.2): approved weights for items with none (derived from DMG Appendix O and like items, or set by the DM), and the
  // bow and crossbow fix (Appendix O). Wrong launcher weights (2 or 1 gp) are corrected or cleared. Weights a GM entered are kept.
  if (game.settings.get(ID, "weightFillFix") !== "1") {
    try {
      const src = {};
      for (const f of ["equipment.json", "magic-items.json", "weapons.json"]) {
        const data = await (await fetch(`systems/${ID}/data/${f}`)).json();
        for (const d of data) src[`${d.type}|${d.name}`] = d.system;
      }
      const OLD = { "Bow, Composite, Long": 2, "Bow, Composite, Short": 2, "Bow, Long": 2, "Bow, Short": 2, "Crossbow, Heavy": 2, "Crossbow, Light": 1,
        "Crossbow, Hand": 1, "Sling (bullet)": 2, "Sling (stone)": 1, "Staff Sling (bullet)": 5, "Staff Sling (stone)": 4,
        "Bow +1": 2, "Crossbow of Accuracy, +3": 1, "Crossbow of Distance": 1, "Crossbow of Speed": 1, "Sling of Seeking +2": 2 };
      const fix = i => {
        const d = src[`${i.type}|${i.name}`];
        if (!d) return null;
        const s = i.system, w = Number(s.weight) || 0, dw = Number(d.weight) || 0;
        const wrong = i.name in OLD && w === OLD[i.name];
        const blank = !w && ["", "unspecified"].includes(s.weightSource ?? "");
        if (!(wrong || (blank && dw))) return null;
        return { _id: i.id, "system.weight": dw, "system.weightSource": d.weightSource ?? "", "system.weightRef": d.weightRef ?? "" };
      };
      let n = 0;
      for (const a of game.actors) {
        const ups = a.items.map(fix).filter(Boolean);
        if (ups.length) { await a.updateEmbeddedDocuments("Item", ups); n += ups.length; }
      }
      const ups = game.items.map(fix).filter(Boolean);
      if (ups.length) { await Item.updateDocuments(ups); n += ups.length; }
      await game.settings.set(ID, "weightFillFix", "1");
      if (n) ui.notifications.info(`1e FRPG: weights filled in or corrected on ${n} owned items.`);
    } catch (e) { console.warn("frpg1e | weight fill fix", e); }
  }
  // one-time (0.47.3): weights from OSRIC 3, the 2e PHB and 2e DMG for items with none; gloves, hats and caps not counted.
  // Only blank weights (or the 0.47.2 hat and cap value of 5) are changed; weights a GM entered are kept.
  if (game.settings.get(ID, "weightFill3Fix") !== "1") {
    try {
      const src = {};
      for (const f of ["equipment.json", "magic-items.json", "weapons.json"]) {
        const data = await (await fetch(`systems/${ID}/data/${f}`)).json();
        for (const d of data) src[`${d.type}|${d.name}`] = d.system;
      }
      const OLD = { Hat: 5, Cap: 5 };
      const fix = i => {
        const d = src[`${i.type}|${i.name}`];
        if (!d || !d.weightSource || d.weightSource === "unspecified") return null;
        const s = i.system, w = Number(s.weight) || 0;
        const blank = !w && ["", "unspecified"].includes(s.weightSource ?? "");
        const old = i.name in OLD && w === OLD[i.name] && s.weightSource === "dm" && !s.weightRef;
        if (!(blank || old)) return null;
        if (w === (Number(d.weight) || 0) && s.weightSource === d.weightSource) return null;
        return { _id: i.id, "system.weight": Number(d.weight) || 0, "system.weightSource": d.weightSource, "system.weightRef": d.weightRef ?? "" };
      };
      let n = 0;
      for (const a of game.actors) {
        const ups = a.items.map(fix).filter(Boolean);
        if (ups.length) { await a.updateEmbeddedDocuments("Item", ups); n += ups.length; }
      }
      const ups = game.items.map(fix).filter(Boolean);
      if (ups.length) { await Item.updateDocuments(ups); n += ups.length; }
      await game.settings.set(ID, "weightFill3Fix", "1");
      if (n) ui.notifications.info(`1e FRPG: weights from OSRIC and 2e added to ${n} owned items.`);
    } catch (e) { console.warn("frpg1e | weight fill 3 fix", e); }
  }
  // one-time (0.47.4): inn meals not counted; an owned "Bow +1" (long bow statistics) weighs as a long bow, 100 gp (DMG p.225).
  // Only blank weights are changed.
  if (game.settings.get(ID, "weightFill4Fix") !== "1") {
    try {
      const src = {};
      for (const f of ["equipment.json", "magic-items.json", "weapons.json"]) {
        const data = await (await fetch(`systems/${ID}/data/${f}`)).json();
        for (const d of data) src[`${d.type}|${d.name}`] = d.system;
      }
      src["weapon|Bow +1"] = { weight: 100, weightSource: "derived", weightRef: "Uses long bow statistics; long bow 100 (DMG p.225)" };
      const fix = i => {
        const d = src[`${i.type}|${i.name}`];
        if (!d || !d.weightSource || d.weightSource === "unspecified") return null;
        const s = i.system, w = Number(s.weight) || 0;
        if (w || !["", "unspecified"].includes(s.weightSource ?? "")) return null;
        return { _id: i.id, "system.weight": Number(d.weight) || 0, "system.weightSource": d.weightSource, "system.weightRef": d.weightRef ?? "" };
      };
      let n = 0;
      for (const a of game.actors) {
        const ups = a.items.map(fix).filter(Boolean);
        if (ups.length) { await a.updateEmbeddedDocuments("Item", ups); n += ups.length; }
      }
      const ups = game.items.map(fix).filter(Boolean);
      if (ups.length) { await Item.updateDocuments(ups); n += ups.length; }
      await game.settings.set(ID, "weightFill4Fix", "1");
      if (n) ui.notifications.info(`1e FRPG: weights updated on ${n} owned items.`);
    } catch (e) { console.warn("frpg1e | weight fill 4 fix", e); }
  }
  // one-time (0.47.5): DM-set weights and not-counted rulings for misc magic items and artifacts.
  // Only blank weights are changed.
  if (game.settings.get(ID, "weightFill5Fix") !== "1") {
    try {
      const src = {};
      for (const f of ["equipment.json", "magic-items.json", "weapons.json"]) {
        const data = await (await fetch(`systems/${ID}/data/${f}`)).json();
        for (const d of data) src[`${d.type}|${d.name}`] = d.system;
      }
      const fix = i => {
        const d = src[`${i.type}|${i.name}`];
        if (!d || !d.weightSource || d.weightSource === "unspecified") return null;
        const s = i.system, w = Number(s.weight) || 0;
        if (w || !["", "unspecified"].includes(s.weightSource ?? "")) return null;
        return { _id: i.id, "system.weight": Number(d.weight) || 0, "system.weightSource": d.weightSource, "system.weightRef": d.weightRef ?? "" };
      };
      let n = 0;
      for (const a of game.actors) {
        const ups = a.items.map(fix).filter(Boolean);
        if (ups.length) { await a.updateEmbeddedDocuments("Item", ups); n += ups.length; }
      }
      const ups = game.items.map(fix).filter(Boolean);
      if (ups.length) { await Item.updateDocuments(ups); n += ups.length; }
      await game.settings.set(ID, "weightFill5Fix", "1");
      if (n) ui.notifications.info(`1e FRPG: weights updated on ${n} owned items.`);
    } catch (e) { console.warn("frpg1e | weight fill 5 fix", e); }
  }
  // one-time (0.47.6): Cyclocone not counted (a hat); Prison of Binding 50 (a birdcage).
  // Only blank weights are changed.
  if (game.settings.get(ID, "weightFill6Fix") !== "1") {
    try {
      const src = {};
      for (const f of ["equipment.json", "magic-items.json", "weapons.json"]) {
        const data = await (await fetch(`systems/${ID}/data/${f}`)).json();
        for (const d of data) src[`${d.type}|${d.name}`] = d.system;
      }
      const fix = i => {
        const d = src[`${i.type}|${i.name}`];
        if (!d || !d.weightSource || d.weightSource === "unspecified") return null;
        const s = i.system, w = Number(s.weight) || 0;
        if (w || !["", "unspecified"].includes(s.weightSource ?? "")) return null;
        return { _id: i.id, "system.weight": Number(d.weight) || 0, "system.weightSource": d.weightSource, "system.weightRef": d.weightRef ?? "" };
      };
      let n = 0;
      for (const a of game.actors) {
        const ups = a.items.map(fix).filter(Boolean);
        if (ups.length) { await a.updateEmbeddedDocuments("Item", ups); n += ups.length; }
      }
      const ups = game.items.map(fix).filter(Boolean);
      if (ups.length) { await Item.updateDocuments(ups); n += ups.length; }
      await game.settings.set(ID, "weightFill6Fix", "1");
      if (n) ui.notifications.info(`1e FRPG: weights updated on ${n} owned items.`);
    } catch (e) { console.warn("frpg1e | weight fill 6 fix", e); }
  }
  // one-time (0.47.7): Stone Horse 20,000 and Underwater Apparatus 8,000 (DM estimates).
  // Only blank weights are changed.
  if (game.settings.get(ID, "weightFill7Fix") !== "1") {
    try {
      const src = {};
      for (const f of ["equipment.json", "magic-items.json", "weapons.json"]) {
        const data = await (await fetch(`systems/${ID}/data/${f}`)).json();
        for (const d of data) src[`${d.type}|${d.name}`] = d.system;
      }
      const fix = i => {
        const d = src[`${i.type}|${i.name}`];
        if (!d || !d.weightSource || d.weightSource === "unspecified") return null;
        const s = i.system, w = Number(s.weight) || 0;
        if (w || !["", "unspecified"].includes(s.weightSource ?? "")) return null;
        return { _id: i.id, "system.weight": Number(d.weight) || 0, "system.weightSource": d.weightSource, "system.weightRef": d.weightRef ?? "" };
      };
      let n = 0;
      for (const a of game.actors) {
        const ups = a.items.map(fix).filter(Boolean);
        if (ups.length) { await a.updateEmbeddedDocuments("Item", ups); n += ups.length; }
      }
      const ups = game.items.map(fix).filter(Boolean);
      if (ups.length) { await Item.updateDocuments(ups); n += ups.length; }
      await game.settings.set(ID, "weightFill7Fix", "1");
      if (n) ui.notifications.info(`1e FRPG: weights updated on ${n} owned items.`);
    } catch (e) { console.warn("frpg1e | weight fill 7 fix", e); }
  }
  // one-time (0.47.8): Anything Armor and Sword (Anything) become real armor and a weapon (Leather Armor +1 and a long sword +1
  // by default) so they can be worn or wielded; owned copies are replaced, keeping their location. Anything Item weighs 3.
  if (game.settings.get(ID, "anythingFix") !== "1") {
    try {
      const data = await (await fetch(`systems/${ID}/data/magic-items.json`)).json();
      const byName = Object.fromEntries(data.map(d => [d.name, d]));
      let n = 0;
      const swap = async (owner, coll) => {
        const olds = coll.filter(i => i.type === "magic" && ["Anything Armor", "Sword, Anything"].includes(i.name));
        if (!olds.length) return;
        const creates = olds.map(o => {
          const d = foundry.utils.deepClone(byName[o.name]);
          d.system.location = o.system.location ?? "carried";
          d.system.equipped = false;
          if (o.img && o.img !== "icons/svg/item-bag.svg") d.img = o.img;
          return d;
        });
        if (owner) { await owner.createEmbeddedDocuments("Item", creates); await owner.deleteEmbeddedDocuments("Item", olds.map(o => o.id)); }
        else { await Item.createDocuments(creates.map((c, k) => ({ ...c, folder: olds[k].folder?.id ?? null }))); await Item.deleteDocuments(olds.map(o => o.id)); }
        n += olds.length;
      };
      for (const a of game.actors) await swap(a, a.items);
      await swap(null, game.items);
      const fill = i => (i.type === "magic" && i.name === "Anything Item" && !Number(i.system.weight) && ["", "unspecified"].includes(i.system.weightSource ?? ""))
        ? { _id: i.id, "system.weight": 3, "system.weightSource": "derived", "system.weightRef": "Small miscellaneous magic item, 1-5 (midpoint)" } : null;
      for (const a of game.actors) { const ups = a.items.map(fill).filter(Boolean); if (ups.length) { await a.updateEmbeddedDocuments("Item", ups); n += ups.length; } }
      const ups = game.items.map(fill).filter(Boolean); if (ups.length) { await Item.updateDocuments(ups); n += ups.length; }
      await game.settings.set(ID, "anythingFix", "1");
      if (n) ui.notifications.info(`1e FRPG: Anything Armor, Sword (Anything) and Anything Item updated on ${n} owned items.`);
    } catch (e) { console.warn("frpg1e | anything fix", e); }
  }
  // one-time (0.48.0): owned items whose "when found" roll already shows (charges set, or a Bag of Holding capacity) are marked
  // as found so it is never rolled again. Others keep one roll, made from Show/Use, then locked.
  // one-time (0.49.0): dwarves, gnomes and halflings still at the old 12" base move go to 9" (Gary Gygax, Dragonsfoot Q&A)
  if (game.settings.get(ID, "raceMoveFix") !== "1") {
    try {
      const ups = game.actors.filter(a => ["character", "npc"].includes(a.type) && a.system.move?.base === 12 && raceBaseMove(a.system.details?.race) === 9)
        .map(a => ({ _id: a.id, "system.move.base": 9 }));
      if (ups.length) await Actor.updateDocuments(ups);
      await game.settings.set(ID, "raceMoveFix", "1");
      if (ups.length) ui.notifications.info(`1e FRPG: ${ups.length} dwarf, gnome and halfling characters and NPCs now have a 9" base move.`);
    } catch (e) { console.warn("frpg1e | race move fix", e); }
  }
  if (game.settings.get(ID, "foundFlagFix") !== "1") {
    try {
      const FIND = "Determine type (when found)";
      let n = 0;
      for (const a of game.actors) {
        const ups = [];
        for (const i of a.items) {
          const finds = (i.system.rolls ?? []).filter(r => r.fn === FIND);
          if (!finds.length || i.getFlag(ID, "found")) continue;
          const bits = [];
          if (finds.some(r => /^charges/i.test(r.label)) && (i.system.charges?.max ?? 0) > 0) bits.push(`Charges: ${i.system.charges.max}`);
          if (finds.some(r => /^capacity/i.test(r.label)) && (i.system.container?.capacity ?? 0) > 0) bits.push(`Capacity: holds ${i.system.container.capacity.toLocaleString()} gp, weighs ${Number(i.system.weight || 0).toLocaleString()} gp`);
          if (bits.length) ups.push({ _id: i.id, "flags.frpg1e.found": { summary: bits.join("; ") + " (rolled before 0.48.0)", at: Date.now() } });
        }
        if (ups.length) { await a.updateEmbeddedDocuments("Item", ups); n += ups.length; }
      }
      await game.settings.set(ID, "foundFlagFix", "1");
      if (n) console.log(`frpg1e | marked ${n} owned items as already found`);
    } catch (e) { console.warn("frpg1e | found flag fix", e); }
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

/** Sheet style: the body class picks the look of every 1e FRPG window (sheets, dialogs, add-on module tabs). */
function applySheetStyle(v = game.settings.get(ID, "sheetStyle")) {
  document.body.classList.toggle("frpg1e-gold", v === "goldenrod");
}

function registerSettings() {
  game.settings.register(ID, "sheetStyle", {
    name: "Sheet style",
    hint: "Parchment, or goldenrod like the classic printed record sheets (goldenrod stock, black rules, heavy capitals). Applies to every 1e FRPG sheet and dialog.",
    scope: "world", config: true, type: String, choices: { parchment: "Parchment", goldenrod: "Goldenrod" }, default: "parchment",
    onChange: v => applySheetStyle(v)
  });
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
  game.settings.register(ID, "encumbranceRule", {
    name: "Encumbrance and movement",
    hint: "PHB p.101: 350 / 700 / 1,050 / 1,500 gp limits for full, 3/4, 1/2 and 1/4 movement, each raised by the strength weight allowance. WSG p.30 Table 11: Light, Moderate, Heavy and Severe limits by strength score. Off: carried weight does not change movement.",
    scope: "world", config: true, type: String, choices: { PHB: "PHB (default)", WSG: "Wilderness Survival Guide", off: "Off" }, default: "PHB",
    onChange: () => { for (const a of game.actors ?? []) { if (a.type !== "monster") { a.prepareData(); a.sheet?.rendered && a.sheet.render(); } } }
  });
  game.settings.register(ID, "deathRule", {
    name: "Death at negative hit points",
    hint: "PHB p.105: dead at 0 hit points. DMG p.82: unconscious at 0, losing 1 hit point a round until bound, dead at -10. Gary Gygax's own campaign (Dragonsfoot Q&A): dead at -10% of total hit points, rounded up, so higher-level characters last longer. Shown under Hit Points on character and NPC sheets.",
    scope: "world", config: true, type: String, choices: { DMG: "DMG: dead at -10 (default)", PHB: "PHB: dead at 0", GG: "Gary's: dead at -10% of total hit points" }, default: "DMG",
    onChange: () => { for (const a of game.actors ?? []) { if (a.type !== "monster") { a.prepareData(); a.sheet?.rendered && a.sheet.render(); } } }
  });
  game.settings.register(ID, "druidBonusSpells", {
    name: "Druids get wisdom bonus spells",
    hint: "On: druids get bonus spells for high wisdom, as clerics do (PHB errata, Dragon #35). Off: no bonus spells for druids (Gary Gygax's later answer on Dragonsfoot: \"Short answer: No\").",
    scope: "world", config: true, type: Boolean, default: true,
    onChange: () => { for (const a of game.actors ?? []) { if (a.type !== "monster") { a.prepareData(); a.sheet?.rendered && a.sheet.render(); } } }
  });
  game.settings.register(ID, "critFumble", {
    name: "Natural 20 critical hit, natural 1 fumble",
    hint: "House rule (the PHB and DMG have none): on an attack roll a natural 20 always hits and is marked CRITICAL HIT, and a natural 1 always misses and is marked FUMBLE. The effect of either is left to the DM. Off by default: Gary Gygax did not use critical hits (Dragonsfoot Q&A).",
    scope: "world", config: true, type: Boolean, default: false
  });
  game.settings.register(ID, "magicTables", {
    name: "Magic item tables",
    hint: "Default tables for random magic items: the revised tables of UA (p.84-89, which add the UA items) or the DMG tables III.A-H.",
    scope: "world", config: true, type: String, choices: { UA: "UA (revised)", DMG: "DMG" }, default: "UA"
  });
  game.settings.register(ID, "tokenFix", { scope: "world", config: false, type: String, default: "" });
  game.settings.register(ID, "tokenNameFix", { scope: "world", config: false, type: String, default: "" });
  game.settings.register(ID, "gemIconFix", { scope: "world", config: false, type: String, default: "" });
  game.settings.register(ID, "sleepFix", { scope: "world", config: false, type: String, default: "" });
  game.settings.register(ID, "magicWeaponFix", { scope: "world", config: false, type: String, default: "" });
  game.settings.register(ID, "wornLocationFix", { scope: "world", config: false, type: String, default: "" });
  game.settings.register(ID, "containerFix", { scope: "world", config: false, type: String, default: "" });
  game.settings.register(ID, "weightSourceFix", { scope: "world", config: false, type: String, default: "" });
  game.settings.register(ID, "weightFillFix", { scope: "world", config: false, type: String, default: "" });
  game.settings.register(ID, "weightFill3Fix", { scope: "world", config: false, type: String, default: "" });
  game.settings.register(ID, "weightFill4Fix", { scope: "world", config: false, type: String, default: "" });
  game.settings.register(ID, "weightFill5Fix", { scope: "world", config: false, type: String, default: "" });
  game.settings.register(ID, "weightFill6Fix", { scope: "world", config: false, type: String, default: "" });
  game.settings.register(ID, "weightFill7Fix", { scope: "world", config: false, type: String, default: "" });
  game.settings.register(ID, "anythingFix", { scope: "world", config: false, type: String, default: "" });
  game.settings.register(ID, "foundFlagFix", { scope: "world", config: false, type: String, default: "" });
  game.settings.register(ID, "raceMoveFix", { scope: "world", config: false, type: String, default: "" });
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
