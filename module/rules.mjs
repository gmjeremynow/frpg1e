/**
 * Rules engine: pure functions over the tables. No Foundry globals, so the
 * whole file can be unit tested in Node.
 */
import { BODY_WEAPONRY,
  ATTACK_MATRICES, MONSTER_MATRIX, scoreFromBase, SAVING_THROWS, SAVE_KEYS, CLASSES,
  strengthTable, intelligenceTable, wisdomTable, dexterityTable, dexterityThiefAdj, constitutionTable,
  charismaTable, THIEF_TABLE, THIEF_SKILL_KEYS, THIEF_RACE_ADJ, spellSlotsFor, MONK_TABLE,
  racialConSaveBonus, RACIAL_SAVE_RACES, rangeToFormula, THIEF_ARMOR, classIs
} from "./tables.mjs";

/* ------------------------------------------------------------------ */
/*  Attack matrices                                                     */
/* ------------------------------------------------------------------ */

/** Matrix column base for a character class group and level. */
export function matrixBase(matrixKey, level) {
  const m = ATTACK_MATRICES[matrixKey] ?? ATTACK_MATRICES.fighter;
  let lvl = Math.max(0, Math.floor(level));
  if (matrixKey !== "fighter" && lvl < 1) lvl = 1;   // only fighters/humans/halflings have a 0-level column
  const b = m.brackets.find(r => lvl >= r.min && lvl <= r.max) ?? m.brackets[0];
  return b.base;
}

/** d20 score needed for a character to hit an armor class. */
export function characterToHit(matrixKey, level, ac, { fighterPerLevel = false, perLevelBonus = 0 } = {}) {
  let score = scoreFromBase(matrixBase(matrixKey, level), ac);
  // DMG p.74 optional rule: +1 "to hit" at the second level of each pair (2, 4, 6, ...).
  if (fighterPerLevel && perLevelBonus) score -= perLevelBonus;
  return score;
}

/**
 * Parse a monster hit dice string: "3", "1+1", "1-1", "8+8", "1/2", "½", "2-4 hp".
 * Returns {dice, plus, minus, fraction}.
 */
export function parseHitDice(hd) {
  const s = String(hd ?? "").trim().replace("½", "1/2").replace("¼", "1/4");
  if (/^\d+\s*\/\s*\d+/.test(s)) {
    const [a, b] = s.split("/").map(n => parseInt(n));
    return { dice: a / b, plus: 0, minus: 0, fraction: true };
  }
  const m = s.match(/^(\d+)\s*(?:([+-])\s*(\d+))?/);
  if (!m) return { dice: 1, plus: 0, minus: 0, fraction: false };
  const dice = parseInt(m[1]);
  const mod = m[3] ? parseInt(m[3]) : 0;
  return { dice, plus: m[2] === "+" ? mod : 0, minus: m[2] === "-" ? mod : 0, fraction: false };
}

/**
 * Hit dice to use for saves and morale. Where the book gives a monster only in hit points
 * ("22 hit points", "1-4 hit points"), the hit dice it attacks as (attackAs) stand in, so a
 * 90 hit point prince does not count as a 90-dice monster.
 */
export function hdForRules(hd, attackAs) {
  // anything other than a single plain "N", "N+M" or "N-M" (hit points, ranges, "6, 9, or 12", "8+4 (10+5)")
  return attackAs && !/^\s*\d+\s*(?:[+-]\s*\d+)?\s*$/.test(String(hd ?? "")) ? attackAs : hd;
}

/** A range of hit dice ("6-8", "12 to 36") as [low, high], or null ("1-1" is one die minus one). */
export function hdRange(hd) {
  const m = String(hd ?? "").trim().match(/^(\d+)\s*(?:-|to)\s*(\d+)(?:\s*\([^)]*\))?$/);
  return m && +m[2] > +m[1] ? [+m[1], +m[2]] : null;
}

