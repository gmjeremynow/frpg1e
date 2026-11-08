/**
 * Player character races: the PHB's seven racial stocks and the UA's sub-races (UA pp.7-11, 72).
 *
 * Keys kept from earlier versions: dwarf (hill), elf (high), gnome (surface), halfling (stout),
 * half-elf (high elf descent), half-orc, human. The PHB says its elves are high elves (p.16) and its
 * dwarves may be hill or "mountain" dwarves (p.15); the UA says PHB dwarves were hill or mountain,
 * elves high, gnomes surface (p.9).
 *
 * Level limits: UA Character Race Table II (pp.8-9). Ability scores: for fighters, rangers and
 * assassins strength; magic-users and illusionists intelligence; clerics and druids wisdom; thieves
 * dexterity. "If a character's ability score is lower than the first entry given ... the level limit
 * ... is the same as the lowest level shown". Single-classed characters may exceed a limit by 2 when
 * the class could be part of a multi-class combination for the race (UA p.8).
 */

/* ---------- races ---------- */
// base: the PHB stock used for saving throws, thief and acrobat adjustments and ability minimums/maximums.
// elfRow: UA Table III row; lvl: UA Table II sub-table and column variant.
export const RACE_DEFS = {
  human:            { label: "Human", base: "human", src: "PHB" },
  dwarf:            { label: "Dwarf, hill", base: "dwarf", sub: "hill", src: "PHB, UA" },
  "dwarf-mountain": { label: "Dwarf, mountain", base: "dwarf", sub: "mountain", src: "PHB, UA" },
  "dwarf-gray":     { label: "Dwarf, gray (duergar)", base: "dwarf", sub: "gray", src: "UA" },
  elf:              { label: "Elf, high", base: "elf", sub: "high", src: "PHB, UA" },
  "elf-dark":       { label: "Elf, dark (drow)", base: "elf", sub: "dark", src: "UA" },
  "elf-gray":       { label: "Elf, gray", base: "elf", sub: "gray", src: "UA" },
  "elf-valley":     { label: "Elf, valley", base: "elf", sub: "valley", src: "UA" },
  "elf-wild":       { label: "Elf, wild (grugach)", base: "elf", sub: "wild", src: "UA" },
  "elf-wood":       { label: "Elf, wood (sylvan)", base: "elf", sub: "wood", src: "UA" },
  gnome:            { label: "Gnome, surface", base: "gnome", sub: "surface", src: "PHB, UA" },
  "gnome-deep":     { label: "Gnome, deep (svirfneblin)", base: "gnome", sub: "deep", src: "UA" },
  "half-elf":       { label: "Half-elf (high elf descent)", base: "half-elf", sub: "high", src: "PHB, UA" },
  "half-elf-gray":  { label: "Half-elf (gray elf descent)", base: "half-elf", sub: "gray", src: "UA" },
  "half-elf-wood":  { label: "Half-elf (wood elf descent)", base: "half-elf", sub: "wood", src: "UA" },
  "half-elf-valley":{ label: "Half-elf (valley elf descent)", base: "half-elf", sub: "valley", src: "UA" },
  "half-elf-dark":  { label: "Half-elf (dark elf descent)", base: "half-elf", sub: "dark", src: "UA" },
  halfling:         { label: "Halfling, stout", base: "halfling", sub: "stout", src: "PHB, UA" },
  "halfling-hairfoot":   { label: "Halfling, hairfoot", base: "halfling", sub: "hairfoot", src: "PHB, UA" },
  "halfling-tallfellow": { label: "Halfling, tallfellow", base: "halfling", sub: "tallfellow", src: "PHB, UA" },
  "half-orc":       { label: "Half-orc", base: "half-orc", src: "PHB, UA" }
};
export const RACE_OPTIONS = Object.fromEntries(Object.entries(RACE_DEFS).map(([k, v]) => [k, v.label]));
/** "M", "male", "F", "Female" ... -> "m" / "f"; anything else -> "". */
export function sexKey(text) {
  const t = String(text ?? "").trim().toLowerCase();
  if (["m", "male", "man"].includes(t)) return "m";
  if (["f", "female", "woman"].includes(t)) return "f";
  return "";
}
export const baseRace = key => RACE_DEFS[key]?.base ?? key ?? "human";

