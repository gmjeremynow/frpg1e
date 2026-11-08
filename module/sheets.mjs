import { CLASSES, ATTACK_MATRICES, SAVING_THROWS, THIEF_TABLE, THIEF_ARMOR, fighterAttacksPerRound, cavalierChoiceBonus,
  PSI_ATTACK_MODES, PSI_DEFENSE_MODES, BODY_WEAPONRY, weaponProfCost } from "./tables.mjs";
import * as Psi from "./psionics.mjs";
import * as Rolls from "./rolls.mjs";
import { SYSTEM_ID, SAVE_LABELS, SAVE_SHORT, THIEF_LABELS } from "./rolls.mjs";
import * as RACE from "./races.mjs";
import * as CF from "./classfeatures.mjs";
import * as Treasure from "./treasure.mjs";
import { RACES, MAGIC_CATEGORIES, TREASURE_KINDS, ABILITY_LABELS, PROF_GROUPS, NPC_ROLES, NPC_SERVING } from "./data/models.mjs";
import { LOYALTY_GROUPS } from "./tables.mjs";
import * as R from "./rules.mjs";

const { HandlebarsApplicationMixin } = foundry.applications.api;
const { ActorSheetV2, ItemSheetV2 } = foundry.applications.sheets;
const TextEditor = foundry.applications.ux.TextEditor.implementation;

const LISTS = { cleric: "Cleric", druid: "Druid", magicuser: "Magic-User", illusionist: "Illusionist" };
const ORD = ["", "1st", "2nd", "3rd", "4th", "5th", "6th", "7th", "8th", "9th"];
/**
 * Text editors: built with Foundry's own HTMLProseMirrorElement.create() (raw value and enriched display passed
 * explicitly), replacing the template's <prose-mirror> markup, whose raw value did not reach the editor in V14.
 */
function mountEditors(root, doc, context) {
  const PM = foundry.applications?.elements?.HTMLProseMirrorElement;
  if (!PM?.create) return;
  for (const slot of root.querySelectorAll(".pm-slot[data-pm-name]")) {
    const name = slot.dataset.pmName;
    try {
      const el = PM.create({ name, value: foundry.utils.getProperty(doc._source, name) ?? "", enriched: context[slot.dataset.pmEnriched] ?? "",
        toggled: true, collaborate: false, documentUUID: doc.uuid });
      slot.replaceChildren(el);
    } catch (err) { console.warn(`frpg1e | editor for ${name}: kept the template editor`, err); }
  }
}
const signed = n => (n > 0 ? `+${n}` : n < 0 ? `${n}` : "0");
/** Record-tab race box: UA level limits for each class, classes open, multi-class options, notes. */
function raceContext(s) {
  const key = s.details.race || "human";
  const def = RACE.RACE_DEFS[key] ?? RACE.RACE_DEFS.human;
  const sex = RACE.sexKey(s.details.sex);
  const single = s.classInfo.length === 1;
  const limits = s.classInfo.filter(c => c.key !== "custom").map(c => {
    const r = RACE.levelLimit(key, c.key, s.abilities, { sex, singleClass: single });
    const max = r.allowed === false ? "not allowed" : r.limit === "U" ? "Unlimited" : r.limit ?? "Unknown";
    const warn = r.allowed === false || (typeof r.limit === "number" && c.level > r.limit);
    return { label: c.label, level: c.level, max, note: r.note, warn };
  });
  const keys = s.classInfo.map(c => c.key);
  const mc = keys.length > 1 ? RACE.multiClassAllowed(key, keys) : null;
  const com = RACE.comelinessAdj(key, sex);
  return {
    label: def.label, src: def.src, human: def.base === "human" && !def.ext, limits,
    rangeSource: def.ext ? (def.ext.rangeSource ?? def.src) : "PHB Character Race Table III",
    open: RACE.classesOpen(key).map(k => CLASSES[k]?.label ?? k).join(", "),
    multi: RACE.multiClassOptions(key).join(", "),
    multiWarn: mc === false ? `${s.classInfo.map(c => c.label).join("/")} is not a multi-class choice for this race (${def.ext ? def.src : "UA Character Race Table III"}).` : "",
    comeliness: com === null ? (def.ext ? "Unknown (not given)" : "Unknown until Sex is M or F (drow males −1, females +1)") : (com > 0 ? `+${com}` : String(com)),
    abilityWarnings: RACE.abilityWarnings(key, s.abilities, sex),
    facts: RACE.raceFacts(key),
    saveNote: RACE.RACE_SAVE_NOTES[key] ?? ""
  };
}
const opt = (obj) => Object.entries(obj).map(([value, label]) => ({ value, label }));

/* ================================================================== */
/*  Pop-out: Foundry V14 lets any ApplicationV2 window detach into its   */
/*  own browser window (ApplicationV2#detachWindow / #attachWindow).     */
/* ================================================================== */
function isDetached(app) {
  const view = app.element?.ownerDocument?.defaultView;
  return !!view && view !== globalThis.window;
}
function popOutControls(app, controls) {
  if (typeof app.detachWindow !== "function") return controls;   // Foundry before V14
  const detached = isDetached(app);
  if (!detached && app._canDetach?.() !== false) {
    controls.push({ icon: "fa-solid fa-up-right-from-square", label: "Pop Out to Its Own Window", action: "popOut" });
  }
  if (detached) controls.push({ icon: "fa-solid fa-down-left-and-up-right-to-center", label: "Return to the Game Window", action: "popIn" });
  return controls;
}
async function onPopOut() {
  try { await this.detachWindow(); }
  catch (err) { console.error(err); ui.notifications.warn("This window could not be popped out. Your browser may be blocking pop-up windows for this site."); }
}
async function onPopIn() {
  try { await this.attachWindow(); } catch (err) { console.error(err); }
}

/* ================================================================== */
/*  Shared actor sheet behaviour                                        */
/* ================================================================== */
class ADnDActorSheet extends HandlebarsApplicationMixin(ActorSheetV2) {
  static DEFAULT_OPTIONS = {
    classes: ["frpg1e", "sheet", "actor"],
    form: { submitOnChange: true },
    window: { resizable: true },
    actions: {
      sheetTab: ADnDActorSheet.#onTab,
      popOut: onPopOut,
      popIn: onPopIn,
      attack: ADnDActorSheet.#onAttack,
      brawl: function () { return Rolls.rollBrawl(this.actor); },
      rollInitiative: function () { return Rolls.rollActorInitiative(this.actor); },
      rollSurprise: function () { return Rolls.rollActorSurprise(this.actor); },
      rollAbilityScores: function () { return Rolls.rollAbilityScores(this.actor); },
      rollMorale: function () { return Rolls.rollMorale(this.actor); },
      save: ADnDActorSheet.#onSave,
      itemCreate: ADnDActorSheet.#onItemCreate,
      itemEdit: ADnDActorSheet.#onItemEdit,
      itemDelete: ADnDActorSheet.#onItemDelete,
      itemToggle: ADnDActorSheet.#onItemToggle,
      itemChat: ADnDActorSheet.#onItemChat,
      psiAttack: ADnDActorSheet.#onPsiAttack,
      psiUse: ADnDActorSheet.#onPsiUse,
      psiPay: ADnDActorSheet.#onPsiPay,
      magicUse: ADnDActorSheet.#onMagicUse,
      profRoll: ADnDActorSheet.#onProfRoll,
      abilityCheck: ADnDActorSheet.#onAbilityCheck,
      profWeaponAdd: ADnDActorSheet.#onProfWeaponAdd,
      profWeaponRemove: ADnDActorSheet.#onProfWeaponRemove,
      chargeAdjust: ADnDActorSheet.#onChargeAdjust,
      psiReset: ADnDActorSheet.#onPsiReset
    }
  };

  _tab = "record";

  _getHeaderControls() {
    return popOutControls(this, super._getHeaderControls());
  }

  async _prepareContext(options) {
    const ctx = await super._prepareContext(options);
    const actor = this.actor;
    ctx.actor = actor;
    ctx.system = actor.system;
    ctx.isGM = game.user.isGM;
    ctx.tab = this._tab;
    ctx.saves = Rolls.SAVE_KEYS.map(k => ({ key: k, label: SAVE_LABELS[k], short: SAVE_SHORT[k], value: actor.system.saves[k].value }));
    return ctx;
  }