/** Monster attack matrix column (DMG II). "Any plus above +3 equals another hit die." */
export function monsterColumn(hd) {
  const { dice, plus, minus, fraction } = parseHitDice(hd);
  if (fraction || dice < 1) return MONSTER_MATRIX[0];
  if (dice === 1 && minus > 1) return MONSTER_MATRIX[0];
  if (dice === 1 && minus === 1) return MONSTER_MATRIX[1];
  if (dice === 1 && plus === 0) return MONSTER_MATRIX[2];
  if (dice === 1 && plus >= 1 && plus <= 3) return MONSTER_MATRIX[3];
  let eff = dice + (plus > 3 ? 1 : 0);
  if (eff === 1) return MONSTER_MATRIX[2];
  return MONSTER_MATRIX.find(c => c.min !== undefined && eff >= c.min && eff <= c.max) ?? MONSTER_MATRIX[MONSTER_MATRIX.length - 1];
}

export function monsterToHit(hd, ac) {
  return scoreFromBase(monsterColumn(hd).base, ac);
}

/**
 * Monster saving throw level (DMG p.79 II.B): hit dice = level, and each
 * increment of four hit points beyond the dice adds one level
 * (1+1..1+4 = 2, 1+5..1+8 = 3). Less than one full die saves at level 0.
 */
export function monsterSaveLevel(hd) {
  const { dice, plus, fraction } = parseHitDice(hd);
  if (fraction || dice < 1) return 0;
  return dice + Math.ceil(plus / 4);
}

/* ------------------------------------------------------------------ */
/*  Saving throws                                                       */
/* ------------------------------------------------------------------ */
export function saveRow(group, level) {
  const t = SAVING_THROWS[group] ?? SAVING_THROWS.fighter;
  let lvl = Math.max(0, Math.floor(level));
  if (group !== "fighter" && lvl < 1) lvl = 1;
  const row = t.find(r => lvl >= r.min && lvl <= r.max) ?? t[0];
  return Object.fromEntries(SAVE_KEYS.map((k, i) => [k, row.v[i]]));
}

/** Best (lowest) save in each category across several {group, level} entries. */
export function bestSaves(entries) {
  if (!entries.length) entries = [{ group: "fighter", level: 0 }];
  const out = {};
  for (const k of SAVE_KEYS) {
    out[k] = { value: Infinity, from: null };
    for (const e of entries) {
      const v = saveRow(e.group, e.level)[k];
      if (v < out[k].value) out[k] = { value: v, from: e.group };
    }
  }
  return out;
}

/* ------------------------------------------------------------------ */
/*  Abilities                                                           */
/* ------------------------------------------------------------------ */
export function abilityDetails(ab, { fighterCon = false, exceptionalStr = false } = {}) {
  const pct = exceptionalStr && ab.str.value === 18 ? (ab.str.pct || 0) : 0;
  const str = strengthTable(ab.str.value, pct);
  const int = intelligenceTable(ab.int.value);
  const wis = wisdomTable(ab.wis.value);
  const dex = dexterityTable(ab.dex.value);
  const con = constitutionTable(ab.con.value);
  const cha = charismaTable(ab.cha.value);
  con.hpAdj = fighterCon ? con.hpFighter : con.hp;
  return { str, int, wis, dex, con, cha, strPct: pct };
}

/* ------------------------------------------------------------------ */
/*  Armor class                                                         */
/* ------------------------------------------------------------------ */
/**
 * @param {object[]} armor  equipped armor items' system data ({kind, baseAC, magic, shieldBonus})
 * @param {number} dexDefense  Dexterity Table I defensive adjustment (negative is better)
 * @returns {{ac, rear, type, base, shield}}
 *   type = armor type used for weapon vs. armor adjustments: base armor plus
 *   shield, no magic or dexterity (DMG p.71 example: splint + magic shield is
 *   "AC 1, though his AC type is 3").
 */
