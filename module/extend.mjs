/**
 * Extension point for setting modules (an optional campaign add-on that can be switched on or off).
 *
 * A module listens for the "frpg1e.init" hook, which the system calls during its own init with this API:
 *
 *   Hooks.once("frpg1e.init", api => {
 *     api.registerRace("kender", { label: "Kender", base: "halfling", classes: { fighter: 5, thief: "U" } });
 *     api.registerSpellProgression("myCaster", { 1: [1], 2: [2] });
 *     api.registerClass("myClass", { label: "My Class", hitDie: 8, firstDice: 1, maxHD: 9, afterHP: 2,
 *       matrix: "fighter", save: "fighter", nonProf: -2, xp: [0, 2001], profSlots: [4, 2, 1, 1, 3] });
 *   });
 *
 * Class definitions use the same fields as CLASSES in tables.mjs, plus:
 *   as: "cleric" | "druid" | "magicuser" ... a class built on that one (turns undead, rolls spell failure, ...)
 *   wisBonusSpells: true/false to force wisdom bonus spells on or off
 *   noTurning: true for a cleric-like class that does not turn undead (or a function of the actor); turnUndeadOffset: levels added
 *     when turning (or a function of the actor)
 *   profSlots: [initial weapon, initial nonweapon, weapon added, nonweapon added, every N levels, (nonweapon every N levels)]
 *   source: shown in the class list
 *   cavalier: true with cavalierRules: { mindResist, illusionSave, mountedLevel, goodAura, ridingSkills, choiceHit(choice, level, mounted),
 *     choiceAttacks(level), choiceLabel(choice, level), extraRows(level), notes(level) } changes the UA cavalier abilities (tables.mjs cavalierRules)
 *   spells: [{ list, progression, casterLevel: level -> n }] casterLevel sets the default caster level for that list
 *   levelHD: level -> { dice, die, fixed } the hit dice and fixed hit points gained at that level (an irregular table)
 *   spells[].wisdom: true/false wisdom bonus spells and spell failure for that list only
 *   thiefSkills: a number (levels added) or level -> thief level; thiefSkillKeys: the skills the class has; noThiefRace: no racial adjustments
 *   missileRules: { pointBlank(actor, item, level) -> label, dialog(actor, item, level) -> HTML (inputs named "x-<name>"),
 *     bonus({ actor, item, level, range, ammoItem, extra }) -> { mods: [{ label, hit, dmg }], notes }, rate(item, level) -> string }
 *     adds missile bonuses, a point blank range and dialog fields for that class (rolls.mjs)
 *   attackRules: { dialog(actor, item, level) -> HTML, bonus({ actor, item, level, missile, range, extra }) -> { mods, notes } }
 *     the same for every attack, melee or missile
 *   attacksPerRound: [[maxLevel, "1/1"], [maxLevel, "3/2"], [null, "2/1"]] melee attacks by level
 *   conHP(con): replaces the constitution hit point adjustment
 *   saveBonus(level): { ppd, pp, rsw, bw, sp } added to saving throws
 *   naturalAC(level, abilities): armor class without armor (no dexterity adjustment), like the monk
 *   acBonus(level): armor class improvement whatever is worn;  move(level): base movement
 *   backstab: true (thief multipliers) or a function (level) -> multiplier
 *   dieBonus: hit points added to every hit die rolled;  splitClass: true for a class taken beside another
 *     (its die gets no constitution bonus, the other class halves its die before constitution, no dividing)
 *
 * Each prepared character also calls Hooks "frpg1e.prepareCharacter" (system, items) after everything is
 * worked out, so a module can change saves, spell slots, or push lines into system.settingNotes.
 */
import { CLASSES, SPELL_PROGRESSION, PROFICIENCY_SLOTS, SPELL_LISTS, SPELL_LIST_KEYS, PROF_GROUPS, PROF_GROUP_KEYS } from "./tables.mjs";
import { registerRace, hideRaces, showRaces, RACE_DEFS } from "./races.mjs";


export function registerClass(key, def) {
  if (!key || !def?.label || !def?.hitDie || !Array.isArray(def.xp)) throw new Error("frpg1e | registerClass needs a key, label, hitDie and xp");
  if (CLASSES[key] && !CLASSES[key].setting) throw new Error(`frpg1e | registerClass: "${key}" is a core class`);
  CLASSES[key] = { firstDice: 1, maxHD: 9, afterHP: 0, matrix: "fighter", save: "fighter", fighterCon: false, nonProf: -2, ...def, setting: true };
  if (def.profSlots) PROFICIENCY_SLOTS[key] = def.profSlots;
  return CLASSES[key];
}

export function registerSpellProgression(key, table) {
  if (!key || !table) throw new Error("frpg1e | registerSpellProgression needs a key and a table");
  if (SPELL_PROGRESSION[key] && !SPELL_PROGRESSION[key].__setting) throw new Error(`frpg1e | "${key}" is a core spell progression`);
  Object.defineProperty(table, "__setting", { value: true, enumerable: false });
  SPELL_PROGRESSION[key] = table;
  return table;
}

/** A new spell list (call during "frpg1e.init", before any spell is created). */
export function registerSpellList(key, label) {
  if (!key || !label) throw new Error("frpg1e | registerSpellList needs a key and a label");
  SPELL_LISTS[key] = label;
  if (!SPELL_LIST_KEYS.includes(key)) SPELL_LIST_KEYS.push(key);
}

/** A new nonweapon proficiency group (e.g. "OA court"). */
export function registerProficiencyGroup(key, label) {
  if (!key || !label) throw new Error("frpg1e | registerProficiencyGroup needs a key and a label");
  PROF_GROUPS[key] = label;
  if (!PROF_GROUP_KEYS.includes(key)) PROF_GROUP_KEYS.push(key);
}

/** Classes taken out of the class list (actors that already use them keep them). */
export const HIDDEN_CLASSES = new Set();
export function hideClasses(keys) { for (const k of keys) if (k !== "custom") HIDDEN_CLASSES.add(k); }
export function showClasses(keys) { for (const k of keys) HIDDEN_CLASSES.delete(k); }

export const api = Object.freeze({
  version: 2,
  registerRace, hideRaces, showRaces, registerClass, registerSpellProgression, registerSpellList, registerProficiencyGroup, hideClasses, showClasses,
  CLASSES, SPELL_PROGRESSION, RACE_DEFS
});