  _onRender(context, options) {
    super._onRender(context, options);
    mountEditors(this.element, this.actor, context);
    this.#applyTab();
    // Weapon proficiency list (system.profs.weapons): rebuild the array on change
    this.element.querySelectorAll("[data-prof-index]").forEach(el => {
      el.addEventListener("change", ev => {
        ev.stopPropagation();
        const list = foundry.utils.deepClone(this.actor._source.system.profs?.weapons ?? []);
        const row = list[Number(el.dataset.profIndex)];
        if (!row) return;
        row[el.dataset.profField] = el.type === "checkbox" ? el.checked : el.value;
        this.actor.update({ "system.profs.weapons": list });
      });
    });
    // Inline numeric edits on embedded items (quantity, memorized, etc.)
    this.element.querySelectorAll("[data-item-field]").forEach(el => {
      el.addEventListener("change", ev => {
        ev.stopPropagation();
        const id = el.closest("[data-item-id]")?.dataset.itemId;
        const item = this.actor.items.get(id);
        if (!item) return;
        const value = el.type === "checkbox" ? el.checked : (el.dataset.dtype === "Number" ? Number(el.value) || 0 : el.value);
        item.update({ [el.dataset.itemField]: value });
      });
    });
  }

  #applyTab() {
    const root = this.element;
    root.querySelectorAll(".sheet-tabs [data-tab]").forEach(b => b.classList.toggle("active", b.dataset.tab === this._tab));
    root.querySelectorAll(".tab-body[data-tab]").forEach(s => s.classList.toggle("active", s.dataset.tab === this._tab));
  }

  static #onTab(event, target) {
    this._tab = target.dataset.tab;
    this.#applyTab();
  }
  static #onAttack(event, target) {
    const id = target.closest("[data-item-id]")?.dataset.itemId;
    const routine = target.dataset.routine;
    return Rolls.rollAttack(this.actor, {
      item: id ? this.actor.items.get(id) : null,
      routine: routine !== undefined ? Number(routine) : null,
      fast: event.shiftKey
    });
  }
  static #onSave(event, target) {
    return Rolls.rollSave(this.actor, target.dataset.save, { fast: event.shiftKey });
  }
  static #onPsiAttack(event, target) { return Psi.psionicAttack(this.actor, target.dataset.mode); }
  static #onPsiUse(event, target) {
    const item = this.actor.items.get(target.closest("[data-item-id]")?.dataset.itemId);
    if (item) return Psi.useDiscipline(this.actor, item);
  }
  static #onMagicUse(event, target) {
    const item = this.actor.items.get(target.closest("[data-item-id]")?.dataset.itemId);
    if (item) return Rolls.useMagicItem(this.actor, item);
  }
  static #onAbilityCheck(event, target) {
    return Rolls.rollAbilityCheck(this.actor, target.dataset.ability, { fast: event.shiftKey });
  }
  static #onProfRoll(event, target) {
    const item = this.actor.items.get(target.closest("[data-item-id]")?.dataset.itemId);
    if (item) return Rolls.rollProficiency(this.actor, item, { fast: event.shiftKey });
  }
  static #onProfWeaponAdd() {
    const list = foundry.utils.deepClone(this.actor._source.system.profs?.weapons ?? []);
    list.push({ name: "", spec: "", bow: false });
    return this.actor.update({ "system.profs.weapons": list });
  }
  static #onProfWeaponRemove(event, target) {
    const list = foundry.utils.deepClone(this.actor._source.system.profs?.weapons ?? []);
    list.splice(Number(target.dataset.index), 1);
    return this.actor.update({ "system.profs.weapons": list });
  }
  static #onChargeAdjust(event, target) {
    const item = this.actor.items.get(target.closest("[data-item-id]")?.dataset.itemId);
    if (!item) return;
    const v = Math.max(0, item.system.charges.value + Number(target.dataset.delta));
    return item.update({ "system.charges.value": item.system.charges.max ? Math.min(v, item.system.charges.max) : v });
  }
  static #onPsiPay(event, target) {
    const item = this.actor.items.get(target.closest("[data-item-id]")?.dataset.itemId);
    if (item) return Psi.maintainDiscipline(this.actor, item);
  }
  static #onPsiReset() {
    const st = this.actor.system.psionics.strength;
    return this.actor.update({ "system.psionics.attack": st, "system.psionics.defense": st });
  }
  static async #onItemCreate(event, target) {
    const type = target.dataset.type;
    const system = {};
    if (type === "spell" && target.dataset.list) { system.list = target.dataset.list; system.level = target.dataset.level !== undefined ? Number(target.dataset.level) : 1; }
    if (type === "armor" && target.dataset.kind) system.kind = target.dataset.kind;
    if (type === "weapon" && this.actor.type === "monster") system.natural = true;
    const names = { weapon: "New Weapon", armor: "New Armor", spell: "New Spell", gear: "New Item", psionic: "New Discipline", magic: "New Magic Item", treasure: "New Treasure" };
    const [item] = await this.actor.createEmbeddedDocuments("Item", [{ name: names[type] ?? "New Item", type, system }]);
    item?.sheet.render(true);
  }
  static #onItemEdit(event, target) {
    const id = target.closest("[data-item-id]")?.dataset.itemId;
    this.actor.items.get(id)?.sheet.render(true);
  }
  static async #onItemDelete(event, target) {
    const id = target.closest("[data-item-id]")?.dataset.itemId;
    const item = this.actor.items.get(id);
    if (!item) return;
    const ok = event.shiftKey || await foundry.applications.api.DialogV2.confirm({
      window: { title: "Delete Item" }, content: `<p>Delete <strong>${item.name}</strong>?</p>`, rejectClose: false
    });
    if (ok) item.delete();
  }
  static #onItemToggle(event, target) {
    const id = target.closest("[data-item-id]")?.dataset.itemId;
    const item = this.actor.items.get(id);
    const field = target.dataset.field;
    if (item) item.update({ [field]: !foundry.utils.getProperty(item, field) });
  }
  static async #onItemChat(event, target) {
    const id = target.closest("[data-item-id]")?.dataset.itemId;
    const item = this.actor.items.get(id);
    if (!item) return;
    const content = await foundry.applications.handlebars.renderTemplate(`systems/${SYSTEM_ID}/templates/chat/item.hbs`, {
      item, s: item.system, description: await TextEditor.enrichHTML(item.system.description ?? "", { relativeTo: item })
    });
    const msg = { speaker: ChatMessage.getSpeaker({ actor: this.actor }), content };
    ChatMessage.applyMode(msg);
    ChatMessage.create(msg);
  }
}

/* ================================================================== */
/*  Character sheet                                                     */
/* ================================================================== */
export class CharacterSheet extends ADnDActorSheet {
  static DEFAULT_OPTIONS = {
    classes: ["frpg1e", "sheet", "actor", "character"],
    position: { width: 860, height: 820 },
    actions: {
      thief: CharacterSheet.#onThief,
      turn: CharacterSheet.#onTurn,
      openDoors: CharacterSheet.#onOpenDoors,
      bendBars: CharacterSheet.#onBendBars,
      levelHP: CharacterSheet.#onLevelHP,
      classAdd: CharacterSheet.#onClassAdd,
      classRemove: CharacterSheet.#onClassRemove,
      memorize: CharacterSheet.#onMemorize,
      cast: CharacterSheet.#onCast,
      systemShock: CharacterSheet.#onSystemShock,
      resurrection: CharacterSheet.#onResurrection,
      pct: CharacterSheet.#onPct,
      rangerTrack: CharacterSheet.#onRangerTrack,
      barbTrack: CharacterSheet.#onBarbTrack,
      assassinate: CharacterSheet.#onAssassinate,
      disguise: CharacterSheet.#onDisguise,
      psiPotential: CharacterSheet.#onPsiPotential,
      psiStrength: CharacterSheet.#onPsiStrength,
      psiRecovery: CharacterSheet.#onPsiRecovery
    }
  };
  static PARTS = {
    sheet: { template: `systems/${SYSTEM_ID}/templates/actor/character.hbs`, scrollable: [".tab-scroll"] }
  };