export function armorClass(armor, dexDefense, { misc = 0, monkAC = null, bodyAC = null, bracersAC = null } = {}) {
  const suits = armor.filter(a => a.kind === "armor");
  const shields = armor.filter(a => a.kind === "shield");
  const suit = suits.sort((a, b) => a.baseAC - b.baseAC)[0];
  const shield = shields[0];
  let base = suit ? Number(suit.baseAC) : 10;
  if (monkAC !== null && !suit) base = monkAC;
  // PHB p.111 body weaponry: equivalent armor class, only while no armor is worn
  if (bodyAC !== null && !suit && !shield) base = Math.min(base, bodyAC);
  // DMG bracers of defense: an armor class as if wearing armor, not effective if armor is worn
  if (bracersAC !== null && !suit) base = Math.min(base, bracersAC);
  const shieldVal = shield ? Number(shield.shieldBonus ?? 1) : 0;
  const armorMagic = suit ? Number(suit.magic || 0) : 0;
  const shieldMagic = shield ? Number(shield.magic || 0) : 0;
  const dex = monkAC !== null ? 0 : dexDefense;   // PHB: dexterity gives monks no AC adjustment
  return {
    ac: base - shieldVal - armorMagic - shieldMagic + dex + misc,
    rear: base - armorMagic + misc,
    type: base - shieldVal,
    base,
    shield: !!shield
  };
}

/** Weapon vs. armor type adjustment: index 0..10 by armor type, clamped to the printed columns. */
export function weaponArmorAdj(acAdj, armorType) {
  if (!Array.isArray(acAdj) || acAdj.length !== 11) return 0;
  const i = Math.max(0, Math.min(10, Math.round(armorType)));
  return Number(acAdj[i]) || 0;
}

/* ------------------------------------------------------------------ */
/*  Thief functions                                                     */
/* ------------------------------------------------------------------ */
/**
 * @param {string|null} armorCat  key of THIEF_ARMOR (UA Thieves Table II) for the armor worn, or null to skip
 */
export function thiefSkills(classes, race, dexScore, armorCat = null) {
  let level = 0, def = null;
  for (const c of classes) {
    const d = CLASSES[c.key];
    if (!d || d.thiefSkills === undefined) continue;
    const eff = c.level + d.thiefSkills;
    if (eff > level) { level = eff; def = d; }
  }
  if (level < 1) return null;
  const monkOnly = !!def.monkSkills;
  // UA p.24: a thief-acrobat's thieving skills stop at 5th level, except climb walls, which keeps improving
  const frozen = def.acrobat ? Math.min(level, 5) : level;
  const row = THIEF_TABLE[Math.min(17, frozen)];
  const cwRow = THIEF_TABLE[Math.min(17, level)];
  const raceAdj = THIEF_RACE_ADJ[race] ?? THIEF_RACE_ADJ.human;
  const dexAll = dexterityThiefAdj(dexScore) ?? { pp: 0, ol: 0, ft: 0, ms: 0, hs: 0 };
  const armor = armorCat ? THIEF_ARMOR[armorCat] : null;
  // UA: no dexterity bonuses apply (penalties do) in armor other than simple leather
  const dexOK = !armor || armorCat === "none" || armorCat === "leather";
  const armorIdx = { pp: 0, ol: 1, ft: 2, ms: 3, hs: 4, hn: 5, cw: 6 };
  const out = {};
  THIEF_SKILL_KEYS.forEach((k, i) => {
    const base = k === "cw" ? cwRow[i] : row[i];
    if (base === null || (monkOnly && (k === "pp" || k === "rl"))) { out[k] = null; return; }
    let dex = dexAll[k] ?? 0;
    if (!dexOK && dex > 0) dex = 0;
    const arm = armor && armorIdx[k] !== undefined ? armor.v[armorIdx[k]] : 0;
    out[k] = { base, race: raceAdj[i], dex, armor: arm };
    out[k].total = Math.round((base + out[k].race + dex + arm) * 10) / 10;
  });
  return { level, skills: out, monk: monkOnly, acrobat: !!def.acrobat, armorCat };
}