/* ---------- races added by setting modules (game.frpg1e.api.registerRace) ---------- */
// def: { label, base, src, classes: { classKey: level | "U" | { limit, note } | (abilities, { sex, singleClass }) => ({ limit, note }) },
//        multiClass: [["fighter", "thief"], ...], abilityRange: { str: [min, max] | [[mMin, mMax], [fMin, fMax]], ... },
//        facts: [text], saveNote: text, comeliness: number }
const extOf = key => RACE_DEFS[key]?.ext ?? null;
const KEY_LABEL = { magicuser: "magic-user" };
export function registerRace(key, def) {
  if (!key || !def?.label) throw new Error("frpg1e | registerRace needs a key and a label");
  RACE_DEFS[key] = { label: def.label, base: def.base ?? "human", sub: def.sub, src: def.src ?? "", ext: { classes: {}, multiClass: [], facts: [], ...def } };
  RACE_OPTIONS[key] = def.label;
  if (def.saveNote) RACE_SAVE_NOTES[key] = def.saveNote;
  return RACE_DEFS[key];
}
/** Take races out of the race list (actors that already use them keep working). */
export function hideRaces(keys) { for (const k of keys) delete RACE_OPTIONS[k]; }
/** Put hidden races back in the list. */
export function showRaces(keys) { for (const k of keys) if (RACE_DEFS[k]) RACE_OPTIONS[k] = RACE_DEFS[k].label; }

/* ---------- UA Character Race Table I: class limitations ---------- */
// Column per race; true = allowed. Order: cavalier, paladin, cleric, druid, fighter, barbarian, ranger,
// magicuser, illusionist, thief, acrobat, assassin, monk, bard.
const T1_CLASSES = ["cavalier", "paladin", "cleric", "druid", "fighter", "barbarian", "ranger", "magicuser", "illusionist", "thief", "acrobat", "assassin", "monk", "bard"];
const t1 = s => Object.fromEntries(T1_CLASSES.map((c, i) => [c, s[i] === "y"]));
const T1 = {
  "dwarf-gray": t1("nnynynnnnyyynn"), "dwarf-hill": t1("nnynynnnnyyynn"), "dwarf-mountain": t1("nnynynnnnyyynn"),
  "elf-dark": t1("ynynynyynyyynn"), "elf-gray": t1("ynyyynyynyyynn"), "elf-high": t1("ynyyynyynyyynn"),
  "elf-valley": t1("nnyyynyynyyynn"), "elf-wild": t1("nnnyynnnnyyynn"), "elf-wood": t1("nnyyynyynyyynn"),
  "gnome-deep": t1("nnynynnnyyyynn"), "gnome-surface": t1("nnynynnnyyyynn"),
  "half-elf": t1("yyyyynyynyyyny"), halfling: t1("nnyyynnnnyynnn"), "half-orc": t1("nnynynnnnyyynn"),
  human: t1("yyyyyyyyyyyyyy")
};
function t1Key(raceKey) {
  const d = RACE_DEFS[raceKey] ?? RACE_DEFS.human;
  if (d.base === "dwarf" || d.base === "elf" || d.base === "gnome") return `${d.base}-${d.sub}`;
  return d.base;
}

/** Is the class open to the race? UA Table I, with its half-elf footnotes. */
export function classAllowed(raceKey, classKey) {
  const ext = extOf(raceKey);
  if (ext) return classKey in ext.classes ? true : (ext.knownClasses ?? T1_CLASSES).includes(classKey) ? false : null;
  const row = T1[t1Key(raceKey)];
  if (!row || !(classKey in row)) return null;            // custom class or unknown race: no ruling
  if (!row[classKey]) return false;
  const d = RACE_DEFS[raceKey];
  // 1: half-elf cavalier/paladin "If of dark, gray, or high elf descent"
  if (d?.base === "half-elf" && ["cavalier", "paladin"].includes(classKey)) return ["dark", "gray", "high"].includes(d.sub);
  return true;
}

/* ---------- UA Character Race Table III: multi-class options (UA p.72) ---------- */
const T3 = {
  "dwarf-gray": ["CF", "CT", "CA", "FT", "FA"], "dwarf-hill": ["CF", "FT"], "dwarf-mountain": ["CF", "FT"],
  "elf-dark": ["CF", "CR", "CM", "CT", "CA", "FM", "FT", "FA", "RM", "MT", "MA", "CFM", "CFT", "CMT", "FMT"],
  "elf-gray": ["CF", "CR", "CM", "CT", "CA", "DF", "DR", "DM", "DT", "FM", "FT", "FA", "RM", "MT", "MA", "CFM", "CFT", "CMT", "FMT"],
  "elf-wild": ["FT"],
  "gnome-deep": ["CF", "CI", "CT", "CA", "FI", "FT", "FA", "IT", "IA"], "gnome-surface": ["CF", "CI", "CT", "FI", "FT", "IT"],
  halfling: ["CF", "CT", "DF", "DT", "FT"], "half-orc": ["CF", "CT", "CA", "FT", "FA"]
};
T3["elf-high"] = T3["elf-gray"]; T3["elf-valley"] = T3["elf-gray"]; T3["elf-wood"] = T3["elf-gray"];  // "Gray/High", "Valley/Wood" rows are identical
const LETTER = { C: "cleric", D: "druid", F: "fighter", R: "ranger", M: "magicuser", I: "illusionist", T: "thief", A: "assassin" };
const LETTER_LABEL = { C: "cleric", D: "druid", F: "fighter", R: "ranger", M: "magic-user", I: "illusionist", T: "thief", A: "assassin" };
function t3Key(raceKey) {
  const d = RACE_DEFS[raceKey] ?? RACE_DEFS.human;
  if (d.base === "half-elf") return `elf-${d.sub}`;     // "A half-elf uses the entry for the strain of elf from which the character is descended."
  return t1Key(raceKey);
}
export function multiClassOptions(raceKey) {
  const ext = extOf(raceKey);
  if (ext) return ext.multiClass.map(a => a.map(k => KEY_LABEL[k] ?? k).join("/"));
  if (baseRace(raceKey) === "human") return [];
  return (T3[t3Key(raceKey)] ?? []).map(code => [...code].map(l => LETTER_LABEL[l]).join("/"));
}
function inMultiClass(raceKey, classKey) {
  const ext = extOf(raceKey);
  if (ext) return ext.multiClass.some(a => a.includes(classKey));
  return (T3[t3Key(raceKey)] ?? []).some(code => [...code].some(l => LETTER[l] === classKey));
}