  async _prepareContext(options) {
    const ctx = await super._prepareContext(options);
    const a = this.actor, s = a.system, m = s.mods;
    ctx.races = opt(RACES);
    ctx.race = raceContext(s);
    ctx.classOptions = Object.entries(CLASSES).map(([value, c]) => ({ value, label: c.label }));
    ctx.matrixOptions = [{ value: "", label: "(class default)" }, ...Object.entries(ATTACK_MATRICES).map(([value, c]) => ({ value, label: c.label }))];
    ctx.saveOptions = [{ value: "", label: "(class default)" }, ...Object.keys(SAVING_THROWS).map(value => ({ value, label: { cleric: "Cleric", fighter: "Fighter", magicuser: "Magic-User", thief: "Thief" }[value] }))];
    ctx.classes = s.classInfo.map(c => ({
      ...c, isCustom: c.key === "custom", next: c.next ? c.next.toLocaleString() : "—",
      attacksPerRound: fighterAttacksPerRound(c.key, c.level)
    }));
    ctx.exceptional = s.abilities.str.value === 18 && s.classInfo.some(c => c.def.exceptionalStr);
    ctx.ab = [
      { key: "str", label: "Strength", short: "S", value: s.abilities.str.value, cells: [
        ["Hit Prob.", signed(m.str.hit)], ["Damage", signed(m.str.dmg)], ["Wt. Allow.", signed(m.str.wt)],
        ["Open Doors", m.str.od, "openDoors"], ["Bend Bars", `${m.str.bb}%`, "bendBars"]] },
      { key: "int", label: "Intelligence", short: "I", value: s.abilities.int.value, cells: [
        ["Add. Lang.", m.int.languages], ["Know Spell", m.int.knowSpell ? `${m.int.knowSpell}%` : "—"],
        ["Min/Level", m.int.minSpells ?? "—"], ["Max/Level", m.int.maxSpells ?? "—"]] },
      { key: "wis", label: "Wisdom", short: "W", value: s.abilities.wis.value, cells: [
        ["Magic Adj.", signed(m.wis.magicAdj)], ["Spell Fail.", m.wis.spellFailure === null ? "—" : `${m.wis.spellFailure}%`],
        ["Bonus Spells", m.wis.bonusSpells.map((n, i) => n ? `${ORD[i]}${n > 1 ? `×${n}` : ""}` : "").filter(Boolean).join(" ") || "—"]] },
      { key: "dex", label: "Dexterity", short: "D", value: s.abilities.dex.value, cells: [
        ["Reaction/Missile", signed(m.dex.reaction)], ["Defensive", signed(m.dex.defense)]] },
      { key: "con", label: "Constitution", short: "C", value: s.abilities.con.value, cells: [
        ["HP Adj.", signed(m.con.hpAdj)], ["Sys. Shock", `${m.con.systemShock}%`, "systemShock"],
        ["Resurrect", `${m.con.resurrection}%`, "resurrection"]] },
      { key: "cha", label: "Charisma", short: "Ch", value: s.abilities.cha.value, cells: [
        ["Henchmen", m.cha.henchmen], ["Loyalty", signed(m.cha.loyalty) + "%"], ["Reaction", signed(m.cha.reaction) + "%"]] }
    ];
    ctx.racial = s.racialSave ? `${signed(s.racialSave.value)} vs. rods, staves, wands, spells${s.racialSave.poison ? " and poison" : ""}` : "";

    // Items
    const items = a.items.contents.sort((x, y) => (x.sort ?? 0) - (y.sort ?? 0));
    ctx.weapons = items.filter(i => i.type === "weapon").map(i => ({
      id: i.id, name: i.name, img: i.img, s: i.system,
      dmgText: `${i.system.damage.sm} / ${i.system.damage.l}`,
      rangeText: i.system.damage.smRange ? `${i.system.damage.smRange} / ${i.system.damage.lRange}` : "",
      missile: i.system.attackType !== "melee" && i.system.missile.short ? `${i.system.missile.short}/${i.system.missile.medium}/${i.system.missile.long}` : "",
      row: Rolls.weaponToHitRow(a, i),
      tags: weaponTags(a, i)
    }));
    ctx.acHeader = Array.from({ length: 11 }, (_, i) => 10 - i);
    ctx.armor = items.filter(i => i.type === "armor");
    ctx.gear = items.filter(i => i.type === "gear");
    const USE = { potion: "Drink", scroll: "Read", wand: "Use", staff: "Use", rod: "Use" };
    ctx.magicItems = items.filter(i => i.type === "magic" && i.system.category !== "reference").map(i => ({
      id: i.id, name: i.name, img: i.img, s: i.system, cat: MAGIC_CATEGORIES[i.system.category] ?? "",
      useLabel: USE[i.system.category] ?? "Show", charged: ["wand", "staff", "rod"].includes(i.system.category),
      stack: ["potion", "scroll", "ammunition"].includes(i.system.category),
      wearable: !!i.system.protection?.kind || ["ring", "misc"].includes(i.system.category)
    }));
    ctx.treasureItems = items.filter(i => i.type === "treasure").map(i => ({
      id: i.id, name: i.name, img: i.img, s: i.system, kind: TREASURE_KINDS[i.system.kind] ?? "",
      total: Math.round(i.system.value * i.system.quantity * 100) / 100,
      totalText: (Math.round(i.system.value * i.system.quantity * 100) / 100).toLocaleString()
    }));
    ctx.treasureTotal = ctx.treasureItems.reduce((t, i) => t + i.total, 0).toLocaleString();
    // Proficiencies (DSG Table 10 / WSG Table 1)
    {
      const slots = s.profSlots;
      const weapons = (s.profs.weapons ?? []).map((w, index) => ({ ...w, index, cost: weaponProfCost(w) }));
      const weaponUsed = weapons.reduce((t, w) => t + w.cost, 0);
      const nwp = items.filter(i => i.type === "proficiency").map(i => {
        const p = i.system, score = s.abilities[p.ability]?.value ?? null;
        const net = p.modifier - 2 * p.improvements;
        return {
          id: i.id, name: i.name, img: i.img, p, slotsUsed: p.slots + p.improvements,
          abilityShort: p.check && p.ability ? ABILITY_LABELS[p.ability] : "—",
          modText: p.check && p.ability ? (net > 0 ? `+${net}` : `${net}`) : "",
          // the highest d20 roll that succeeds (unmodified 20, and 19 unless improved, always fail)
          target: p.check && score !== null ? Math.max(0, Math.min(p.improvements ? 19 : 18, Math.min(18, score) - net)) : null,
          tracking: i.name === "Tracking" && !p.check
        };
      });
      const nwUsed = nwp.reduce((t, n) => t + n.slotsUsed, 0);
      const overflow = Math.max(0, nwUsed - slots.nonweapon);
      const notes = [];
      if (slots.unknown.length) notes.push(`No proficiency table for: ${slots.unknown.join(", ")}`);
      if (overflow) notes.push(`${overflow} nonweapon slot${overflow > 1 ? "s" : ""} filled from weapon slots (WSG p.12 allows this; the reverse is not allowed)`);
      if (weaponUsed + overflow > slots.weapon) notes.push(`Over the weapon slots by ${weaponUsed + overflow - slots.weapon}`);
      ctx.profs = {
        slots, weapons, weaponUsed, nwp, nwUsed, overflow, notes,
        weaponFree: slots.weapon - weaponUsed - overflow, nwFree: Math.max(0, slots.nonweapon - nwUsed),
        perClass: slots.per.map(c => `${CLASSES[c.key]?.label ?? c.key} ${c.level}: ${c.bard ? "+" : ""}${c.weapon} weapon / ${c.bard ? "+" : ""}${c.nonweapon} nonweapon`).join("; "),
        nonProf: s.classInfo.length ? Math.max(...s.classInfo.map(c => c.def.nonProf ?? -5)) : null
      };
    }
    ctx.protection = s.protection;
    ctx.thief = s.thiefSkills ? Object.entries(s.thiefSkills.skills).filter(([, v]) => v).map(([k, v]) => ({ key: k, label: THIEF_LABELS[k], ...v, misc: s.thief[k].misc })) : null;
    ctx.thiefArmorUnknown = s.thiefSkills && s.thiefArmorUnknown;
    ctx.thiefArmorLabel = s.thiefSkills ? (armorLabel(a) ?? "") : "";
    ctx.turn = Rolls.turnUndeadRows(a);
    ctx.turnLevel = Rolls.turningLevel(a);
    ctx.monk = s.monk;

    // Spells grouped by list then level, with slot counts
    const spellItems = items.filter(i => i.type === "spell");
    const lists = new Set([...Object.keys(s.spellSlots), ...spellItems.map(i => i.system.list)]);
    ctx.spellLists = [...lists].map(list => {
      const slots = s.spellSlots[list] ?? [];
      const ofList = spellItems.filter(i => i.system.list === list);
      const maxLevel = Math.max(slots.length, ...ofList.map(i => i.system.level), 0);
      const cantrips = ofList.filter(i => i.system.level === 0);
      const cantripMem = cantrips.reduce((t, i) => t + i.system.memorized, 0);
      // UA p.45: a magic-user may retain up to four cantrips in place of one 1st-level spell
      const cantripSlots = Math.ceil(cantripMem / 4);
      const levels = [];
      if (cantrips.length || (["magicuser", "illusionist"].includes(list) && slots.length)) {
        levels.push({ level: 0, ord: "Cantrips", cantrip: true, used: cantripMem, slotsUsed: cantripSlots, spells: cantrips });
      }
      for (let lvl = 1; lvl <= maxLevel; lvl++) {
        const spells = ofList.filter(i => i.system.level === lvl);
        const used = spells.reduce((t, i) => t + i.system.memorized, 0) + (lvl === 1 ? cantripSlots : 0);
        const max = slots[lvl - 1] ?? 0;
        levels.push({ level: lvl, ord: `${ORD[lvl]} level`, max, used, over: used > max, spells, extra: s.extraSlots[list]?.[lvl - 1] ?? 0,
          cantripNote: lvl === 1 && cantripSlots ? `includes ${cantripSlots} for cantrips` : "" });
      }
      return { list, label: LISTS[list] ?? list, levels };
    }).filter(l => l.levels.length);
    ctx.hasSpells = ctx.spellLists.length > 0;
    ctx.features = classFeatures(a);
    ctx.psi = psionicContext(a, items);
    ctx.multiClass = s.classInfo.length > 1;
    ctx.coins = s.money;
    ctx.encLbs = Math.round(s.encumbrance / 10);

    // Rich text
    ctx.biography = await TextEditor.enrichHTML(s.details.biography, { relativeTo: a });
    ctx.notes = await TextEditor.enrichHTML(s.details.notes, { relativeTo: a });
    return ctx;
  }