/* ------------------------------------------------------------------ */
/*  Spell slots                                                         */
/* ------------------------------------------------------------------ */
/**
 * Slots per spell list, summing every class that grants that list.
 * Wisdom bonus spells (PHB Wisdom Table II, "Adjustments for Clerics and Druids"
 * per the errata in The Dragon #35) apply to the cleric and druid classes only,
 * and only at spell levels the character can already cast.
 */
export function spellSlots(classes, wisScore, extras = {}) {
  const lists = {};
  for (const c of classes) {
    const def = CLASSES[c.key];
    if (!def?.spells) continue;
    for (const sp of def.spells) {
      const slots = spellSlotsFor(sp.progression, c.level);
      if (def.wisBonusSpells ?? (classIs(c.key, "cleric") || classIs(c.key, "druid"))) {
        const bonus = wisdomTable(wisScore).bonusSpells;
        for (let i = 0; i < slots.length; i++) if (slots[i] > 0) slots[i] += bonus[i + 1] ?? 0;
      }
      const cur = lists[sp.list] ?? [];
      for (let i = 0; i < slots.length; i++) cur[i] = (cur[i] ?? 0) + slots[i];
      lists[sp.list] = cur;
    }
  }
  for (const [list, arr] of Object.entries(extras ?? {})) {
    if (!Array.isArray(arr) || !arr.some(n => n)) continue;
    const cur = lists[list] ?? [];
    arr.forEach((n, i) => { if (n) cur[i] = (cur[i] ?? 0) + Number(n); });
    lists[list] = cur;
  }
  return lists;
}

/* ------------------------------------------------------------------ */
/*  Hit points                                                          */
/* ------------------------------------------------------------------ */
/** Formula and constant for the hit points gained on reaching a level in a class. */
export function levelHitDice(classKey, level) {
  const def = CLASSES[classKey] ?? CLASSES.custom;
  if (level <= 1 && def.firstFormula) return { dice: 1, die: def.hitDie, fixed: 0, formula: def.firstFormula };
  if (level <= 1) return { dice: def.firstDice, die: def.hitDie, fixed: 0 };
  if (level <= levelOfMaxHD(def)) return { dice: 1, die: def.hitDie, fixed: 0 };
  return { dice: 0, die: def.hitDie, fixed: def.afterHP };
}
/** Last experience level that still rolls a hit die (first level counts its extra die). */
function levelOfMaxHD(def) {
  return def.maxHD - (def.firstDice - 1);
}

/* ------------------------------------------------------------------ */
/*  Experience                                                          */
/* ------------------------------------------------------------------ */
export function xpForLevel(classKey, level) {
  const def = CLASSES[classKey];
  if (!def) return null;
  if (level <= def.xp.length) return def.xp[level - 1];
  if (!def.xpStep) return null;
  return def.xp[def.xp.length - 1] + def.xpStep * (level - def.xp.length);
}

/* ------------------------------------------------------------------ */
/*  Racial saves                                                        */
/* ------------------------------------------------------------------ */
export function racialSaveBonus(race, con) {
  const r = RACIAL_SAVE_RACES[race];
  if (!r) return null;
  return { value: racialConSaveBonus(con), magic: r.magic, poison: r.poison };
}

/* ------------------------------------------------------------------ */
/*  Monk                                                                */
/* ------------------------------------------------------------------ */
export function monkInfo(level) {
  const r = MONK_TABLE[Math.max(1, Math.min(17, level))];
  return { ac: r[0], move: r[1], attacks: r[2], damageRange: r[3], damage: rangeToFormula(r[3]) };
}

/** Normalise a damage entry that may be a printed range ("2-8") or a dice formula. */
export function damageFormula(text) {
  const s = String(text ?? "").trim();
  if (!s) return "";
  return rangeToFormula(s) ?? s;
}

export { SAVE_KEYS, THIEF_SKILL_KEYS };

/** Body weaponry (PHB p.111): best armor class among the character's cleric, fighter and thief classes.
 *  Magic-users are excluded from the discipline; classes without a column (monk, bard) give none. */