/* ---------- UA Character Race Table II: level limits ---------- */
const S = s => (typeof s === "number" ? s : 18 + Number(s.split("/")[1] === "00" ? 100 : s.split("/")[1]) / 1000);  // "18/50" -> 18.05
const req = (fn, text) => ({ fn, text });
const ab = (a, k) => a[k]?.value ?? 0;
const R_DW1 = req(a => ab(a, "int") >= 18 && ab(a, "dex") >= 19, "intelligence 18 and dexterity 19");
const R_DW2 = req(a => ab(a, "int") >= 19 && ab(a, "dex") >= 19, "intelligence 19 and dexterity 19");
const R_GN1 = req(a => ab(a, "int") >= 18 && ab(a, "dex") >= 18, "intelligence 18 and dexterity 18");
const R_GN2 = req(a => ab(a, "int") >= 19 && ab(a, "dex") >= 19, "intelligence 19 and dexterity 19");
const R_CHA = n => req(a => ab(a, "cha") >= n, `charisma ${n}`);
const R_IW = (i, w, text) => req(a => ab(a, "int") >= i && ab(a, "wis") >= w, text ?? `intelligence ${i} and wisdom ${w}`);
const R_IWC = n => req(a => ab(a, "int") >= n && ab(a, "wis") >= n && ab(a, "con") >= n, `intelligence ${n}, wisdom ${n} and constitution ${n}`);
const R_ELF6 = req(a => ab(a, "int") >= 19 || ab(a, "wis") >= 19, "intelligence 19 or wisdom 19");
// rows: [score, level or "U", requirement?, ...upgrades]  upgrade: [test, level, text]
const col = rows => rows.map(([s, v, r, ...ups]) => ({ s: S(s), label: String(s), v, r, ups }));