  _onRender(context, options) {
    super._onRender(context, options);
    // Class rows: edit the whole array at once (array fields are not form-friendly)
    this.element.querySelectorAll("[data-class-field]").forEach(el => {
      el.addEventListener("change", ev => {
        ev.stopPropagation();
        const idx = Number(el.closest("[data-class-index]").dataset.classIndex);
        const classes = foundry.utils.deepClone(this.actor.system._source.classes);
        const field = el.dataset.classField;
        classes[idx][field] = el.dataset.dtype === "Number" ? (Number(el.value) || 0) : el.value;
        this.actor.update({ "system.classes": classes });
      });
    });
    this.element.querySelectorAll("[data-extra-list]").forEach(el => {
      el.addEventListener("change", ev => {
        ev.stopPropagation();
        const list = el.dataset.extraList, lvl = Number(el.dataset.extraLevel);
        const arr = [...(this.actor.system._source.extraSlots[list] ?? [])];
        while (arr.length < lvl) arr.push(0);
        arr[lvl - 1] = Number(el.value) || 0;
        this.actor.update({ [`system.extraSlots.${list}`]: arr });
      });
    });
  }

  static #onThief(event, target) { return Rolls.rollThiefSkill(this.actor, target.dataset.skill); }
  static #onTurn(event, target) { return Rolls.rollTurnUndead(this.actor, target.dataset.undead); }
  static #onOpenDoors() { return Rolls.rollOpenDoors(this.actor); }
  static #onBendBars() { return Rolls.rollPercent(this.actor, "Bend Bars / Lift Gates", this.actor.system.mods.str.bb, { note: "One attempt only." }); }
  static #onSystemShock() { return Rolls.rollPercent(this.actor, "System Shock Survival", this.actor.system.mods.con.systemShock); }
  static #onResurrection() { return Rolls.rollPercent(this.actor, "Resurrection Survival", this.actor.system.mods.con.resurrection); }
  static #onPct(event, target) {
    const d = target.dataset;
    return Rolls.rollPercent(this.actor, d.label, Number(d.chance), { note: d.note ?? "" });
  }
  static #onRangerTrack(event) {
    const c = this.actor.system.classInfo.find(x => x.key === "ranger");
    return Rolls.rollRangerTracking(this.actor, { level: c.level, label: "Ranger", fast: event.shiftKey });
  }
  static #onBarbTrack(event) {
    const c = this.actor.system.classInfo.find(x => x.key === "barbarian");
    return Rolls.rollRangerTracking(this.actor, { level: c.level, label: "Barbarian", outdoorOnly: true, fast: event.shiftKey });
  }
  static #onAssassinate(event) {
    const c = this.actor.system.classInfo.find(x => x.key === "assassin");
    return Rolls.rollAssassination(this.actor, { level: c.level, fast: event.shiftKey });
  }
  static #onDisguise(event) { return Rolls.rollDisguise(this.actor, { fast: event.shiftKey }); }
  static #onPsiPotential() { return Psi.rollPotential(this.actor); }
  static #onPsiStrength() { return Psi.rollStrength(this.actor); }
  static #onPsiRecovery() { return Psi.psionicRecovery(this.actor); }
  static #onLevelHP(event, target) { return Rolls.rollLevelHP(this.actor, Number(target.closest("[data-class-index]").dataset.classIndex)); }
  static #onClassAdd() {
    const classes = foundry.utils.deepClone(this.actor.system._source.classes);
    classes.push({ key: "fighter", level: 1, xp: 0 });
    return this.actor.update({ "system.classes": classes });
  }
  static #onClassRemove(event, target) {
    const idx = Number(target.closest("[data-class-index]").dataset.classIndex);
    const classes = foundry.utils.deepClone(this.actor.system._source.classes);
    classes.splice(idx, 1);
    return this.actor.update({ "system.classes": classes });
  }
  static #onMemorize(event, target) {
    const item = this.actor.items.get(target.closest("[data-item-id]").dataset.itemId);
    if (!item) return;
    const delta = Number(target.dataset.delta);
    return item.update({ "system.memorized": Math.max(0, item.system.memorized + delta) });
  }
  static #onCast(event, target) {
    const item = this.actor.items.get(target.closest("[data-item-id]").dataset.itemId);
    if (item) return Rolls.castSpell(this.actor, item);
  }
}


/* ------------------------------------------------------------------ */
/*  Class feature boxes (bard, cavalier, barbarian, thief-acrobat)      */
/* ------------------------------------------------------------------ */
const pctRow = (label, chance, note = "") => ({ label, value: `${chance}%`, roll: { label, chance, note } });
const thiefBase = (level, idx) => THIEF_TABLE[Math.max(1, Math.min(17, level))][idx];

function weaponTags(actor, item) {
  const w = item.system, tags = [];
  const cls = actor.system.classInfo;
  if (w.specialized) tags.push(w.specialized === "double" ? "Double specialist" : "Specialist");
  const cav = cls.find(c => c.def.cavalier);
  if (w.choice && cav) {
    const b = cavalierChoiceBonus(w.choice, cav.level);
    tags.push(b ? `Weapon of choice +${b}${w.choice === "lance" ? " mounted" : ""}` : "Weapon of choice (not yet)");
  }
  const atk = Rolls.weaponAttacks(actor, item);
  if (atk) tags.push(`${atk} attacks/round`);
  return tags.join(" · ");
}