const BW_GROUP = { cleric: 0, druid: 0, fighter: 1, paladin: 1, ranger: 1, cavalier: 1, paladinUA: 1, barbarian: 1, thief: 2, assassin: 2, acrobat: 2 };
export function bodyWeaponry(classes, mastery) {
  const row = BODY_WEAPONRY[Math.max(1, Math.min(12, mastery))];
  const cols = classes.map(c => BW_GROUP[c.key]).filter(i => i !== undefined);
  if (!cols.length) return { ac: null, weapon: row[3], mastery, noColumn: true };
  return { ac: Math.min(...cols.map(i => row[i])), weapon: row[3], mastery, noColumn: false };
}

/* ------------------------------------------------------------------ */
/*  Monster attack buttons from the printed Damage/Attack line          */
/* ------------------------------------------------------------------ */
const NO_DAMAGE = /^(nil|none|see below|see attack table|special|all special|variable|as form|as swan|by host|not applicable|not to exceed|age\b)/i;
const WEAPON = /\b(by weapons?(?: type)?|weapons?|as dagger|dagger)\b/i;
const DICE = /(\d+d\d+(?:[+-]\d+(?![-d\d]))?|\d+\s*-\s*\d+)/gi;

/** Split at a separator that is not inside parentheses. */
function splitTop(s, re) {
  const out = []; let depth = 0, last = 0;
  for (let i = 0; i < s.length; i++) {
    if (s[i] === "(") depth++;
    else if (s[i] === ")") depth = Math.max(0, depth - 1);
    else if (depth === 0) {
      re.lastIndex = 0;
      const m = re.exec(s.slice(i));
      if (m && m.index === 0) { out.push(s.slice(last, i)); i += m[0].length - 1; last = i + 1; }
    }
  }
  out.push(s.slice(last));
  return out.map(x => x.trim()).filter(Boolean);
}