const T2 = {
  dwarf: {
    cleric: col([[15, 8], [16, 9], [17, 10], [18, 11], [19, 13], [20, 16], [21, 16]]),
    "fighter:hill": col([[15, 6], [16, 6], [17, 7], [18, 8], ["18/99", 8], ["18/00", 9], [19, 10], [20, 12], [21, 15]]),
    "fighter:mountain": col([[15, 7], [16, 7], [17, 8], [18, 9], ["18/99", 9], ["18/00", 10], [19, 11], [20, 13], [21, 16]]),
    thief: col([[15, "U"]]),
    assassin: col([[15, 9], [16, 9], [17, 9], [18, 9], ["18/99", 11, R_DW1], ["18/00", 12, R_DW2], [19, 12, R_DW2], [20, 12, R_DW2], [21, 12, R_DW2]])
  },
  gnome: {
    cleric: col([[15, 7], [16, 8], [17, 9], [18, 10], [19, 12], [20, 14], [21, 14]]),
    fighter: col([[15, 5], [16, 5], [17, 5], [18, 5], ["18/50", 6], ["18/75", 7], ["18/99", 8], [19, 9], [20, 9], [21, 9]]),
    illusionist: col([[15, 6], [16, 6], [17, 6], [18, 7], [19, 8], [20, 10], [21, 13]]),
    thief: col([[15, "U"]]),
    assassin: col([[15, 8], [16, 8], [17, 8], [18, 8], ["18/50", 9, R_GN1], ["18/75", 10, R_GN2], ["18/99", 10, R_GN2], [19, 10, R_GN2], [20, 10, R_GN2], [21, 10, R_GN2]])
  },
  elf: {
    "cleric:dark-m": col([[12, 4], [13, 5], [14, 6], [15, 7], [16, 7], [17, 7], [18, 7], [19, 7], [20, 7], [21, 7]]),
    "cleric:dark-f": col([[12, "U"]]),
    cleric: col([[12, 7], [13, 7], [14, 7], [15, 7], [16, 8], [17, 9], [18, 10], [19, 11], [20, 12], [21, 12]]),
    "druid:wild": col([[12, 10], [13, 10], [14, 10], [15, 10], [16, 10], [17, 10], [18, 11, R_CHA(18)], [19, 12, R_CHA(18)], [20, 14, R_CHA(18)], [21, 17, R_CHA(19)]]),
    druid: col([[12, "U"]]),
    "fighter:dark-m": col([[12, 7], [13, 8], [14, 9], [15, 10], [16, 10], [17, 10], [18, 10], ["18/75", 10], ["18/90", 10], ["18/99", 10], ["18/00", 10], [19, 10], [20, 10]]),
    "fighter:dark-f": col([[12, 9], [13, 10], [14, 11], [15, 12], [16, 12], [17, 12], [18, 12], ["18/75", 12], ["18/90", 12], ["18/99", 12], ["18/00", 12], [19, 12], [20, 12]]),
    "fighter:gray": col([[12, 5], [13, 5], [14, 5], [15, 5], [16, 5], [17, 5], [18, 6], ["18/75", 7], ["18/90", 8], ["18/99", 9], ["18/00", 10], [19, 11], [20, 11]]),
    "fighter:valley": col([[12, 5], [13, 5], [14, 5], [15, 5], [16, 5], [17, 5], [18, 6], ["18/75", 6], ["18/90", 8], ["18/99", 9], ["18/00", 10], [19, 11], [20, 13]]),
    "fighter:wild": col([[12, 7], [13, 7], [14, 7], [15, 7], [16, 7], [17, 7], [18, 8], ["18/75", 8], ["18/90", 10], ["18/99", 11], ["18/00", 12], [19, 13], [20, 13]]),
    "fighter:wood": col([[12, 6], [13, 6], [14, 6], [15, 6], [16, 6], [17, 6], [18, 7], ["18/75", 8], ["18/90", 9], ["18/99", 10], ["18/00", 11], [19, 12], [20, 14]]),
    "magicuser:dark-m": col([[17, 12], [18, 12], [19, 13], [20, 15], [21, 18], [22, 18]]),
    "magicuser:dark-f": col([[17, 5], [18, 5], [19, 7], [20, 9], [21, 11], [22, 11]]),
    "magicuser:gray": col([[17, 11], [18, 11], [19, 12], [20, 13], [21, 15], [22, 18]]),
    "magicuser:high": col([[17, 10], [18, 10], [19, 11], [20, 12], [21, 14], [22, 17]]),
    "magicuser:valley": col([[17, 11], [18, 11], [19, 12], [20, 13], [21, 15], [22, 15]]),
    "magicuser:wood": col([[17, 9], [18, 9], [19, 10], [20, 11], [21, 13], [22, 13]]),
    thief: col([[17, "U"]]),
    assassin: col([[18, 10], ["18/01", 10], ["18/51", 10], ["18/76", 10], ["18/99", 11, R_IW(18, 19)], ["18/00", 12, R_ELF6], [19, 12, R_ELF6], [20, 12, R_ELF6]]),
    ranger: col([[18, 6], ["18/01", 7, R_IW(15, 15), [a => ab(a, "int") > 15 && ab(a, "wis") > 15, 8, "intelligence and wisdom above 15"]],
      ["18/51", 9, R_IW(16, 16)], ["18/76", 10, R_IW(17, 17)], ["18/99", 10, R_IW(17, 17)], ["18/00", 10, R_IW(17, 17)],
      [19, 12, R_IW(18, 18)], [20, 14, R_IW(18, 18)]])
  },
  "half-elf": {
    cleric: col([[15, 5], [16, 6], [17, 7], [18, 8], [19, 10], [20, 12]]),
    druid: col([[15, "U"]]),
    fighter: col([[15, 6], [16, 6], [17, 7], [18, 7], ["18/90", 8], ["18/99", 9], ["18/00", 10], [19, 11], [20, 13]]),
    ranger: col([[15, 6], [16, 6], [17, 7], [18, 8], ["18/90", 9, R_IWC(18)], ["18/99", 10, R_IWC(18)],
      ["18/00", 11, R_IWC(18), [a => ab(a, "wis") > 19 && ab(a, "con") > 19, 14, "wisdom and constitution above 19"], [a => ab(a, "wis") > 18 && ab(a, "con") > 18, 12, "wisdom and constitution above 18"]],
      [19, 15, R_IWC(19)], [20, 15, R_IWC(19)]]),
    magicuser: col([[15, 7], [16, 7], [17, 7], [18, 8], [19, 8], [20, 8]]),
    thief: col([[15, "U"]]),
    assassin: col([[15, 11], [16, 11], [17, 11], [18, 11], ["18/90", 11], ["18/99", 11], ["18/00", 11], [19, 11], [20, 11]])
  },
  halfling: {
    cleric: col([[15, 4], [16, 4], [17, 5], [18, 6], [19, 8], [20, 10]]),
    druid: col([[15, 6, R_CHA(15)], [16, 7, R_CHA(15), [a => ab(a, "cha") >= 16, 8, "charisma 16 or more"]],
      [17, 9, R_CHA(16), [a => ab(a, "cha") >= 17, 10, "charisma 17 or more"]], [18, 11, R_CHA(17), [a => ab(a, "cha") >= 18, 12, "charisma 18 or more"]],
      [19, 13, R_CHA(19)], [20, 13, R_CHA(19)]]),
    "fighter:hairfoot": col([[15, 4], [16, 4], [17, 5], [18, 5], ["18/50", 6], ["18/90", 7], [19, 8], [20, 8]]),
    "fighter:stout": col([[15, 5], [16, 5], [17, 6], [18, 6], ["18/50", 7], ["18/90", 8], [19, 9], [20, 9]]),
    "fighter:tallfellow": col([[15, 6], [16, 6], [17, 7], [18, 7], ["18/50", 8], ["18/90", 9], [19, 10], [20, 10]]),
    thief: col([[15, "U"]])
  },
  "half-orc": {
    cleric: col([[14, 4], [15, 5], [16, 6], [17, 7], [18, 7], [19, 7], [20, 7], [21, 7]]),
    fighter: col([[14, 10], [15, 10], [16, 10], [17, 10], [18, 10], ["18/99", 10], ["18/00", 11], [19, 12], [20, 14], [21, 17]]),
    thief: col([[14, 8], [15, 9], [16, 10], [17, 11], [18, 11], [19, 11], [20, 11], [21, 11]]),
    assassin: col([[14, "U"]])
  }
};
// Classes UA says are unlimited without a table entry (p.8): cavalier for elves and half-elves, bard for half-elves.
const UNLIMITED = { elf: ["cavalier"], "half-elf": ["cavalier", "bard"] };
const GOVERNING = { fighter: "str", ranger: "str", assassin: "str", magicuser: "int", illusionist: "int", cleric: "wis", druid: "wis", thief: "dex" };