function armorLabel(actor) {
  const suit = actor.items.filter(i => i.type === "armor" && i.system.equipped && i.system.kind === "armor")
    .sort((a, b) => a.system.baseAC - b.system.baseAC)[0];
  if (!suit) return THIEF_ARMOR.none.label;
  return suit.system.thiefArmor ? THIEF_ARMOR[suit.system.thiefArmor].label : null;
}

function classFeatures(actor) {
  const s = actor.system, boxes = [];
  if (s.bard) {
    const b = s.bard;
    boxes.push({ title: `Bard Abilities`, sub: `${b.college} college`, rows: [
      { label: "College", value: b.college },
      { label: "New languages this level", value: b.languages },
      pctRow("Charm (song and playing)", b.charm, "Creatures within 4\" must save vs. magic or be charmed. Once per creature per day."),
      pctRow("Legend lore & item knowledge", b.lore, "Like the legend lore spell; also magical properties and alignment of permitted item types without touching.")
    ], notes: [
      "Fights at the level attained as a fighter and uses thieving abilities at the thief level attained (PHB p.118).",
      "Saves on the most favorable table, with the bard level counted as a druid.",
      "Two rounds of poetics: associated creatures gain +10% morale and +1 to hit for 1 turn.",
      "Negates harpy song and similar song attacks; stills shriekers."
    ] });
  }
  if (s.cavalier) {
    const c = s.cavalier;
    const L = c.level;
    const horse = [[3, "Vaults into the saddle in bulky armor and is underway in 1 segment"], [5, "Can urge a mount to +2\" movement for up to 6 turns"],
      [7, "Can ride a pegasus"], [9, "Can ride a hippogriff"], [11, "Can ride a griffon or similar (DM)"]]
      .filter(([lv]) => L >= lv).map(([, t]) => t);
    boxes.push({ title: "Cavalier Abilities", rows: [
      pctRow("Not thrown from saddle", c.horsemanship, "Also the chance not to be injured if the mount falls."),
      pctRow("Mind-affecting magic has no effect", 90, "Beguiling, charm, domination, hold, hypnosis, magic jar, possession, sleep, suggestion, psionic mind blast. In addition to any saving throw."),
      { label: "Fear", value: "Immune" },
      { label: "Save vs. illusion spells", value: "+2" }
    ], notes: [
      ...(actor.system.details.race === "human" ? ["Human: attacks from horseback as if 1 level higher (applied when you tick Mounted)."] : []),
      ...horse,
      "Good alignment: radiates protection from fear (1\" radius) and can function at negative hit points down to the hit points rolled at 1st level.",
      "Weapons of choice are set on each weapon's sheet; the bonus is added to the numbers on the Combat tab."
    ] });
  }
  if (s.barbarian) {
    const L = s.barbarian.level;
    const magicHit = L >= 12 ? 5 : L >= 10 ? 4 : L >= 8 ? 3 : L >= 6 ? 2 : L >= 4 ? 1 : 0;
    const cap = L > 17 ? " (thief table ends at 17th)" : "";
    boxes.push({ title: "Barbarian Abilities", rows: [
      pctRow("Back protection", Math.min(100, 5 * L), "A detected back attack becomes a normal attack, and the barbarian may attack the back attacker."),
      pctRow("Detect illusion", Math.min(75, 5 * L), "One round of concentration."),
      pctRow("Detect magic", Math.min(90, 25 + 5 * (L - 1)), "Not illusion/phantasm magic; type never revealed. One round of concentration."),
      pctRow("Climb cliffs and trees", thiefBase(L, 6), `As a thief of level ${L}${cap}: base table value.`),
      pctRow("Hide, familiar surroundings", thiefBase(L + 3, 4), `As hide in shadows for a thief of level ${L + 3}${L + 3 > 17 ? " (table ends at 17th)" : ""}: base table value.`),
      pctRow("Hide, unfamiliar surroundings", thiefBase(L, 4), `As hide in shadows for a thief of level ${L}${cap}: base table value.`),
      { label: "Hits creatures needing", value: magicHit ? `+${magicHit} weapons` : "—" },
      { label: "Surprises others", value: "3 in 6 (4 in 6 familiar)" },
      { label: "Is surprised", value: "10% (5% familiar)" },
      { label: "Tracking (outdoors)", value: `${CF.rangerTrackBase(L)}% base`, action: "barbTrack", hint: "Track as a ranger of the same level, outdoors only (UA p.21)" }
    ], notes: [
      "Saving throw bonuses are already in the numbers on the Record tab (poison +4: tick it when rolling).",
      "Leap 10' forward, 3' back or 3' up standing; running 15+d6' forward, 4+d4 (½' pips) up.",
      "Tracking as a ranger of the same level, outdoors only (click Tracking to roll with the UA modifiers)."
    ] });
  }
  const cls = key => s.classInfo.find(c => c.key === key && c.level > 0);
  const pal = cls("paladin") ?? cls("paladinUA");
  if (pal) {
    const L = pal.level, p = CF.paladinInfo(L);
    boxes.push({ title: "Paladin Abilities", sub: pal.key === "paladinUA" ? "UA: also has the cavalier abilities" : "", rows: [
      { label: "Detect evil", value: "60’, at will" },
      { label: "Saving throws", value: "+2 (in the numbers)" },
      { label: "Lay on hands", value: `${p.layOnHands} hp, 1/day` },
      { label: "Cure disease", value: `${p.cureDisease}/week` },
      { label: "Protection from evil", value: "1” radius, always" },
      { label: "Turn undead", value: p.turnAs ? `as cleric ${p.turnAs}` : "from 3rd level" },
      { label: "Warhorse", value: p.warhorse ? "may call (1 per 10 years)" : "from 4th level" }
    ], notes: [
      "Immune to all forms of disease (PHB p.22).",
      "Warhorse: intelligent heavy warhorse, 5+5 HD (5d8+5 hp), AC 5, move 18”; it appears magically (PHB p.22).",
      "With a holy sword unsheathed and held: a 1” diameter circle of power that dispels magic at the paladin's level (PHB p.22).",
      "Cleric spells from 9th level (Magic tab). Scrolls only those usable by fighters (PHB p.22).",
      "Strictures: at most 10 magic items (1 armor, 1 shield, 4 weapons, 4 others); no retained wealth beyond modest needs; tithe 10% of all income to a lawful good institution; lawful good henchmen only; associate only with good characters (PHB p.22-24).",
      "Lose lawful good alignment: lose all paladin powers. A knowingly evil act: paladinhood lost irrevocably (PHB p.22)."
    ] });
  }
  const rng = cls("ranger");
  if (rng) {
    const L = rng.level;
    boxes.push({ title: "Ranger Abilities", rows: [
      { label: "Tracking", value: `${CF.rangerTrackBase(L)}% base`, action: "rangerTrack", hint: "Roll tracking with the UA p.21-22 modifiers" },
      { label: "Damage vs. giant class", value: `+${L}`, },
      { label: "Surprises others", value: "3 in 6 (50%)" },
      { label: "Is surprised", value: "1 in 6" }
    ], notes: [
      `Giant class (UA p.22, +${L} damage in melee; add it on the damage card): ${CF.GIANT_CLASS.join(", ")}.`,
      `Track identification (a second roll at the tracking chance; UA p.22): ${CF.trackIdentification(L).join("; ")}.`,
      L >= 10 ? "Can use non-written magic items for clairaudience, clairvoyance, ESP and telepathy; attracts 2-24 followers, who are never replaced if lost (PHB p.25)." : "10th level: magic items of clairaudience, clairvoyance, ESP and telepathy; 2-24 followers (PHB p.25).",
      "Druid spells from 8th level, magic-user spells from 9th (Magic tab); cannot read druid or magic-user scrolls (PHB p.25).",
      "Weapons (UA p.22): one of the first three must be a bow or light crossbow; by 4th level the list must include a bow or light crossbow, a dagger or knife, a spear or axe, and a sword.",
      "Strictures: no hirelings or henchmen before 8th level; no more than three rangers together; only what can be carried on person and mount; non-good alignment ends ranger status forever (PHB p.24-25)."
    ] });
  }
  const dru = cls("druid");
  if (dru) {
    const L = dru.level;
    boxes.push({ title: "Druid Abilities", rows: [
      { label: "Saves vs. fire, lightning", value: "+2 (tick when rolling)" },
      { label: "Languages gained", value: `${CF.druidLanguages(L)} (plus druidic)` }
    ], notes: [
      ...CF.druidPowers(L),
      L < 3 ? "3rd level: identify plants, animals and pure water; pass through overgrowth (PHB p.21)." : "",
      L < 7 ? "7th level: immunity to woodland charm; change form 3 times a day (PHB p.21)." : "",
      "Languages: one per level from 3rd, chosen from centaur, dryad, elvish, faun, gnome, green dragon, hill giant, lizardman, manticore, nixie, pixie, sprite, treantish (PHB p.21).",
      "Cannot turn or control undead, demons or devils; leather armor and wooden shields only (PHB p.21).",
      L >= 11 ? "12th level and above are limited in number: to gain a level as Druid, Archdruid or Great Druid the character must find a vacancy or defeat a holder in spell or hand-to-hand combat (PHB p.21-22)." : ""
    ].filter(Boolean) });
  }
  if (s.monk) {
    const L = cls("monk")?.level ?? 1, m = s.monk;
    boxes.push({ title: "Monk Abilities", rows: [
      { label: "Open hand attacks", value: m.attacks },
      { label: "Open hand damage", value: m.damageRange },
      { label: "Weapon damage bonus", value: `+${CF.monkWeaponBonus(L)}` },
      { label: "Is surprised", value: CF.monkSurprised(L) },
      { label: "Kill chance (after a stun)", value: `AC ${L - 7 >= 0 ? "+" : "−"} ${Math.abs(L - 7)}%` },
      ...(CF.monkFall(L) ? [{ label: "Fall without damage", value: CF.monkFall(L) }] : [])
    ], notes: [
      "Stun: a hit with a to-hit roll 5 or more over the number needed stuns for 1-6 rounds. Kill: then d% at or under the stunned opponent's AC plus 1 per monk level over 7th (PHB p.30). No strength bonuses to hit or damage (PHB p.32).",
      "Dodge non-magical missiles that would hit with a save vs. petrification each. A made save against any attack means no damage" + (L >= 9 ? "; a failed save still takes only half damage where possible (PHB p.30)." : " (PHB p.30); from 9th level a failed save takes half."),
      ...CF.monkSpecials(L),
      "Thief abilities (open locks, find/remove traps, move silently, hide in shadows, hear noise, climb walls) at the monk's level are in the Thieving Skills box.",
      "Strictures: no armor or shield; at most 2 magic weapons and 3 other magic items; no henchmen before 6th level; levels above 7th limited in number (PHB p.32)."
    ] });
  }
  const asn = cls("assassin");
  if (asn) {
    const L = asn.level, langs = CF.assassinLanguages(L, s.abilities.int.value);
    boxes.push({ title: "Assassin Abilities", rows: [
      { label: "Assassination", value: `d% vs. victim level`, action: "assassinate", hint: "DMG p.75 Assassins' Table for Assassinations; target the victim first" },
      { label: "Disguise", value: "2-8% per day", action: "disguise", hint: "Roll whether an observer spots the disguise (sent to the GM)" },
      { label: "Thieving as thief", value: `level ${Math.max(0, L - 2)}` },
      { label: "Alignment languages", value: s.abilities.int.value < 15 ? "needs Int 15" : L < 9 ? "from 9th" : `${langs} of ${Math.min(4, s.abilities.int.value - 14)}` }
    ], notes: [
      "Assassination: only against a surprised victim; on failure weapon damage still applies (PHB p.29). Back stabbing is at the assassin's own level (PHB p.29).",
      "Poisoned weapons: each non-assassin within 10’ who sees the bared weapon has a 10% cumulative chance per round to notice; then 01-20 attack, 21-70 call the watch, 71-00 both (PHB p.29).",
      "Alignment tongues: from 9th level, one per level, at most one per point of intelligence over 14 (four at 18); druidic and thieves' cant may be chosen (PHB p.29).",
      "Hirelings: none before 4th level (then lower level assassins), thieves from 8th, any class from 12th; neutral or evil only (PHB p.30).",
      "Above 13th level the character must slay the Guildmaster (14th) or the Grandfather of Assassins (15th) (PHB p.30)."
    ] });
  }
  for (const key of ["magicuser", "illusionist"]) {
    const c = cls(key);
    if (!c) continue;
    const notes = CF.MU_NOTES[key].map(([lv, t]) => (c.level >= lv ? t : `${lv}th level: ${t}`));
    if (key === "illusionist") notes.push(CF.ILLUSIONIST_ITEMS);
    else notes.push("Spells must be studied from the spell books and spoken aloud; no armor (PHB p.25).");
    boxes.push({ title: key === "magicuser" ? "Magic-User Abilities" : "Illusionist Abilities", rows: [], notes });
  }
  if (s.acrobat) {
    const x = s.acrobat;
    const ft = v => `${Math.round(v * 100) / 100}'`;
    boxes.push({ title: "Thief-Acrobat Functions", sub: x.armorCat && x.armorCat !== "none" ? `in ${THIEF_ARMOR[x.armorCat]?.label ?? x.armorCat}` : "", rows: [
      pctRow("Tightrope walking", x.tightrope, "One check covers up to 60'. Moderate wind -10%, strong wind -20%; balance pole +10% in calm air."),
      { label: "Pole vaulting", value: ft(x.poleVault) },
      { label: "High jump", value: ft(x.highJump) },
      { label: "Standing broad jump", value: ft(x.standingBroad) },
      { label: "Running broad jump", value: ft(x.runningBroad) },
      { label: "Tumbling: attack", value: `+${x.attack}%` },
      pctRow("Tumbling: evasion", x.evasion),
      pctRow(`Falling ${ft(x.fallDist)}: no damage`, x.fallPct, `If damage is taken, it is ${100 - x.fallPct}% of normal, rounded down.`)
    ], notes: ["Thieving skills other than climb walls stay at 5th level (shown in the Thieving Skills box)."] });
  }
  if (actor.system.thiefArmorUnknown) {
    boxes.push({ title: "Armor and Thieving", rows: [], notes: ["The worn armor has no thieving category set (UA Thieves Table II). Set it on the armor's sheet; until then no armor adjustment is applied."] });
  }
  return boxes;
}

