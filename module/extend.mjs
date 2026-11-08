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
 *   noTurning: true for a cleric-like class that does not turn undead
 *   profSlots: [initial weapon, initial nonweapon, weapon added, nonweapon added, every N levels]
 *   source: shown in the class list
 *
 * Each prepared character also calls Hooks "frpg1e.prepareCharacter" (system, items) after everything is
 * worked out, so a module can change saves, spell slots, or push lines into system.settingNotes.
 */
import { CLASSES, SPELL_PROGRESSION, PROFICIENCY_SLOTS } from "./tables.mjs";
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

export const api = Object.freeze({
  version: 1,
  registerRace, hideRaces, showRaces, registerClass, registerSpellProgression,
  CLASSES, SPELL_PROGRESSION, RACE_DEFS
});