function columnFor(raceKey, classKey, sex) {
  const d = RACE_DEFS[raceKey];
  const t = T2[d.base];
  if (!t) return null;
  const drow = d.sub === "dark" ? (sex === "f" ? "dark-f" : sex === "m" ? "dark-m" : null) : null;
  const tries = [];
  if (d.base === "elf") {
    if (d.sub === "dark") tries.push(`${classKey}:${drow ?? "dark-m"}`);
    if (classKey === "fighter" && ["gray", "high"].includes(d.sub)) tries.push("fighter:gray");
    if (classKey === "druid" && d.sub === "wild") tries.push("druid:wild");
    tries.push(`${classKey}:${d.sub}`);
  } else if (d.base === "dwarf") tries.push(`${classKey}:${d.sub === "hill" ? "hill" : "mountain"}`);   // "Mtn/Gray"
  else if (d.base === "halfling") tries.push(`${classKey}:${d.sub}`);
  tries.push(classKey);
  for (const k of tries) if (t[k]) return t[k];
  return null;
}

/** Ability score used for the row: strength with exceptional percent as 18.xx. */
function scoreFor(abilities, key) {
  if (key === "str" && abilities.str?.value === 18 && abilities.str?.pct > 0) return 18 + abilities.str.pct / 1000;
  return abilities[key]?.value ?? 0;
}

/**
 * Maximum level for a race/class: { limit: number|"U"|null, allowed, note, unknown }
 * sex: "m", "f" or "" (only the drow columns differ by sex).
 * A row is used when the score reaches it (UA labels its elf ranger rows 18/01, 18/51, 18/76 this way).
 */
export function levelLimit(raceKey, classKey, abilities, { sex = "", singleClass = false } = {}) {
  const d = RACE_DEFS[raceKey];
  if (d?.ext) return extLevelLimit(raceKey, classKey, abilities, { sex, singleClass });
  if (!d || d.base === "human") return { limit: "U", allowed: true, note: "" };
  const allowed = classAllowed(raceKey, classKey);
  if (allowed === null) return { limit: null, allowed: null, unknown: true, note: "no UA ruling for this class" };
  if (!allowed) return { limit: null, allowed: false, note: "not open to this race (UA Character Race Table I)" };
  if (UNLIMITED[d.base]?.includes(classKey)) return { limit: "U", allowed: true, note: "unlimited (UA p.8)" };
  const rows = columnFor(raceKey, classKey, sex);
  if (!rows) return { limit: null, allowed: true, unknown: true, note: "Unknown: UA Character Race Table II gives no limit for this class" };
  const notes = [];
  if (d.base === "elf" && d.sub === "dark" && !["m", "f"].includes(sex) && T2.elf[`${classKey}:dark-f`]) notes.push("drow limits differ by sex; male column used until Sex is M or F");
  const score = scoreFor(abilities, GOVERNING[classKey]);
  let i = rows.length - 1;
  while (i > 0 && rows[i].s > score) i--;
  // a row whose extra requirement (footnote) is not met falls back to the row above it
  while (i > 0 && rows[i].r && !rows[i].r.fn(abilities)) { notes.push(`${rows[i].v} needs ${rows[i].r.text}`); i--; }
  const row = rows[i];
  if (row.r && !row.r.fn(abilities)) return { limit: null, allowed: true, unknown: true, note: `Unknown: the table's lowest entry needs ${row.r.text}` };
  let limit = row.v;
  for (const [test, lv, text] of row.ups) if (test(abilities) && lv > limit) { limit = lv; notes.push(`${text}: ${lv}`); }
  if (limit !== "U" && singleClass && inMultiClass(raceKey, classKey)) { limit += 2; notes.push("+2 single-classed (UA p.8)"); }
  return { limit, allowed: true, note: notes.join("; ") };
}