/* ------------------------------------------------------------------ */
/*  Psionics tab                                                        */
/* ------------------------------------------------------------------ */
function psionicContext(actor, items) {
  const s = actor.system, p = s.psionics, a = s.abilities;
  const eligible = a.int.value >= 16 || a.wis.value >= 16 || a.cha.value >= 16;
  const disciplines = items.filter(i => i.type === "psionic");
  const disc = i => {
    const cost = Psi.parseCost(i.system.cost);
    const mastery = Psi.masteryLevel(actor, i);
    return { id: i.id, name: i.name, system: i.system, mastery, duration: Psi.durationText(i.system.duration, mastery),
      active: i.system.active, payable: i.system.active && ["round", "turn"].includes(cost.per) };
  };
  return {
    eligible, has: p.has, p,
    ability: p.strength * 2, current: p.attack + p.defense,
    attackModes: Object.entries(PSI_ATTACK_MODES).map(([k, m]) => ({ key: k, ...m, rangeText: m.range.filter(Boolean).join("/"), known: p.modes[k] })),
    defenseModes: Object.entries(PSI_DEFENSE_MODES).map(([k, m]) => ({ key: k, ...m, known: p.defenses[k] })),
    minor: disciplines.filter(i => i.system.kind === "minor").map(disc),
    major: disciplines.filter(i => i.system.kind === "major").map(disc),
    bw: s.bodyWeaponry,
    bodyWeaponry: disciplines.some(i => /body weaponry/i.test(i.name)) ? BODY_WEAPONRY : null
  };
}