/** One printed attack ("2-5", "1-4 (x4)", "by weapon type +7", "1-3 (bill)", "5d10") as buttons (usually one). */
function attackPart(raw, altBonus = 0) {
  let s = raw.replace(/[×X]/g, "x").replace(/–/g, "-").trim();
  if (!s || NO_DAMAGE.test(s)) return [];
  let times = "";
  let m = s.match(/^(\d+)\s*x\s+/i);                                   // "10x 1-4", "6 x 1-6"
  if (m) { times = m[1]; s = s.slice(m[0].length); }
  m = s.match(/\(?\s*\bx\s*(\d+(?:-\d+)?)\s*\)?/i);                    // "(x4)", "x10", "(x 4-6)"
  if (m) { times = m[1]; s = (s.slice(0, m.index) + " " + s.slice(m.index + m[0].length)).trim(); }
  let dmg = altBonus;
  // a flat bonus: "+7", "(+6 strength bonus)", "(+4)", "10 (strength bonus)"; not "1d6+1", "+ 1-4", "+1 point", "+ 1 per round"
  for (const b of s.matchAll(/\(?\s*\+\s*(\d+)\s*(?:\(?strength bonus\)?)?\s*\)?/gi)) {
    const before = s.slice(0, b.index), after = s.slice(b.index + b[0].length);
    if (/\d+d\d+\s*$/i.test(before) || (!b[0].trim().endsWith(")") && /^\s*(?:[-d\d]|points?|per|hp)/i.test(after))) continue;
    dmg += Number(b[1]); s = (before + " " + after).trim(); break;
  }
  if ((m = s.match(/\b(\d+)\s*\(strength bonus\)/i))) { dmg += Number(m[1]); s = s.replace(m[0], "").trim(); }
  const label = (s.match(/\(([a-z][a-z ]{1,20})\)/i)?.[1] ?? "").trim();   // "(bill)", "(sword)", "(male)"
  const name = label && !/see below|strength|special|plus|poison|acid|weapon/i.test(label) ? label[0].toUpperCase() + label.slice(1) : "";
  const tail = n => `${times ? ` ×${times}` : ""}${n ? ` ${n > 0 ? "+" : ""}${n}` : ""}`;
  // dice outside parentheses, plus any added with "plus" or "(+ 1-4)"
  const bare = s.replace(/\((?!\s*\+)[^)]*\)/g, " ");
  const dice = [...bare.matchAll(DICE)].map(x => x[0].replace(/\s+/g, ""));
  const out = [];
  if (dice.length) {
    const formulas = dice.map(d => /d/i.test(d) ? d : rangeToFormula(d)).filter(Boolean);
    if (formulas.length) {
      const n = /\bplus\b|\+/.test(bare) ? formulas.length : 1;
      out.push({ text: (name ? `${name} ` : "") + dice.slice(0, n).join(" + ") + tail(dmg), formula: formulas.slice(0, n).join(" + "), dmg, weapon: false });
    }
  }
  if (WEAPON.test(s) && !/possible weapon/i.test(s)) {
    if (/dagger/i.test(s) && !/by weapon/i.test(s)) out.push({ text: "Dagger" + tail(dmg), formula: "1d4", dmg, weapon: false });
    else out.push({ text: "Weapon" + tail(dmg), formula: "", dmg, weapon: true });
  }
  if (!out.length && (m = bare.trim().match(/^(\d+)(?:\s*(?:points?|hp|hit points?|each))?\b(?!\s*['’-])/i)))   // "2 each", "1 point", "10 hit points"
    out.push({ text: m[1] + tail(dmg), formula: m[1], dmg, weapon: false });
  return out;
}

/**
 * Attack buttons from a monster's printed Damage/Attack line. "/" separates attacks; "or" separates
 * alternative routines (the first button of each later alternative has alt: true); "each", "(x4)",
 * "+ poison", "(see below)" and similar notes are kept out of the dice. Entries with no damage
 * ("Nil", "See below", "Special") give no buttons; "by weapon type" gives a Weapon button with no dice.
 */
export function monsterAttackButtons(text) {
  let s = String(text ?? "").replace(/[×X]/g, "x").replace(/–/g, "-").replace(/\band\/or\b/gi, "/").trim();
  if (!s || NO_DAMAGE.test(s)) return [];
  s = s.replace(/(\d+-\d+)\s+to\s+(\d+-\d+)/g, "$1 or $2")                       // "5-20 to 15-60"
       .replace(/(\d+\s*-\s*\d+|\d+d\d+),\s*(?=[^/]*\bor\b)/g, "$1 or ")          // "1-6, 1-8, or 1-10"
       .replace(/\(\s*and\s+([^)]+)\)/gi, "/ $1")                                  // "5-20 (and 2-12)"
       .replace(/(\d+\s*-\s*\d+|\d+d\d+|weapon(?: type)?)\s*\(([\d\s\-\/d]+)\)/gi, (all, a, b) => {
         const f = x => x.split("/").map(y => damageFormula(y.trim())).join("/");
         return f(a) === f(b) ? a : `${a} or ${b}`;                                // "2-12 (2-12)"; "3-12 (2-8)"
       });
  const out = [];
  splitTop(s, /\s*,?\s+or\s+|\s*;\s*/iy).forEach((alt, ai) => {
    let altBonus = 0;
    const sb = alt.match(/\/[^/]*\(\s*\+\s*(\d+)\s*strength bonus\s*\)\s*$/i);   // "4-15/4-15 (+6 strength bonus)": every attack
    if (sb) { altBonus = Number(sb[1]); alt = alt.replace(/\(\s*\+\s*\d+\s*strength bonus\s*\)\s*$/i, "").trim(); }
    const parts = splitTop(alt, /\s*\/\s*/y).flatMap(p => {
      const bits = splitTop(p, /\s*,\s*|\s+and\s+/iy);
      return bits.length > 1 && bits.every(b => /\d+\s*-\s*\d+|\d+d\d+|weapon/i.test(b)) ? bits : [p];
    });
    let first = true;
    for (const p of parts) {
      for (const b of attackPart(p, altBonus)) { out.push({ ...b, alt: ai > 0 && first }); first = false; }
    }
  });
  return out;
}