function extLevelLimit(raceKey, classKey, abilities, ctx) {
  const ext = extOf(raceKey);
  const allowed = classAllowed(raceKey, classKey);
  if (allowed === null) return { limit: null, allowed: null, unknown: true, note: "no ruling for this class" };
  if (!allowed) return { limit: null, allowed: false, note: `not open to this race${ext.src ? ` (${ext.src})` : ""}` };
  let v = ext.classes[classKey];
  if (typeof v === "function") v = v(abilities, ctx);
  const r = (v && typeof v === "object") ? { limit: v.limit ?? null, note: v.note ?? "" } : { limit: v ?? null, note: "" };
  if (r.limit === null || r.limit === undefined) return { limit: null, allowed: true, unknown: true, note: r.note || "Unknown: no limit given" };
  return { limit: r.limit, allowed: true, note: r.note };
}

/* ---------- other racial facts ---------- */
// PHB Character Race Table III (p.15): [min, max] for male / female, by base race; humans use 3-18 (exceptional strength aside).
export const ABILITY_RANGE = {
  dwarf: { str: [[8, 18], [8, 17]], int: [[3, 18], [3, 18]], wis: [[3, 18], [3, 18]], dex: [[3, 17], [3, 17]], con: [[12, 19], [12, 19]], cha: [[3, 16], [3, 16]] },
  elf: { str: [[3, 18], [3, 16]], int: [[8, 18], [8, 18]], wis: [[3, 18], [3, 18]], dex: [[7, 19], [7, 19]], con: [[6, 18], [6, 18]], cha: [[8, 18], [8, 18]] },
  gnome: { str: [[6, 18], [6, 15]], int: [[7, 18], [7, 18]], wis: [[3, 18], [3, 18]], dex: [[3, 18], [3, 18]], con: [[8, 18], [8, 18]], cha: [[3, 18], [3, 18]] },
  "half-elf": { str: [[3, 18], [3, 17]], int: [[4, 18], [4, 18]], wis: [[3, 18], [3, 18]], dex: [[6, 18], [6, 18]], con: [[6, 18], [6, 18]], cha: [[3, 18], [3, 18]] },
  halfling: { str: [[6, 17], [6, 14]], int: [[6, 18], [6, 18]], wis: [[3, 17], [3, 17]], dex: [[8, 18], [8, 18]], con: [[10, 19], [10, 19]], cha: [[3, 18], [3, 18]] },
  "half-orc": { str: [[6, 18], [6, 18]], int: [[3, 17], [3, 17]], wis: [[3, 14], [3, 14]], dex: [[3, 17], [3, 17]], con: [[13, 19], [13, 19]], cha: [[3, 12], [3, 12]] }
};

// Comeliness adjustment toward other races (UA p.6)
export const COMELINESS_ADJ = {
  "half-orc": -3, dwarf: -1, gnome: -1, halfling: 0, human: 0, "elf-wild": 0, "elf-valley": 0, "half-elf": 1, "elf-wood": 1, "elf-gray": 2, "elf-high": 2
};
export function comelinessAdj(raceKey, sex) {
  const d = RACE_DEFS[raceKey] ?? RACE_DEFS.human;
  if (d.ext) return d.ext.comeliness ?? null;
  if (d.base === "elf" && d.sub === "dark") return sex === "f" ? 1 : sex === "m" ? -1 : null;
  if (d.base === "elf") return COMELINESS_ADJ[`elf-${d.sub}`];
  return COMELINESS_ADJ[d.base];
}