/* ================================================================== */
/*  Monster sheet                                                       */
/* ================================================================== */
/* ================================================================== */
/*  NPC sheet: the character rules on one compact page, plus service    */
/*  (role, liege, loyalty, wages) for henchmen and hirelings            */
/* ================================================================== */
export class NpcSheet extends CharacterSheet {
  static DEFAULT_OPTIONS = {
    classes: ["frpg1e", "sheet", "actor", "character", "npc"],
    position: { width: 820, height: 760 },
    actions: {
      loyalty: NpcSheet.onLoyalty,
      zeroHP: NpcSheet.onZeroHP,
      makeZero: NpcSheet.onMakeZero
    }
  };
  static PARTS = {
    sheet: { template: `systems/${SYSTEM_ID}/templates/actor/npc.hbs`, scrollable: [".tab-scroll"] }
  };
  async _prepareContext(options) {
    const ctx = await super._prepareContext(options);
    const s = this.actor.system, n = s.npc;
    const chars = (globalThis.game?.actors?.contents ?? []).filter(a => a.type === "character").sort((a, b) => a.name.localeCompare(b.name));
    ctx.npc = {
      n, L: s.loyalty, serving: NPC_SERVING.includes(n.role),
      roles: Object.entries(NPC_ROLES).map(([value, label]) => ({ value, label, selected: value === n.role })),
      lieges: [{ value: "", label: "(enter by hand)" }, ...chars.map(a => ({ value: a.id, label: a.name }))].map(o => ({ ...o, selected: o.value === n.liegeId })),
      byHand: !n.liegeId,
      groups: LOYALTY_GROUPS.map(([key, label, choices]) => ({ key, label,
        choices: choices.map(([value, l, v]) => ({ value, label: v ? `${l} (${v > 0 ? "+" : ""}${v}%)` : l, selected: value === n.loyalty[key] })) })),
      zero: !s.classInfo.length
    };
    return ctx;
  }
  static onLoyalty() { return Rolls.rollLoyalty(this.actor); }
  static async onZeroHP() {
    // DMG: "regular soldiers are 0 level men-at-arms with 4-7 hit points each"
    const r = await new Roll("1d4 + 3").evaluate();
    await this.actor.update({ "system.hp.value": r.total, "system.hp.max": r.total });
    return r.toMessage({ speaker: ChatMessage.getSpeaker({ actor: this.actor }), flavor: "Hit points, 0-level man-at-arms (4-7, DMG)" });
  }
  static onMakeZero() { return this.actor.update({ "system.classes": [] }); }
}

export class MonsterSheet extends ADnDActorSheet {
  static DEFAULT_OPTIONS = {
    classes: ["frpg1e", "sheet", "actor", "monster"],
    position: { width: 700, height: 740 },
    actions: { rollHP: MonsterSheet.#onRollHP, rollTreasure: MonsterSheet.#onRollTreasure,
      routineEdit: MonsterSheet.#onRoutineEdit, routineDelete: MonsterSheet.#onRoutineDelete,
      routineAdd: MonsterSheet.#onRoutineAdd, routineReset: MonsterSheet.#onRoutineReset }
  };

  /** The attack buttons as an editable list (the buttons derived from Damage/Attack become stored entries). */
  #routineList() {
    return this.actor.system.routine.map(r => ({ name: r.name || (r.weapon && !r.edited ? "Weapon" : ""), damage: r.damage ?? "", hit: r.hit ?? 0, dmg: r.dmg ?? 0 }));
  }
  async #saveRoutine(list) {
    await this.actor.update({ "system.attackList": list, "system.attackListEdited": true });
  }
  /** Dialog for one attack button. Returns {name, damage, hit, dmg} or null. */
  static async routineDialog(entry, title) {
    const esc = v => foundry.utils.escapeHTML ? foundry.utils.escapeHTML(String(v ?? "")) : String(v ?? "").replace(/"/g, "&quot;");
    const content = `<div class="frpg1e-form">
      <label class="fld"><span>Name (shown on the button; blank shows the damage)</span><input type="text" name="name" value="${esc(entry.name)}" placeholder="e.g. Bite"></label>
      <label class="fld"><span>Damage (e.g. 1-3, 2d4+1, 1-6 or by weapon type)</span><input type="text" name="damage" value="${esc(entry.damage)}"></label>
      <div class="row-2"><label class="fld"><span>Bonus to hit</span><input type="number" name="hit" value="${entry.hit ?? 0}"></label>
      <label class="fld"><span>Bonus to damage</span><input type="number" name="dmg" value="${entry.dmg ?? 0}"></label></div></div>`;
    return foundry.applications.api.DialogV2.wait({
      window: { title }, classes: ["frpg1e-dialog"], content, rejectClose: false,
      buttons: [{ action: "save", label: "Save", default: true, callback: (ev, button) => {
        const el = button.form.elements;
        return { name: el.name.value.trim(), damage: el.damage.value.trim(), hit: Number(el.hit.value) || 0, dmg: Number(el.dmg.value) || 0 };
      } }, { action: "cancel", label: "Cancel" }]
    }).then(r => (r && typeof r === "object" ? r : null));
  }
  static async #onRoutineEdit(event, target) {
    const i = Number(target.dataset.routine);
    const list = this.#routineList();
    if (!list[i]) return;
    const res = await MonsterSheet.routineDialog(list[i], `Edit attack: ${list[i].name || list[i].damage}`);
    if (!res) return;
    if (!res.damage) return ui.notifications.warn("An attack needs its damage.");
    list[i] = res;
    await this.#saveRoutine(list);
  }
  static async #onRoutineDelete(event, target) {
    const i = Number(target.dataset.routine);
    const list = this.#routineList();
    if (!list[i]) return;
    list.splice(i, 1);
    await this.#saveRoutine(list);
  }
  static async #onRoutineAdd() {
    const res = await MonsterSheet.routineDialog({ name: "", damage: "", hit: 0, dmg: 0 }, "Add attack");
    if (!res) return;
    if (!res.damage) return ui.notifications.warn("An attack needs its damage.");
    await this.#saveRoutine([...this.#routineList(), res]);
  }
  static async #onRoutineReset() {
    await this.actor.update({ "system.attackList": [], "system.attackListEdited": false });
  }
  static PARTS = {
    sheet: { template: `systems/${SYSTEM_ID}/templates/actor/monster.hbs`, scrollable: [".tab-scroll"] }
  };
  _tab = "stats";

  async _prepareContext(options) {
    const ctx = await super._prepareContext(options);
    const s = this.actor.system;
    ctx.sizes = [{ value: "S", label: "S" }, { value: "M", label: "M" }, { value: "L", label: "L" }];
    // MM entries given only in hit points (demon princes, golems, beholder...): the attack matrix column is not stated
    ctx.hdWarning = /hit points?|\bhp\b/i.test(s.hd) && !s.attackAs && !/^\d+$/.test(s.hd)
      ? "Hit dice are given as hit points, so the attack matrix column is not stated: set Attacks as HD." : "";
    ctx.humanMatrix = /^MM/.test(s.source) && ["Bandit (Brigand)", "Berserker", "Buccaneer (Pirate)", "Caveman (Tribesman)", "Dervish (Nomad)", "Merchant", "Pilgrim", "Dwarf", "Elf", "Gnome", "Halfling"].includes(this.actor.name)
      ? "MM p.5: humans and their kin (dwarves, elves, gnomes, half-elves, halflings) always use the matrix for humans." : "";
    ctx.saveGroups = [{ value: "fighter", label: "Fighter" }, { value: "cleric", label: "Cleric" }, { value: "magicuser", label: "Magic-User" }, { value: "thief", label: "Thief" }];
    ctx.routine = s.routine.map(r => ({ ...r, row: Rolls.weaponToHitRow(this.actor, null) }));
    ctx.toHitRow = Rolls.weaponToHitRow(this.actor, null);
    ctx.acHeader = Array.from({ length: 11 }, (_, i) => 10 - i);
    ctx.weapons = this.actor.items.filter(i => i.type === "weapon").map(i => ({ id: i.id, name: i.name, img: i.img, s: i.system, dmgText: `${i.system.damage.sm} / ${i.system.damage.l}` }));
    ctx.otherItems = this.actor.items.filter(i => i.type !== "weapon");
    ctx.psiAttack = Object.entries(PSI_ATTACK_MODES).map(([key, m]) => ({ key, ...m, known: s.psionics.modes[key] }));
    ctx.psiDefense = Object.entries(PSI_DEFENSE_MODES).map(([key, m]) => ({ key, ...m, known: s.psionics.defenses[key] }));
    ctx.description = await TextEditor.enrichHTML(s.description, { relativeTo: this.actor });
    return ctx;
  }

  static #onRollTreasure() {
    const s = this.actor.system;
    return Treasure.treasureDialog({ types: s.treasure, title: `Treasure: ${this.actor.name}` });
  }
  static async #onRollHP() {
    await Rolls.rollMonsterHP(this.actor);
  }
}