// Short facts for the sheet; each with its source. Full text is in the Races compendium.
export const RACE_FACTS = {
  human: ["No class or level limits (PHB p.17-18)."],
  dwarf: ["Infravision 60’ (PHB p.15).", "Ability adjustments: constitution +1, charisma −1 (PHB p.14).",
    "Saves vs. rods, staves, wands, spells and poison: +1 per 3½ constitution (PHB p.15).", "+1 to hit half-orcs, goblins, hobgoblins, orcs; ogres, trolls, ogre magi, giants and titans −4 to hit them (PHB p.16).",
    "Mining detection: grade 75%, new construction 75%, sliding walls 66⅔%, stonework traps 50%, depth 50% (PHB p.16)."],
  "dwarf-mountain": ["As hill dwarves; higher fighter level limits (UA Table II)."],
  "dwarf-gray": ["Infravision 12″ (UA p.10).", "Saves vs. rods, staves, wands and spells: +1 per 3½ constitution; the same bonus vs. natural poison (UA p.10).",
    "Unaffected by illusion spells; immune to paralysis and to non-natural (magical or alchemical) poisons (UA p.10).",
    "Dwarven detection of grade, slope, new construction, sliding walls, traps and depth (UA p.10).",
    "Ogres, trolls, ogre magi, giants and titans −4 to hit them; no bonus to hit half-orcs, goblins, hobgoblins or orcs (UA p.10).",
    "Surprise others 3 in 6 (alone or with duergar); surprised only 1 in 10 (UA p.10).",
    "In daylight or continual light: no surprise bonus, dexterity −2, −2 to hit, opponents +2 on saves vs. their attacks; in darkness attacking lit targets −1 / +1; torches, lanterns, light and faerie fire do not count (UA p.10).",
    "Twice the usual chance of psionic ability (UA p.10)."],
  elf: ["Infravision 60’ (PHB p.16).", "Ability adjustments: dexterity +1, constitution −1 (PHB p.14).", "90% resistance to sleep and charm (PHB p.16).",
    "+1 to hit with bows (not crossbows) and short or long swords (PHB p.16).", "Secret doors: 1 in 6 passing within 10’; searching 2 in 6 (secret), 3 in 6 (concealed) (PHB p.16).",
    "Surprise 4 in 6 when alone and not in metal armor (2 in 6 if a door must be opened) (PHB p.16)."],
  "elf-gray": ["As high elves; +1 to the intelligence roll, maximum 19 for a beginning character (UA p.10)."],
  "elf-wood": ["As high elves in abilities; +1 to the strength roll (maximum 18), −1 to intelligence (UA p.10).", "Languages: elvish, common, treant, woodland mammals (UA p.10)."],
  "elf-wild": ["Elven abilities; +2 to the strength roll (maximum 18) (UA p.10).", "Deal with woodland creatures as if under animal friendship; set pits, snares and traps 90% (UA p.10).",
    "Classes: druid, fighter, thief (assassin, acrobat); multi-class fighter/thief only (UA p.10)."],
  "elf-valley": ["As gray elves, plus the gnomish language (UA p.10)."],
  "elf-dark": ["Infravision 12″; movement 12″ male, 15″ female (UA p.11).", "Ability adjustments: as elves (PHB p.14), unless the DM uses the FF method (UA p.11).",
    "No player-character magic resistance; the customary elven resistance to sleep and charm; +2 on all saves vs. magical effects (UA p.10).",
    "No elven sword and bow bonus; two weapons without penalty if each is one-handed, no shield (a spiked buckler may be one weapon) (UA p.10).",
    "Secret doors and silent movement as elves; dwarven detection of new construction, stonework traps, sliding walls, depth; surprised only 1 in 8 (UA p.11).",
    "Once a day: dancing lights, faerie fire, darkness 5′ radius; from 4th level detect magic, know alignment, levitate; females from 4th also clairvoyance, detect lie, suggestion, dispel magic (UA p.11).",
    "Light affects them as it does gray dwarves (UA p.11)."],
  gnome: ["Infravision 60’ (PHB p.16).", "Saves vs. rods, staves, wands and spells: +1 per 3½ constitution (PHB p.16).",
    "+1 to hit kobolds and goblins; gnolls, bugbears, ogres, trolls, ogre magi, giants, titans −4 to hit them (PHB p.17).",
    "Detection: grade 80%, unsafe walls 70%, depth 60%, direction 50% (PHB p.16)."],
  "gnome-deep": ["Infravision 12″, ultravision 3″; in bright light vision 3″ and −1 to hit (UA p.11).", "No player-character magic resistance; +2 on saves vs. poison, +3 on all other saves; immune to illusions and phantasms (UA p.11).",
    "Gnomish detection of slopes, unsafe walls, depth and direction; camouflage against natural rock 60% (UA p.11).",
    "Surprised only 1 in 12; surprise others 9 in 10 (alone or with deep gnomes, no bulky armor) (UA p.11).",
    "+1 to hit and damage vs. drow and kuo-toa; giants, bugbears, ogre magi, ogres, trolls and titans −4 to hit them, as surface gnomes (UA p.11).",
    "Once a day: blindness, blur, change self; radiates non-detection on self (UA p.11).",
    "Non-illusionists from 6th level: summon an earth elemental once a day (d20: 1 24 HD; 2-6 16 HD; 7-10 12 HD; 11-15 8 HD; 16-18 xorn; 19-20 fails) (UA p.11).",
    "Player character deep gnomes must be male; no psionics (UA p.11)."],
  "half-elf": ["Infravision 60’ (PHB p.17).", "30% resistance to sleep and charm (PHB p.17).", "Secret doors as elves (PHB p.17)."],
  "half-elf-dark": ["Drow descent: the drow disadvantages in light, none of their advantages (UA p.11)."],
  halfling: ["Ability adjustments: strength −1, dexterity +1 (PHB p.14).", "Saves vs. rods, staves, wands, spells and poison: +1 per 3½ constitution (PHB p.17).",
    "Infravision: stout 60’, mixed blood 30’ (PHB p.17).", "Surprise 4 in 6 when alone and not in metal armor (PHB p.17).", "Those of mixed blood count as stouts (UA p.11)."],
  "half-orc": ["Infravision 60’ (PHB p.17).", "Ability adjustments: strength +1, constitution +1, charisma −2 (PHB p.14)."]
};
// Sub-races whose UA entry replaces the PHB facts instead of adding to them.
const OWN_FACTS = new Set(["dwarf-gray", "elf-dark", "gnome-deep"]);
export function raceFacts(raceKey) {
  const d = RACE_DEFS[raceKey] ?? RACE_DEFS.human;
  if (d.ext) return [...d.ext.facts];
  if (OWN_FACTS.has(raceKey)) return RACE_FACTS[raceKey];
  const own = RACE_FACTS[raceKey] && raceKey !== d.base ? RACE_FACTS[raceKey] : [];
  return [...(RACE_FACTS[d.base] ?? []), ...own];
}