/* ================================================================== */
/*  Item sheet                                                          */
/* ================================================================== */
export class ADnDItemSheet extends HandlebarsApplicationMixin(ItemSheetV2) {
  static DEFAULT_OPTIONS = {
    classes: ["frpg1e", "sheet", "item"],
    form: { submitOnChange: true },
    position: { width: 560, height: 600 },
    window: { resizable: true },
    actions: { fillDamage: ADnDItemSheet.#onFillDamage, popOut: onPopOut, popIn: onPopIn }
  };

  _getHeaderControls() {
    return popOutControls(this, super._getHeaderControls());
  }
  static PARTS = {
    sheet: { template: `systems/${SYSTEM_ID}/templates/item/item.hbs`, scrollable: [".item-body"] }
  };

  async _prepareContext(options) {
    const ctx = await super._prepareContext(options);
    const item = this.item;
    ctx.item = item;
    ctx.system = item.system;
    ctx.type = item.type;
    ctx.isWeapon = item.type === "weapon";
    ctx.isArmor = item.type === "armor";
    ctx.isSpell = item.type === "spell";
    ctx.isGear = item.type === "gear";
    ctx.isPsionic = item.type === "psionic";
    ctx.isMagic = item.type === "magic";
    ctx.hasDice = item.type === "magic" || item.type === "spell";
    ctx.isTreasure = item.type === "treasure";
    ctx.isProficiency = item.type === "proficiency";
    ctx.profGroups = opt(PROF_GROUPS);
    ctx.abilityOptions = [{ value: "", label: "None (NA)" }, ...opt(ABILITY_LABELS)];
    ctx.magicCategories = opt(MAGIC_CATEGORIES);
    ctx.treasureKinds = opt(TREASURE_KINDS);
    ctx.protectionKinds = [{ value: "", label: "None" }, { value: "ring", label: "Ring of protection" }, { value: "cloak", label: "Cloak of protection" }, { value: "bracers", label: "Bracers of defense" }];
    ctx.gearAmmoKinds = [{ value: "", label: "Not ammunition" }, ...Object.entries(Rolls.AMMO_KINDS).map(([value, label]) => ({ value, label: `${label} (${value.startsWith("bolt") ? "crossbow" : value === "needle" ? "blowgun" : value === "arrow" ? "bows" : "sling"})` })),
      { value: "bolt", label: "Quarrels (any crossbow)" }];
    ctx.ammoKinds = [{ value: "", label: "—" }, { value: "arrow", label: "Arrows" }, { value: "bolt", label: "Bolts" }, { value: "bullet", label: "Sling bullets" }];
    ctx.hasValue = item.system.xp || item.system.gpValue;
    ctx.specOptions = [{ value: "", label: "None" }, { value: "single", label: "Specialized" }, { value: "double", label: "Double (melee)" }];
    ctx.choiceOptions = [{ value: "", label: "No" }, { value: "lance", label: "Lance (from 1st)" }, { value: "sword", label: "Sword (from 3rd)" }, { value: "horseman", label: "Horseman's weapon (from 5th)" }];
    ctx.thiefArmorOptions = [{ value: "", label: "(not set)" }, ...Object.entries(THIEF_ARMOR).filter(([k]) => k !== "none").map(([value, a]) => ({ value, label: a.label }))];
    ctx.acCols = Array.from({ length: 11 }, (_, i) => i);
    ctx.attackTypes = [{ value: "melee", label: "Melee" }, { value: "missile", label: "Missile" }, { value: "both", label: "Melee & thrown" }];
    ctx.lists = opt(LISTS);
    ctx.listLabel = LISTS[item.system.list] ?? "";
    ctx.ordLevel = ORD[item.system.level] ?? "";
    ctx.kinds = [{ value: "armor", label: "Body armor" }, { value: "shield", label: "Shield" }];
    ctx.descriptionHTML = await TextEditor.enrichHTML(item.system.description ?? "", { relativeTo: item });
    return ctx;
  }

  _onRender(context, options) {
    super._onRender(context, options);
    mountEditors(this.element, this.item, context);
    // Special magic bonuses vs. creature types
    this.element.querySelectorAll("[data-vs-index]").forEach(el => {
      el.addEventListener("change", ev => {
        ev.stopPropagation();
        const vs = foundry.utils.deepClone(this.item._source.system.magic?.vs ?? []);
        const i = Number(el.dataset.vsIndex);
        vs[i][el.dataset.vsField] = el.dataset.vsField === "bonus" ? (Number(el.value) || 0) : el.value;
        this.item.update({ "system.magic.vs": vs });
      });
    });
    this.element.querySelector("[data-vs-add]")?.addEventListener("click", ev => {
      ev.preventDefault();
      const vs = foundry.utils.deepClone(this.item._source.system.magic?.vs ?? []);
      vs.push({ bonus: 0, text: "" });
      this.item.update({ "system.magic.vs": vs });
    });
    this.element.querySelectorAll("[data-vs-remove]").forEach(el => el.addEventListener("click", ev => {
      ev.preventDefault();
      const vs = foundry.utils.deepClone(this.item._source.system.magic?.vs ?? []);
      vs.splice(Number(el.dataset.vsRemove), 1);
      this.item.update({ "system.magic.vs": vs });
    }));
    // Catalogued dice (system.rolls): edit label and formulas, add or remove rolls
    const rollsCopy = () => foundry.utils.deepClone(this.item._source.system.rolls ?? []);
    this.element.querySelectorAll("[data-roll-index]").forEach(el => {
      el.addEventListener("change", ev => {
        ev.stopPropagation();
        const rolls = rollsCopy();
        const r = rolls[Number(el.dataset.rollIndex)];
        if (!r) return;
        if (el.dataset.rollChoice !== undefined) r.choices[Number(el.dataset.rollChoice)].formula = el.value.trim();
        else foundry.utils.setProperty(r, el.dataset.rollField, el.dataset.rollField === "label" ? el.value : el.value.trim());
        this.item.update({ "system.rolls": rolls });
      });
    });
    this.element.querySelector("[data-roll-add]")?.addEventListener("click", ev => {
      ev.preventDefault();
      const rolls = rollsCopy();
      rolls.push({ label: "New roll", kind: "other", formula: "1d6", save: "", each: "", choices: [], table: { formula: "", rows: [] }, fn: "", charges: 0, note: "", mode: "", x: "" });
      this.item.update({ "system.rolls": rolls });
    });
    this.element.querySelectorAll("[data-roll-remove]").forEach(el => el.addEventListener("click", ev => {
      ev.preventDefault();
      const rolls = rollsCopy();
      rolls.splice(Number(el.dataset.rollRemove), 1);
      this.item.update({ "system.rolls": rolls });
    }));
    // AC adjustment arrays: rebuild the whole array on change
    this.element.querySelectorAll("[data-acadj]").forEach(el => {
      el.addEventListener("change", ev => {
        ev.stopPropagation();
        const path = el.dataset.acadj;
        const arr = [...(foundry.utils.getProperty(this.item._source, path) ?? Array(11).fill(0))];
        while (arr.length < 11) arr.push(0);
        arr[Number(el.dataset.index)] = Number(el.value) || 0;
        this.item.update({ [path]: arr });
      });
    });
  }

  /** Convert the printed ranges into dice formulas. */
  static #onFillDamage() {
    const d = this.item.system.damage;
    const sm = R.damageFormula(d.smRange), l = R.damageFormula(d.lRange);
    const update = {};
    if (sm) update["system.damage.sm"] = sm;
    if (l) update["system.damage.l"] = l;
    if (Object.keys(update).length) this.item.update(update);
  }
}