/** Saving throws the race changes in a way the sheet does not apply automatically. */
export const RACE_SAVE_NOTES = {
  "gnome-deep": "UA p.11: +2 on saves vs. poison and +3 on all other saves. Not applied automatically: the UA does not say whether these replace or add to the gnome constitution bonus (Unknown). Enter them in the save adj. boxes as your DM rules.",
  "elf-dark": "UA p.10: +2 on all saving throws vs. magical effects. Not applied automatically, since which save categories count as magical effects is the DM\u2019s call; enter it in the adj. boxes."
};

/** Classes open to the race (UA Character Race Table I), as class keys. */
export function classesOpen(raceKey) {
  const ext = extOf(raceKey);
  if (ext) return Object.keys(ext.classes);
  return T1_CLASSES.filter(c => classAllowed(raceKey, c));
}

/** Is this multi-class combination on UA Character Race Table III? null for humans (who dual-class instead). */
export function multiClassAllowed(raceKey, classKeys) {
  const ext = extOf(raceKey);
  if (ext) { const w = [...classKeys].sort().join("/"); return ext.multiClass.some(a => [...a].sort().join("/") === w); }
  if (baseRace(raceKey) === "human") return null;
  const want = [...classKeys].sort().join("/");
  return (T3[t3Key(raceKey)] ?? []).some(code => [...code].map(l => LETTER[l]).sort().join("/") === want);
}

// UA sub-race changes to the PHB maximums: gray elves (and valley elves, who have all gray elf abilities) intelligence 19 (UA p.10).
const RANGE_OVERRIDE = { "elf-gray": { int: [[8, 19], [8, 19]] }, "elf-valley": { int: [[8, 19], [8, 19]] } };
const AB_LABEL = { str: "strength", int: "intelligence", wis: "wisdom", dex: "dexterity", con: "constitution", cha: "charisma" };

/**
 * PHB Character Race Table III minimums and maximums (after racial adjustments). Where the male and
 * female figures differ and sex is not set, only the larger maximum is checked.
 */
export function abilityWarnings(raceKey, abilities, sex = "") {
  const base = baseRace(raceKey);
  const ext = extOf(raceKey);
  const table = ext ? extRange(ext.abilityRange) : ABILITY_RANGE[base];
  if (!table) return [];
  const out = [];
  for (const k of Object.keys(AB_LABEL)) {
    if (!table[k]) continue;
    const [m, f] = RANGE_OVERRIDE[raceKey]?.[k] ?? table[k];
    const v = abilities[k]?.value ?? 0;
    const min = sex === "f" ? f[0] : sex === "m" ? m[0] : Math.min(m[0], f[0]);
    const max = sex === "f" ? f[1] : sex === "m" ? m[1] : Math.max(m[1], f[1]);
    if (v < min) out.push(`${AB_LABEL[k]} ${v} is below the minimum of ${min}`);
    if (v > max) out.push(`${AB_LABEL[k]} ${v} is above the maximum of ${max}`);
  }
  return out;
}

/** A registered race's ranges as [[male], [female]] pairs; null when it gives none. */
function extRange(range) {
  if (!range) return null;
  return Object.fromEntries(Object.entries(range).map(([k, v]) => [k, Array.isArray(v[0]) ? v : [v, v]]));
}
