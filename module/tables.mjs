/**
 * 1e FRPG rules tables.
 *
 * Every table here was transcribed from the PHB, Dungeon
 * Masters Guide (DMG) or UA. The source page/table is noted
 * on each block so it can be checked against the book.
 *
 * Pure data, no Foundry dependencies, so it can be unit-tested in Node.
 */

/* ------------------------------------------------------------------ */
/*  ATTACK MATRICES (DMG p.74-75, "COMBAT TABLES")                      */
/* ------------------------------------------------------------------ */
/*
 * Each matrix column is stored as the score needed to hit AC 10 ("base").
 * The printed tables then rise by 1 per point of AC, except that 20 is
 * repeated six times before continuing with 21 (DMG p.73: "project upwards
 * by 1's (5% increments), repeating 20 six times before continuing with 21").
 * scoreToHit() reproduces every printed cell; the unit tests compare it to
 * the DMG rows.
 */
export const ATTACK_MATRICES = {
  // I.A. Clerics, Druids and Monks
  cleric: {
    label: "Clerics, Druids and Monks (DMG I.A)",
    brackets: [
      { min: 1, max: 3, base: 10 },
      { min: 4, max: 6, base: 8 },
      { min: 7, max: 9, base: 6 },
      { min: 10, max: 12, base: 4 },
      { min: 13, max: 15, base: 2 },
      { min: 16, max: 18, base: 0 },
      { min: 19, max: Infinity, base: -1 }
    ]
  },
  // I.B. Fighters, Paladins, Rangers, Bards, and 0 level halflings and humans
  fighter: {
    label: "Fighters, Paladins, Rangers, Bards (DMG I.B)",
    brackets: [
      { min: 0, max: 0, base: 11 },
      { min: 1, max: 2, base: 10 },
      { min: 3, max: 4, base: 8 },
      { min: 5, max: 6, base: 6 },
      { min: 7, max: 8, base: 4 },
      { min: 9, max: 10, base: 2 },
      { min: 11, max: 12, base: 0 },
      { min: 13, max: 14, base: -2 },
      { min: 15, max: 16, base: -4 },
      { min: 17, max: Infinity, base: -6 }
    ]
  },
  // I.C. Magic-Users and Illusionists
  magicuser: {
    label: "Magic-Users and Illusionists (DMG I.C)",
    brackets: [
      { min: 1, max: 5, base: 11 },
      { min: 6, max: 10, base: 9 },
      { min: 11, max: 15, base: 6 },
      { min: 16, max: 20, base: 3 },
      { min: 21, max: Infinity, base: 1 }
    ]
  },
  // I.D.1. Thieves and Assassins
  thief: {
    label: "Thieves and Assassins (DMG I.D.1)",
    brackets: [
      { min: 1, max: 4, base: 11 },
      { min: 5, max: 8, base: 9 },
      { min: 9, max: 12, base: 6 },
      { min: 13, max: 16, base: 4 },
      { min: 17, max: 20, base: 2 },
      { min: 21, max: Infinity, base: 0 }
    ]
  }
};

/** Back stab multiplier by thief/assassin level (DMG I.D.1 footnotes a-d). */
export function backstabMultiplier(level) {
  if (level <= 4) return 2;
  if (level <= 8) return 3;
  if (level <= 12) return 4;
  return 5;
}

/*
 * II. Attack Matrix for Monsters (DMG p.75). Columns are by hit dice.
 * "Any plus above +3 equals another hit die, i.e. 6 + 6 equals 7 hit dice."
 */
export const MONSTER_MATRIX = [
  { key: "lt1-1", label: "up to 1-1", base: 11 },
  { key: "1-1", label: "1-1", base: 10 },
  { key: "1", label: "1", base: 9 },
  { key: "1+", label: "1+", base: 8 },
  { key: "2-3+", label: "2-3+", base: 6, min: 2, max: 3 },
  { key: "4-5+", label: "4-5+", base: 5, min: 4, max: 5 },
  { key: "6-7+", label: "6-7+", base: 3, min: 6, max: 7 },
  { key: "8-9+", label: "8-9+", base: 2, min: 8, max: 9 },
  { key: "10-11+", label: "10-11+", base: 0, min: 10, max: 11 },
  { key: "12-13+", label: "12-13+", base: -1, min: 12, max: 13 },
  { key: "14-15+", label: "14-15+", base: -2, min: 14, max: 15 },
  { key: "16+", label: "16+", base: -3, min: 16, max: Infinity }
];

/** Apply the "20 repeated six times" progression to a raw score. */
export function progressionScore(raw) {
  if (raw < 20) return raw;
  if (raw <= 25) return 20;
  return raw - 5;
}

/** Score needed on d20 for a matrix column base against an armor class. */
export function scoreFromBase(base, ac) {
  return progressionScore(base + (10 - ac));
}

/* ------------------------------------------------------------------ */
/*  SAVING THROWS (DMG p.79, I. Saving Throw Matrix for Characters)     */
/* ------------------------------------------------------------------ */
/* Columns: [Paralyzation/Poison/Death, Petrification/Polymorph,
 *           Rod/Staff/Wand, Breath Weapon, Spell]                      */
export const SAVE_KEYS = ["ppd", "pp", "rsw", "bw", "sp"];

export const SAVING_THROWS = {
  cleric: [ // includes Druids
    { min: 1, max: 3, v: [10, 13, 14, 16, 15] },
    { min: 4, max: 6, v: [9, 12, 13, 15, 14] },
    { min: 7, max: 9, v: [7, 10, 11, 13, 12] },
    { min: 10, max: 12, v: [6, 9, 10, 12, 11] },
    { min: 13, max: 15, v: [5, 8, 9, 11, 10] },
    { min: 16, max: 18, v: [4, 7, 8, 10, 9] },
    { min: 19, max: Infinity, v: [2, 5, 6, 8, 7] }
  ],
  fighter: [ // includes Paladins, Rangers and 0 level types
    { min: 0, max: 0, v: [16, 17, 18, 20, 19] },
    { min: 1, max: 2, v: [14, 15, 16, 17, 17] },
    { min: 3, max: 4, v: [13, 14, 15, 16, 16] },
    { min: 5, max: 6, v: [11, 12, 13, 13, 14] },
    { min: 7, max: 8, v: [10, 11, 12, 12, 13] },
    { min: 9, max: 10, v: [8, 9, 10, 9, 11] },
    { min: 11, max: 12, v: [7, 8, 9, 8, 10] },
    { min: 13, max: 14, v: [5, 6, 7, 5, 8] },
    { min: 15, max: 16, v: [4, 5, 6, 4, 7] },
    { min: 17, max: Infinity, v: [3, 4, 5, 4, 6] }
  ],
  magicuser: [ // includes Illusionists
    { min: 1, max: 5, v: [14, 13, 11, 15, 12] },
    { min: 6, max: 10, v: [13, 11, 9, 13, 10] },
    { min: 11, max: 15, v: [11, 9, 7, 11, 8] },
    { min: 16, max: 20, v: [10, 7, 5, 9, 6] },
    { min: 21, max: Infinity, v: [8, 5, 3, 7, 4] }
  ],
  thief: [ // includes Assassins and Monks
    { min: 1, max: 4, v: [13, 12, 14, 16, 15] },
    { min: 5, max: 8, v: [12, 11, 12, 15, 13] },
    { min: 9, max: 12, v: [11, 10, 10, 14, 11] },
    { min: 13, max: 16, v: [10, 9, 8, 13, 9] },
    { min: 17, max: 20, v: [9, 8, 6, 12, 7] },
    { min: 21, max: Infinity, v: [8, 7, 4, 11, 5] }
  ]
};

/* ------------------------------------------------------------------ */
/*  ABILITY TABLES (PHB p.9-12)                                         */
/* ------------------------------------------------------------------ */

/** STRENGTH TABLE II (PHB p.9). Keyed by score; exceptional 18 by percentile band. */
const STR_ROWS = [
  // [max score or key, hit, dmg, weight allowance, open doors, bend bars %]
  { s: 3, hit: -3, dmg: -1, wt: -350, od: "1", bb: 0 },
  { s: 5, hit: -2, dmg: -1, wt: -250, od: "1", bb: 0 },
  { s: 7, hit: -1, dmg: 0, wt: -150, od: "1", bb: 0 },
  { s: 9, hit: 0, dmg: 0, wt: 0, od: "1-2", bb: 1 },
  { s: 11, hit: 0, dmg: 0, wt: 0, od: "1-2", bb: 2 },
  { s: 13, hit: 0, dmg: 0, wt: 100, od: "1-2", bb: 4 },
  { s: 15, hit: 0, dmg: 0, wt: 200, od: "1-2", bb: 7 },
  { s: 16, hit: 0, dmg: 1, wt: 350, od: "1-3", bb: 10 },
  { s: 17, hit: 1, dmg: 1, wt: 500, od: "1-3", bb: 13 },
  { s: 18, hit: 1, dmg: 2, wt: 750, od: "1-3", bb: 16 }
];
const STR_EXCEPTIONAL = [
  { max: 50, hit: 1, dmg: 3, wt: 1000, od: "1-3", bb: 20 },
  { max: 75, hit: 2, dmg: 3, wt: 1250, od: "1-4", bb: 25 },
  { max: 90, hit: 2, dmg: 4, wt: 1500, od: "1-4", bb: 30 },
  { max: 99, hit: 2, dmg: 5, wt: 2000, od: "1-4 (1)", bb: 35 },
  { max: 100, hit: 3, dmg: 6, wt: 3000, od: "1-5 (2)", bb: 40 }
];

/**
 * @param {number} score  3-18 (values outside are clamped to the table)
 * @param {number} pct    exceptional strength 1-100 (100 = 18/00); 0 = none
 */
export function strengthTable(score, pct = 0) {
  if (score >= 18 && pct > 0) return { ...STR_EXCEPTIONAL.find(r => pct <= r.max) };
  const s = Math.max(3, Math.min(18, score));
  return { ...STR_ROWS.find(r => s <= r.s) };
}

/** INTELLIGENCE TABLE I (additional languages) and II (magic-users). PHB p.10 */
const INT_LANGUAGES = { 3: 0, 4: 0, 5: 0, 6: 0, 7: 0, 8: 1, 9: 1, 10: 2, 11: 2, 12: 3, 13: 3, 14: 4, 15: 4, 16: 5, 17: 6, 18: 7 };
const INT_MU = [
  { max: 8, know: null, min: null, maxSpells: null },
  { max: 9, know: 35, min: 4, maxSpells: 6 },
  { max: 12, know: 45, min: 5, maxSpells: 7 },
  { max: 14, know: 55, min: 6, maxSpells: 9 },
  { max: 16, know: 65, min: 7, maxSpells: 11 },
  { max: 17, know: 75, min: 8, maxSpells: 14 },
  { max: 18, know: 85, min: 9, maxSpells: 18 },
  { max: Infinity, know: 95, min: 10, maxSpells: "All" }
];
export function intelligenceTable(score) {
  const s = Math.max(3, Math.min(19, score));
  const mu = INT_MU.find(r => s <= r.max);
  return {
    languages: INT_LANGUAGES[Math.min(18, s)],
    knowSpell: mu.know, minSpells: mu.min, maxSpells: mu.maxSpells
  };
}

/** WISDOM TABLE I (magical attack adjustment) and II (clerics). PHB p.11 */
const WIS_MAGIC_ADJ = { 3: -3, 4: -2, 5: -1, 6: -1, 7: -1, 8: 0, 9: 0, 10: 0, 11: 0, 12: 0, 13: 0, 14: 0, 15: 1, 16: 2, 17: 3, 18: 4 };
const WIS_FAILURE = { 9: 20, 10: 15, 11: 10, 12: 5 };
/* Bonus spells are cumulative: 13 one 1st, 14 one 1st, 15 one 2nd, 16 one 2nd, 17 one 3rd, 18 one 4th */
const WIS_BONUS_STEPS = [[13, 1], [14, 1], [15, 2], [16, 2], [17, 3], [18, 4]];
export function wisdomTable(score) {
  const s = Math.max(3, Math.min(18, score));
  const bonus = [0, 0, 0, 0, 0, 0, 0, 0];   // index = spell level (1-7)
  for (const [min, lvl] of WIS_BONUS_STEPS) if (score >= min) bonus[lvl] += 1;
  return {
    magicAdj: WIS_MAGIC_ADJ[s],
    spellFailure: score < 9 ? null : (WIS_FAILURE[s] ?? 0),
    bonusSpells: bonus
  };
}

/** DEXTERITY TABLE I (PHB p.11). reaction = surprise & missile to-hit; defense = AC adjustment. */
const DEX_ROWS = {
  3: [-3, 4], 4: [-2, 3], 5: [-1, 2], 6: [0, 1], 7: [0, 0], 8: [0, 0], 9: [0, 0], 10: [0, 0], 11: [0, 0],
  12: [0, 0], 13: [0, 0], 14: [0, 0], 15: [0, -1], 16: [1, -2], 17: [2, -3], 18: [3, -4]
};
export function dexterityTable(score) {
  const s = Math.max(3, Math.min(18, score));
  return { reaction: DEX_ROWS[s][0], defense: DEX_ROWS[s][1] };
}

/** DEXTERITY TABLE II: adjustments for thieves (PHB p.12). [PP, OL, F/RT, MS, HS] */
const DEX_THIEF = {
  9: [-15, -10, -10, -20, -10],
  10: [-10, -5, -10, -15, -5],
  11: [-5, 0, -5, -10, 0],
  12: [0, 0, 0, -5, 0],
  13: [0, 0, 0, 0, 0],
  14: [0, 0, 0, 0, 0],
  15: [0, 0, 0, 0, 0],
  16: [0, 5, 0, 0, 0],
  17: [5, 10, 0, 5, 5],
  18: [10, 15, 5, 10, 10]
};
export function dexterityThiefAdj(score) {
  if (score < 9) return null;   // below the table (thieves need 9 dexterity)
  const r = DEX_THIEF[Math.min(18, score)];
  return { pp: r[0], ol: r[1], ft: r[2], ms: r[3], hs: r[4] };
}

/** CONSTITUTION TABLE (PHB p.12). hp = [normal, fighter] adjustment per die. */
const CON_ROWS = {
  3: [-2, -2, 35, 40], 4: [-1, -1, 40, 45], 5: [-1, -1, 45, 50], 6: [-1, -1, 50, 55], 7: [0, 0, 55, 60],
  8: [0, 0, 60, 65], 9: [0, 0, 65, 70], 10: [0, 0, 70, 75], 11: [0, 0, 75, 80], 12: [0, 0, 80, 85],
  13: [0, 0, 85, 90], 14: [0, 0, 88, 92], 15: [1, 1, 91, 94], 16: [2, 2, 95, 96], 17: [2, 3, 97, 98],
  18: [2, 4, 99, 100]
};
export function constitutionTable(score) {
  const s = Math.max(3, Math.min(18, score));
  const r = CON_ROWS[s];
  return { hp: r[0], hpFighter: r[1], systemShock: r[2], resurrection: r[3] };
}

/** CHARISMA TABLE (PHB p.13). */
const CHA_ROWS = {
  3: [1, -30, -25], 4: [1, -25, -20], 5: [2, -20, -15], 6: [2, -15, -10], 7: [3, -10, -5], 8: [3, -5, 0],
  9: [4, 0, 0], 10: [4, 0, 0], 11: [4, 0, 0], 12: [5, 0, 0], 13: [5, 0, 5], 14: [6, 5, 10],
  15: [7, 15, 15], 16: [8, 20, 25], 17: [10, 30, 30], 18: [15, 40, 35]
};
export function charismaTable(score) {
  const s = Math.max(3, Math.min(18, score));
  const r = CHA_ROWS[s];
  return { henchmen: r[0], loyalty: r[1], reaction: r[2] };
}

/**
 * Racial saving throw bonus vs. rods/staves/wands and spells (and poison for
 * dwarves and halflings): +1 per 3½ points of constitution (PHB p.15-17).
 * Halfling text gives the bands 4-6 +1, 7-10 +2, 11-13 +3, 14-17 +4, 18 +5.
 */
export function racialConSaveBonus(con) {
  return Math.floor(Math.max(0, con) / 3.5);
}
export const RACIAL_SAVE_RACES = {
  dwarf: { magic: true, poison: true },
  gnome: { magic: true, poison: false },
  halfling: { magic: true, poison: true }
};

/* ------------------------------------------------------------------ */
/*  THIEF FUNCTIONS (PHB p.28)                                          */
/* ------------------------------------------------------------------ */
export const THIEF_SKILL_KEYS = ["pp", "ol", "ft", "ms", "hs", "hn", "cw", "rl"];
/* Levels 1-17. Values are percentages; hear noise is "in 6" style % in the PHB (10% = 1 in 10?). The
 * PHB prints Hear Noise as a percentage too, so it is kept as printed. */
export const THIEF_TABLE = {
  1: [30, 25, 20, 15, 10, 10, 85, null],
  2: [35, 29, 25, 21, 15, 10, 86, null],
  3: [40, 33, 30, 27, 20, 15, 87, null],
  4: [45, 37, 35, 33, 25, 15, 88, 20],
  5: [50, 42, 40, 40, 31, 20, 90, 25],
  6: [55, 47, 45, 47, 37, 20, 92, 30],
  7: [60, 52, 50, 55, 43, 25, 94, 35],
  8: [65, 57, 55, 62, 49, 25, 96, 40],
  9: [70, 62, 60, 70, 56, 30, 98, 45],
  10: [80, 67, 65, 78, 63, 30, 99, 50],
  11: [90, 72, 70, 86, 70, 35, 99.1, 55],
  12: [100, 77, 75, 94, 77, 35, 99.2, 60],
  13: [105, 82, 80, 99, 85, 40, 99.3, 65],
  14: [110, 87, 85, 99, 93, 40, 99.4, 70],
  15: [115, 92, 90, 99, 99, 50, 99.5, 75],
  16: [125, 97, 95, 99, 99, 50, 99.6, 80],
  17: [125, 99, 99, 99, 99, 55, 99.7, 80]
};
/* Racial adjustments (PHB p.28). Order matches THIEF_SKILL_KEYS. */
export const THIEF_RACE_ADJ = {
  dwarf: [0, 10, 15, 0, 0, 0, -10, -5],
  elf: [5, -5, 0, 5, 10, 5, 0, 0],
  gnome: [0, 5, 10, 5, 5, 10, -15, 0],
  "half-elf": [10, 0, 0, 0, 5, 0, 0, 0],
  halfling: [5, 5, 5, 10, 15, 5, -15, -5],
  "half-orc": [-5, 5, 5, 0, 0, 5, 5, -10],
  human: [0, 0, 0, 0, 0, 0, 0, 0]
};

/* ------------------------------------------------------------------ */
/*  SPELLS USABLE BY CLASS AND LEVEL (PHB p.20-26)                       */
/* ------------------------------------------------------------------ */
/* Each entry: caster level -> slots per spell level [1st, 2nd, ...]. */
export const SPELL_PROGRESSION = {
  cleric: {
    1: [1], 2: [2], 3: [2, 1], 4: [3, 2], 5: [3, 3, 1], 6: [3, 3, 2], 7: [3, 3, 2, 1], 8: [3, 3, 3, 2],
    9: [4, 4, 3, 2, 1], 10: [4, 4, 3, 3, 2], 11: [5, 4, 4, 3, 2, 1], 12: [6, 5, 5, 3, 2, 2],
    13: [6, 6, 6, 4, 2, 2], 14: [6, 6, 6, 5, 3, 2], 15: [7, 7, 7, 5, 4, 2], 16: [7, 7, 7, 6, 5, 3, 1],
    17: [8, 8, 8, 6, 5, 3, 1], 18: [8, 8, 8, 7, 6, 4, 1], 19: [9, 9, 9, 7, 6, 4, 2], 20: [9, 9, 9, 8, 7, 5, 2],
    21: [9, 9, 9, 9, 8, 6, 2], 22: [9, 9, 9, 9, 9, 6, 3], 23: [9, 9, 9, 9, 9, 7, 3], 24: [9, 9, 9, 9, 9, 8, 3],
    25: [9, 9, 9, 9, 9, 8, 4], 26: [9, 9, 9, 9, 9, 9, 4], 27: [9, 9, 9, 9, 9, 9, 5], 28: [9, 9, 9, 9, 9, 9, 6],
    29: [9, 9, 9, 9, 9, 9, 7]
  },
  druid: {
    1: [2], 2: [2, 1], 3: [3, 2, 1], 4: [4, 2, 2], 5: [4, 3, 2], 6: [4, 3, 2, 1], 7: [4, 4, 3, 1],
    8: [4, 4, 3, 2], 9: [5, 4, 3, 2, 1], 10: [5, 4, 3, 3, 2], 11: [5, 5, 3, 3, 2, 1],
    12: [5, 5, 4, 4, 3, 2, 1], 13: [6, 5, 5, 5, 4, 3, 2], 14: [6, 6, 6, 6, 5, 4, 3]
  },
  magicuser: {
    1: [1], 2: [2], 3: [2, 1], 4: [3, 2], 5: [4, 2, 1], 6: [4, 2, 2], 7: [4, 3, 2, 1], 8: [4, 3, 3, 2],
    9: [4, 3, 3, 2, 1], 10: [4, 4, 3, 2, 2], 11: [4, 4, 4, 3, 3], 12: [4, 4, 4, 4, 4, 1],
    13: [5, 5, 5, 4, 4, 2], 14: [5, 5, 5, 4, 4, 2, 1], 15: [5, 5, 5, 5, 5, 2, 1],
    16: [5, 5, 5, 5, 5, 3, 2, 1], 17: [5, 5, 5, 5, 5, 3, 3, 2], 18: [5, 5, 5, 5, 5, 3, 3, 2, 1],
    19: [5, 5, 5, 5, 5, 3, 3, 3, 1], 20: [5, 5, 5, 5, 5, 4, 3, 3, 2], 21: [5, 5, 5, 5, 5, 4, 4, 4, 2],
    22: [5, 5, 5, 5, 5, 5, 4, 4, 3], 23: [5, 5, 5, 5, 5, 5, 5, 5, 3], 24: [5, 5, 5, 5, 5, 5, 5, 5, 4],
    25: [5, 5, 5, 5, 5, 5, 5, 5, 5], 26: [6, 6, 6, 6, 5, 5, 5, 5, 5], 27: [6, 6, 6, 6, 6, 6, 6, 5, 5],
    28: [6, 6, 6, 6, 6, 6, 6, 6, 6], 29: [7, 7, 7, 7, 6, 6, 6, 6, 6]
  },
  illusionist: {
    1: [1], 2: [2], 3: [2, 1], 4: [3, 2], 5: [4, 2, 1], 6: [4, 3, 1], 7: [4, 3, 2], 8: [4, 3, 2, 1],
    9: [5, 3, 3, 2], 10: [5, 4, 3, 2, 1], 11: [5, 4, 3, 3, 2], 12: [5, 5, 4, 3, 2, 1],
    13: [5, 5, 4, 3, 2, 2], 14: [5, 5, 4, 3, 2, 2, 1], 15: [5, 5, 4, 4, 2, 2, 2],
    16: [5, 5, 5, 4, 3, 2, 2], 17: [5, 5, 5, 5, 3, 2, 2], 18: [5, 5, 5, 5, 3, 3, 2],
    19: [5, 5, 5, 5, 4, 3, 2], 20: [5, 5, 5, 5, 4, 3, 3], 21: [5, 5, 5, 5, 5, 4, 3],
    22: [5, 5, 5, 5, 5, 5, 4], 23: [5, 5, 5, 5, 5, 5, 5], 24: [6, 6, 6, 6, 5, 5, 5],
    25: [6, 6, 6, 6, 6, 6, 6], 26: [7, 7, 7, 7, 6, 6, 6]
  },
  // Bards: druid spells by bard level (PHB Bards Table I). Levels 20 and 21 are printed in a split column.
  bard: {
    1: [1], 2: [2], 3: [3], 4: [3, 1], 5: [3, 2], 6: [3, 3], 7: [3, 3, 1], 8: [3, 3, 2], 9: [3, 3, 3],
    10: [3, 3, 3, 1], 11: [3, 3, 3, 2], 12: [3, 3, 3, 3], 13: [3, 3, 3, 3, 1], 14: [3, 3, 3, 3, 2],
    15: [3, 3, 3, 3, 3], 16: [4, 3, 3, 3, 3], 17: [4, 4, 3, 3, 3], 18: [4, 4, 4, 3, 3], 19: [5, 4, 4, 4, 3],
    20: [5, 4, 4, 4, 4], 21: [5, 5, 4, 4, 4], 22: [5, 5, 5, 4, 4], 23: [5, 5, 5, 5, 5]
  },
  // Paladins: clerical spells from 9th level (PHB p.24). Maximum at 20th.
  paladin: {
    9: [1], 10: [2], 11: [2, 1], 12: [2, 2], 13: [2, 2, 1], 14: [3, 2, 1], 15: [3, 2, 1, 1],
    16: [3, 3, 1, 1], 17: [3, 3, 2, 1], 18: [3, 3, 3, 1], 19: [3, 3, 3, 2], 20: [3, 3, 3, 3]
  },
  // Rangers: druidic spells from 8th, magic-user spells from 9th (PHB p.25). Maximum at 17th.
  rangerDruid: {
    8: [1], 9: [1], 10: [2], 11: [2], 12: [2, 1], 13: [2, 1], 14: [2, 2], 15: [2, 2], 16: [2, 2, 1], 17: [2, 2, 2]
  },
  rangerMagicuser: {
    9: [1], 10: [1], 11: [2], 12: [2, 1], 13: [2, 1], 14: [2, 2], 15: [2, 2], 16: [2, 2], 17: [2, 2]
  }
};

/** Spell slot lookup: tables stop at their last printed level. */
export function spellSlotsFor(progressionKey, level) {
  const table = SPELL_PROGRESSION[progressionKey];
  if (!table) return [];
  const levels = Object.keys(table).map(Number).sort((a, b) => a - b);
  if (level < levels[0]) return [];
  const use = Math.min(level, levels[levels.length - 1]);
  return [...(table[use] ?? [])];
}

/* ------------------------------------------------------------------ */
/*  CLASSES (PHB p.19-31)                                              */
/* ------------------------------------------------------------------ */
/*
 * hitDie: die type; firstDice: dice rolled at 1st level; maxHD: last level
 * that gains a hit die; afterHP: fixed hp per level after maxHD.
 * xp: minimum XP for levels 1..N (index 0 = level 1); xpStep: XP per
 * level beyond the table.
 */
export const CLASSES = {
  cleric: {
    label: "Cleric", hitDie: 8, firstDice: 1, maxHD: 9, afterHP: 2, matrix: "cleric", save: "cleric",
    fighterCon: false, nonProf: -3,
    spells: [{ list: "cleric", progression: "cleric" }],
    xp: [0, 1501, 3001, 6001, 13001, 27501, 55001, 110001, 225001, 450001, 675001], xpStep: 225000
  },
  druid: {
    label: "Druid", hitDie: 8, firstDice: 1, maxHD: 14, afterHP: 0, matrix: "cleric", save: "cleric",
    fighterCon: false, nonProf: -4, maxLevel: 14,
    spells: [{ list: "druid", progression: "druid" }],
    xp: [0, 2001, 4001, 7501, 12501, 20001, 35001, 60001, 90001, 125001, 200001, 300001, 750001, 1500001]
  },
  fighter: {
    label: "Fighter", hitDie: 10, firstDice: 1, maxHD: 9, afterHP: 3, matrix: "fighter", save: "fighter",
    fighterCon: true, exceptionalStr: true, nonProf: -2,
    xp: [0, 2001, 4001, 8001, 18001, 35001, 70001, 125001, 250001, 500001, 750001], xpStep: 250000
  },
  paladin: {
    label: "Paladin", hitDie: 10, firstDice: 1, maxHD: 9, afterHP: 3, matrix: "fighter", save: "fighter",
    fighterCon: true, exceptionalStr: true, nonProf: -2,
    spells: [{ list: "cleric", progression: "paladin" }],
    turnUndeadOffset: -2,
    xp: [0, 2751, 5501, 12001, 24001, 45001, 95001, 175001, 350001, 700001, 1050001], xpStep: 350000
  },
  ranger: {
    label: "Ranger", hitDie: 8, firstDice: 2, maxHD: 11, afterHP: 2, matrix: "fighter", save: "fighter",
    fighterCon: true, exceptionalStr: true, nonProf: -2,
    spells: [{ list: "druid", progression: "rangerDruid" }, { list: "magicuser", progression: "rangerMagicuser" }],
    xp: [0, 2251, 4501, 10001, 20001, 40001, 90001, 150001, 225001, 325001, 650001, 975001], xpStep: 325000
  },
  magicuser: {
    label: "Magic-User", hitDie: 4, firstDice: 1, maxHD: 11, afterHP: 1, matrix: "magicuser", save: "magicuser",
    fighterCon: false, nonProf: -5,
    spells: [{ list: "magicuser", progression: "magicuser" }],
    xp: [0, 2501, 5001, 10001, 22501, 40001, 60001, 90001, 135001, 250001, 375001, 750001, 1125001,
      1500001, 1875001, 2250001, 2625001, 3000001], xpStep: 375000
  },
  illusionist: {
    label: "Illusionist", hitDie: 4, firstDice: 1, maxHD: 10, afterHP: 1, matrix: "magicuser", save: "magicuser",
    fighterCon: false, nonProf: -5,
    spells: [{ list: "illusionist", progression: "illusionist" }],
    xp: [0, 2251, 4501, 9001, 18001, 35001, 60001, 95001, 145001, 220001, 440001, 660001], xpStep: 220000
  },
  thief: {
    label: "Thief", hitDie: 6, firstDice: 1, maxHD: 10, afterHP: 2, matrix: "thief", save: "thief",
    fighterCon: false, nonProf: -3, thiefSkills: 0, backstab: true,
    xp: [0, 1251, 2501, 5001, 10001, 20001, 42501, 70001, 110001, 160001, 220001, 440001], xpStep: 220000
  },
  assassin: {
    label: "Assassin", hitDie: 6, firstDice: 1, maxHD: 15, afterHP: 0, matrix: "thief", save: "thief",
    fighterCon: false, nonProf: -2, thiefSkills: -2, backstab: true, maxLevel: 15,
    xp: [0, 1501, 3001, 6001, 12001, 25001, 50001, 100001, 200001, 300001, 425001, 575001, 750001, 1000001, 1500001]
  },
  monk: {
    // The PHB says monks attack on the thieves' table; DMG matrix I.A lists monks with clerics.
    // The DMG combat tables are used by default; the per-class "matrix" can be changed on the sheet.
    label: "Monk", hitDie: 4, firstDice: 2, maxHD: 18, afterHP: 0, matrix: "cleric", save: "thief",
    fighterCon: false, nonProf: -3, thiefSkills: 0, monkSkills: true, maxLevel: 17,
    xp: [0, 2251, 4751, 10001, 22501, 47501, 98001, 200001, 350001, 500001, 700001, 950001, 1250001,
      1750001, 2250001, 2750001, 3250001]
  },
  bard: {
    // PHB Appendix II. Bards fight at their fighter level and use thief abilities at their thief level, so keep
    // the Fighter and Thief rows on the sheet; the Bard row adds druid saves, spells, charm and lore.
    label: "Bard", hitDie: 6, firstDice: 0, maxHD: 10, afterHP: 1, matrix: null, save: "cleric",
    fighterCon: false, nonProf: -2, maxLevel: 23, dualClass: true,
    spells: [{ list: "druid", progression: "bard" }],
    xp: [0, 2001, 4001, 8001, 16001, 25001, 40001, 60001, 85001, 110001, 150001, 200001, 400001, 600001, 800001,
      1000001, 1200001, 1400001, 1600001, 1800001, 2000001, 2200001, 3000001]
  },
  cavalier: {
    // UA p.15-17
    label: "Cavalier (UA)", hitDie: 10, firstDice: 1, firstFormula: "1d10+3", maxHD: 10, afterHP: 3, matrix: "fighter", save: "fighter",
    fighterCon: true, exceptionalStr: true, nonProf: -3, cavalier: true,
    xp: [0, 2501, 5001, 10001, 18501, 37001, 85001, 140001, 220001, 300001, 600001, 900001], xpStep: 300000
  },
  paladinUA: {
    // UA p.17: the paladin becomes a cavalier sub-class; PHB tables unchanged, cavalier abilities added
    label: "Paladin (UA cavalier)", hitDie: 10, firstDice: 1, firstFormula: "1d10+3", maxHD: 9, afterHP: 3, matrix: "fighter", save: "fighter",
    fighterCon: true, exceptionalStr: true, nonProf: -3, cavalier: true,
    spells: [{ list: "cleric", progression: "paladin" }],
    turnUndeadOffset: -2,
    xp: [0, 2751, 5501, 12001, 24001, 45001, 95001, 175001, 350001, 700001, 1050001], xpStep: 350000
  },
  barbarian: {
    // UA p.19-21
    label: "Barbarian (UA)", hitDie: 12, firstDice: 1, maxHD: 8, afterHP: 4, matrix: "fighter", save: "fighter",
    fighterCon: true, exceptionalStr: true, nonProf: -1, barbarian: true,
    xp: [0, 6001, 12001, 24001, 48001, 80001, 150001, 275001, 500001, 1000001, 1500001], xpStep: 500000
  },
  acrobat: {
    // UA p.24-25: a thief who specializes after 5th level. Levels 1-5 use the thief table.
    label: "Thief-Acrobat (UA)", hitDie: 6, firstDice: 1, maxHD: 12, afterHP: null, matrix: "thief", save: "thief",
    fighterCon: false, nonProf: -3, thiefSkills: 0, acrobat: true, backstab: true,
    xp: [0, 1251, 2501, 5001, 10001, 20001, 45001, 75001, 125001, 180001, 250001, 500001], xpStep: 250000
  },
  custom: {
    label: "Other (set below)", hitDie: 8, firstDice: 1, maxHD: 9, afterHP: 0, matrix: "fighter", save: "fighter",
    fighterCon: false, nonProf: -2, xp: [0]
  }
};

/** Is the class this one, or a setting class built on it (def.as: "cleric", "druid", "magicuser" ...)? */
export function classIs(key, base) {
  return key === base || CLASSES[key]?.as === base;
}

/** Fighters', paladins', rangers' attacks per melee round (PHB p.25). */
export function fighterAttacksPerRound(classKey, level) {
  // PHB p.25; UA p.23 adds barbarians, cavaliers and the UA paladin
  const t = {
    fighter: [[6, "1/1"], [12, "3/2"], [Infinity, "2/1"]],
    paladin: [[6, "1/1"], [12, "3/2"], [Infinity, "2/1"]],
    ranger: [[7, "1/1"], [14, "3/2"], [Infinity, "2/1"]],
    barbarian: [[5, "1/1"], [10, "3/2"], [Infinity, "2/1"]],
    cavalier: [[5, "1/1"], [10, "3/2"], [15, "2/1"], [Infinity, "5/2"]],
    paladinUA: [[6, "1/1"], [12, "3/2"], [18, "2/1"], [Infinity, "5/2"]]
  }[classKey];
  if (!t) return null;
  return t.find(([max]) => level <= max)[1];
}

/** Monks ability table (PHB p.31): [effective AC, move ("), open hand attacks/round, open hand damage as printed]. */
export const MONK_TABLE = {
  1: [10, 15, "1", "1-3"], 2: [9, 16, "1", "1-4"], 3: [8, 17, "1", "1-6"], 4: [7, 18, "5/4", "1-6"],
  5: [7, 19, "5/4", "2-7"], 6: [6, 20, "3/2", "2-8"], 7: [5, 21, "3/2", "3-9"], 8: [4, 22, "3/2", "2-12"],
  9: [3, 23, "2", "3-12"], 10: [3, 24, "2", "3-13"], 11: [2, 25, "5/2", "4-13"], 12: [1, 26, "5/2", "4-16"],
  13: [0, 27, "5/2", "5-17"], 14: [-1, 28, "3", "5-20"], 15: [-1, 29, "3", "6-24"], 16: [-2, 30, "4", "5-30"],
  17: [-3, 32, "4", "8-32"]
};

/**
 * Convert a printed damage range ("2-7") to a dice formula. The books print
 * ranges, not dice, so this follows one fixed convention, in order:
 *   1-N            -> 1dN
 *   A-B, B = A*S   -> AdS          (2-8 -> 2d4, 3-18 -> 3d6)
 *   A-B            -> 1dS+(A-1)    (2-7 -> 1d6+1)
 *   A-B            -> NdS+M        (fewest dice that fit)
 * Only standard dice (d2 d3 d4 d6 d8 d10 d12 d20) are used. The range is
 * always reproduced exactly; the curve inside it is a convention, and the
 * formula is editable on every item.
 */
const STD_DICE = [4, 6, 8, 10, 12, 20, 3, 2];
export function rangeToFormula(range) {
  const m = String(range ?? "").trim().match(/^(\d+)\s*[-–]\s*(\d+)$/);
  if (!m) {
    const n = String(range ?? "").trim();
    return /^\d+$/.test(n) ? n : null;
  }
  const a = Number(m[1]), b = Number(m[2]);
  if (a === 1 && STD_DICE.includes(b)) return `1d${b}`;
  if (a > 1 && b % a === 0 && STD_DICE.includes(b / a)) return `${a}d${b / a}`;
  if (STD_DICE.includes(b - a + 1)) return `1d${b - a + 1}+${a - 1}`;
  for (let n = 2; n <= 8; n++) {
    for (const s of [4, 6, 8, 10, 12, 3, 2, 20]) {
      const mod = a - n;
      if (mod >= 0 && n * s + mod === b) return mod ? `${n}d${s}+${mod}` : `${n}d${s}`;
    }
  }
  return null;
}

/** Weapon proficiency (PHB p.37): initial count, non-proficiency penalty, added per N levels. */
export const WEAPON_PROFICIENCY = {
  cleric: [2, -3, 4], druid: [2, -4, 5], fighter: [4, -2, 3], paladin: [3, -2, 3], ranger: [3, -2, 3],
  magicuser: [1, -5, 6], illusionist: [1, -5, 6], thief: [2, -3, 4], assassin: [3, -2, 4], monk: [1, -3, 2]
};

/* ------------------------------------------------------------------ */
/*  MATRIX FOR CLERICS AFFECTING UNDEAD (DMG III, p.75)                */
/* ------------------------------------------------------------------ */
/* Columns are cleric levels 1, 2, 3, 4, 5, 6, 7, 8, 9-13, 14+.
 * Number = d20 score needed; "T" = automatic turn; "D" = destroyed/dispelled;
 * "D*" = destroyed, 7-12 affected instead of 1-12; null = no effect possible. */
export const TURN_UNDEAD = [
  { key: "skeleton", label: "Skeleton", v: [10, 7, 4, "T", "T", "D", "D", "D*", "D*", "D*"] },
  { key: "zombie", label: "Zombie", v: [13, 10, 7, "T", "T", "D", "D", "D", "D*", "D*"] },
  { key: "ghoul", label: "Ghoul", v: [16, 13, 10, 4, "T", "T", "D", "D", "D", "D*"] },
  { key: "shadow", label: "Shadow", v: [19, 16, 13, 7, 4, "T", "T", "D", "D", "D*"] },
  { key: "wight", label: "Wight", v: [20, 19, 16, 10, 7, 4, "T", "T", "D", "D"] },
  { key: "ghast", label: "Ghast", v: [null, 20, 19, 13, 10, 7, 4, "T", "T", "D"] },
  { key: "wraith", label: "Wraith", v: [null, null, 20, 16, 13, 10, 7, 4, "T", "D"] },
  { key: "mummy", label: "Mummy", v: [null, null, null, 20, 16, 13, 10, 7, 4, "T"] },
  { key: "spectre", label: "Spectre", v: [null, null, null, null, 20, 16, 13, 10, 7, "T"] },
  { key: "vampire", label: "Vampire", v: [null, null, null, null, null, 20, 16, 13, 10, 4] },
  { key: "ghost", label: "Ghost", v: [null, null, null, null, null, null, 20, 16, 13, 7] },
  { key: "lich", label: "Lich", v: [null, null, null, null, null, null, null, 19, 16, 10] },
  { key: "special", label: "Special (lower planes)", v: [null, null, null, null, null, null, null, 20, 19, 13] }
];
export function turnUndeadColumn(clericLevel) {
  if (clericLevel < 1) return null;
  if (clericLevel <= 8) return clericLevel - 1;
  if (clericLevel <= 13) return 8;
  return 9;
}

/* ------------------------------------------------------------------ */
/*  ARMOR (PHB p.36 ARMOR CLASS TABLE; DMG p.27 weights and movement)   */
/* ------------------------------------------------------------------ */
export const ARMOR_CLASS_TABLE = [
  { ac: 10, label: "None" },
  { ac: 9, label: "Shield only" },
  { ac: 8, label: "Leather or padded armor" },
  { ac: 7, label: "Leather or padded + shield / studded leather / ring mail" },
  { ac: 6, label: "Studded leather or ring mail + shield / scale mail" },
  { ac: 5, label: "Scale mail + shield / chain mail" },
  { ac: 4, label: "Chain mail + shield / splint mail / banded mail" },
  { ac: 3, label: "Splint or banded mail + shield / plate mail" },
  { ac: 2, label: "Plate mail + shield" }
];

/* ------------------------------------------------------------------ */
/*  MISC COMBAT                                                         */
/* ------------------------------------------------------------------ */
/** Missile range adjustments (DMG matrices, PHB p.38): medium -2, long -5. */
export const RANGE_PENALTY = { short: 0, medium: -2, long: -5 };

/** Situational to-hit adjustments printed in the PHB/DMG. */
export const SITUATIONAL = [
  { key: "rear", label: "Attack from rear / unseen (+2)", value: 2 },
  { key: "helpless", label: "Stunned, prone or motionless (+4)", value: 4 },
  { key: "invisible", label: "Attacker cannot see target (−4)", value: -4 }
];

/* ------------------------------------------------------------------ */
/*  BARDS (PHB Appendix II, Bards Table II)                            */
/* ------------------------------------------------------------------ */
/* level: [college, additional languages, charm %, legend lore & item knowledge %] */
export const BARD_TABLE = {
  1: ["Probationer", 0, 15, 0], 2: ["Fochlucan", 0, 20, 5], 3: ["Fochlucan", 0, 22, 7], 4: ["Fochlucan", 1, 24, 10],
  5: ["Mac-Fuirmidh", 0, 30, 13], 6: ["Mac-Fuirmidh", 1, 32, 16], 7: ["Mac-Fuirmidh", 1, 34, 20], 8: ["Doss", 0, 40, 25],
  9: ["Doss", 1, 42, 30], 10: ["Doss", 1, 44, 35], 11: ["Canaith", 0, 50, 50], 12: ["Canaith", 1, 53, 53],
  13: ["Canaith", 1, 56, 56], 14: ["Cli", 0, 60, 55], 15: ["Cli", 1, 63, 60], 16: ["Cli", 1, 66, 65],
  17: ["Anstruth", 0, 70, 70], 18: ["Anstruth", 1, 73, 75], 19: ["Anstruth", 1, 76, 80], 20: ["Ollamh", 1, 80, 85],
  21: ["Ollamh", 1, 84, 90], 22: ["Ollamh", 1, 88, 95], 23: ["Magna Alumnae", 1, 95, 99]
};

/* ------------------------------------------------------------------ */
/*  THIEF-ACROBAT (UA p.25)                                            */
/* ------------------------------------------------------------------ */
/* level: [tightrope %, pole vault ft, high jump ft, standing broad ft, running broad ft,
 *         tumbling attack %, evasion %, falling: [% no damage, distance ft]] */
export const ACROBAT_TABLE = {
  6: [75, 9, 4, 5, 9, 6, 10, [25, 10]], 7: [80, 9.5, 4.25, 5.5, 9.5, 7, 15, [50, 10]],
  8: [85, 10, 4.5, 6, 10, 8, 20, [75, 10]], 9: [90, 10.5, 4.75, 6.5, 10.5, 9, 25, [25, 20]],
  10: [95, 11, 5, 7, 11, 10, 30, [50, 20]], 11: [100, 11.5, 5.25, 7.5, 11.5, 11, 35, [75, 20]],
  12: [100, 12, 5.5, 8, 12, 12, 40, [25, 30]], 13: [100, 12.5, 5.75, 8.5, 13, 13, 45, [50, 30]],
  14: [100, 13, 6.25, 9, 14, 14, 50, [75, 30]], 15: [100, 13.5, 6.5, 9.5, 15, 15, 52, [20, 40]],
  16: [100, 14, 7, 10, 16, 16, 54, [40, 40]], 17: [100, 14.5, 7.5, 10.5, 17, 17, 56, [60, 40]],
  18: [100, 15, 8, 11, 18, 18, 58, [80, 40]], 19: [100, 15.5, 8.5, 11.5, 19, 19, 60, [20, 50]],
  20: [100, 16, 9, 12, 20, 20, 60, [40, 50]], 21: [100, 16.5, 9, 12, 21, 20, 60, [60, 50]],
  22: [100, 17, 9, 12, 22, 20, 60, [80, 50]], 23: [100, 17.5, 9, 12, 22, 20, 60, [20, 60]]
};
/* [tightrope %, pole vault, high jump, standing broad, running broad, attack %, evasion %, falling %] */
export const ACROBAT_RACE = {
  dwarf: [-5, -2, -1, -2, -3, 10, 5, 0], elf: [10, 0, 0, 0, -1, 0, 5, 5], gnome: [0, -2, -1, -1.5, -4, 5, 5, 0],
  "half-elf": [5, 0, 0, 0, 0, 5, 0, 0], halfling: [0, -2, -1, -1.5, -4, 5, 10, 5], "half-orc": [0, 0, 0, 0, 0, 0, 0, 10],
  human: [0, 0, 0, 0, 0, 0, 0, 0]
};
/* Strength (Table II): [high jump, standing broad, running broad] in feet */
export const ACROBAT_STR = { 16: [0, 0, 0.5], 17: [0.25, 0.25, 1], 18: [0.5, 0.5, 2] };
/* Dexterity (Table III): [tightrope %, pole vault ft, attack %, evasion %, falling distance ft] */
export const ACROBAT_DEX = { 16: [5, 0, 1, 2, 0], 17: [10, 1, 2, 3, 0], 18: [15, 2, 3, 5, 5], 19: [20, 3, 4, 8, 10] };

/* ------------------------------------------------------------------ */
/*  THIEVES TABLE II: effects of armor (UA p.72 errata version)        */
/* ------------------------------------------------------------------ */
/* [PP, OL, F/RT, MS, HS, HN, CW]; read languages is not affected */
export const THIEF_ARMOR = {
  none: { label: "No armor", v: [5, 0, 0, 10, 5, 0, 10] },
  leather: { label: "Leather", v: [0, 0, 0, 0, 0, 0, 0] },
  elfin: { label: "Elfin chain", v: [-20, -5, -5, -10, -10, -5, -20] },
  studded: { label: "Studded or padded", v: [-30, -10, -10, -20, -20, -10, -30] },
  chain: { label: "Ring or chain", v: [-40, -15, -15, -40, -30, -20, -40] },
  banded: { label: "Scale or banded", v: [-50, -20, -20, -60, -50, -30, -90] },
  platemail: { label: "Plate mail", v: [-75, -40, -40, -80, -75, -50, -99] },
  plate: { label: "Plate armor", v: [-100, -80, -80, -100, -110, -70, -99.9] }
};

/* ------------------------------------------------------------------ */
/*  BARBARIAN (UA p.19-21)                                             */
/* ------------------------------------------------------------------ */
/** Saving throw bonuses: +4 poison, +3 paralyzation/death/petrification/polymorph,
 *  +2 rod/staff/wand and breath, +1 vs. spell per four levels. */
export function barbarianSaveBonus(level) {
  return { ppd: 3, poison: 4, pp: 3, rsw: 2, bw: 2, sp: Math.floor(level / 4) };
}
/** Dexterity AC bonus: 2 per point over 14, or 1 per point in fairly bulky / bulky armor. */
export function barbarianDexAC(dex, bulkyArmor) {
  const over = Math.max(0, dex - 14);
  return -(bulkyArmor ? over : over * 2);
}
/** +2 hit points per point of constitution over 14, replacing the normal adjustment. */
export function barbarianConHP(con) { return Math.max(0, con - 14) * 2; }

/* ------------------------------------------------------------------ */
/*  CAVALIER weapons of choice (UA p.15)                               */
/* ------------------------------------------------------------------ */
/* Lance +1 at 1st, +2 at 7th, +3 at 13th; sword +1 at 3rd, +2 at 9th; horseman's weapon +1 at 5th, +2 at 11th.
 * UA: "At higher levels, the progression described above increases in a similar fashion." */
export function cavalierChoiceBonus(choice, level) {
  const start = { lance: 1, sword: 3, horseman: 5 }[choice];
  if (!start || level < start) return 0;
  return Math.floor((level - start) / 6) + 1;
}

/* ------------------------------------------------------------------ */
/*  WEAPON SPECIALIZATION (UA p.18-19)                                 */
/* ------------------------------------------------------------------ */
export const SPECIALIST_ATTACKS = {
  melee: ["3/2", "2/1", "5/2"], bow: ["2/1", "3/1", "4/1"], lightXbow: ["1/1", "3/2", "2/1"],
  heavyXbow: ["1/2", "1/1", "3/2"], lassoSling: ["1/1", "3/2", "2/1"], dagger: ["3/1", "4/1", "5/1"],
  dart: ["4/1", "5/1", "6/1"], other: ["3/2", "2/1", "5/2"]
};
export function specialistAttacks(kind, level) {
  const i = level <= 6 ? 0 : level <= 12 ? 1 : 2;
  return SPECIALIST_ATTACKS[kind]?.[i] ?? null;
}

/* ------------------------------------------------------------------ */
/*  PSIONICS (PHB Appendix I; DMG p.76-78)                            */
/* ------------------------------------------------------------------ */
export const PSI_ATTACK_MODES = {
  A: { label: "Psionic Blast", cost: 20, range: [2, 4, 6] },
  B: { label: "Mind Thrust", cost: 4, range: [3, 6, 9] },
  C: { label: "Ego Whip", cost: 7, range: [4, 8, 12] },
  D: { label: "Id Insinuation", cost: 10, range: [6, 12, 18] },
  E: { label: "Psychic Crush", cost: 14, range: [5, null, null] }
};
export const PSI_DEFENSE_MODES = {
  F: { label: "Mind Blank", cost: 1 }, G: { label: "Thought Shield", cost: 2 }, H: { label: "Mental Barrier", cost: 3 },
  I: { label: "Intellect Fortress", cost: 8 }, J: { label: "Tower of Iron Will", cost: 10 }
};
/** Number of attack modes, defense modes and disciplines from percentile rolls (PHB p.110-111). */
export const PSI_ATTACK_COUNT = [[25, 1], [50, 2], [75, 3], [95, 4], [100, 5]];
export const PSI_DEFENSE_COUNT = [[25, 2], [75, 3], [90, 4], [100, 5]];
export const PSI_DISCIPLINE_COUNT = [[10, 1, 0], [25, 2, 0], [40, 3, 0], [55, 2, 1], [70, 3, 1], [80, 4, 1], [90, 3, 2], [95, 5, 1], [100, 4, 2]];

/** Psionic potential bonus: +2½ per point of int over 16, +1½ wis, +½ cha, fractions dropped. */
export function psionicPotentialBonus(int, wis, cha) {
  return Math.floor(Math.max(0, int - 16) * 2.5 + Math.max(0, wis - 16) * 1.5 + Math.max(0, cha - 16) * 0.5);
}
/** Psionic strength bonus: 1 per point over 12 in int, wis and cha; doubled if two are over 16, quadrupled if all three. */
export function psionicStrengthBonus(int, wis, cha) {
  const pts = [int, wis, cha].reduce((t, v) => t + Math.max(0, v - 12), 0);
  const high = [int, wis, cha].filter(v => v > 16).length;
  return pts * (high === 3 ? 4 : high === 2 ? 2 : 1);
}

/* IV.A: attack mode vs. defense mode by attacker's total psionic strength band.
 * Values are defense points lost; for Psychic Crush, % chance of instant death (null = no chance). */
export const PSI_BANDS = [25, 50, 75, 100, 125, Infinity];
export const PSI_VS_PSI = {
  A: [[3, 7, 4, 1, 0], [6, 9, 6, 2, 0], [10, 12, 9, 4, 1], [15, 16, 13, 7, 2], [21, 21, 18, 11, 4], [28, 27, 24, 16, 7]],
  B: [[12, 4, 0, 0, 1], [15, 6, 1, 0, 2], [18, 9, 2, 2, 3], [22, 13, 5, 4, 5], [26, 18, 9, 7, 8], [30, 24, 16, 11, 12]],
  C: [[8, 3, 0, 0, 0], [12, 4, 0, 0, 0], [17, 6, 1, 1, 1], [23, 9, 3, 2, 3], [30, 13, 6, 4, 6], [38, 18, 10, 7, 10]],
  D: [[1, 6, 8, 1, 1], [2, 8, 10, 3, 3], [4, 11, 13, 7, 6], [7, 15, 17, 12, 10], [11, 20, 22, 18, 15], [16, 26, 28, 25, 21]],
  E: [[2, null, null, null, null], [5, 2, 1, null, null], [9, 4, 2, 1, null], [14, 7, 5, 3, 2], [20, 11, 9, 6, 4], [27, 16, 14, 10, 7]]
};
/* IV.B: attack upon a defenseless psionic. Rows by attacker's current attack strength band, columns by the
 * defender's psionic strength total: 10-59, 60-109, 110-159, 160-209, 210-259, 260-309, 310+.
 * Numbers = defender's attack points lost; letters = effects; Psychic Crush = % chance of death. */
export const PSI_DEFENSELESS_COLS = [59, 109, 159, 209, 259, 309, Infinity];
export const PSI_DEFENSELESS = {
  A: [["D", "C", "C", 15, 10, 5, 5], ["S", "D", "C", "C", 15, 10, 5], ["W", "S", "D", "C", "C", 15, 10], ["P", "W", "S", "D", "C", "C", 15], ["K", "P", "W", "S", "D", "C", "C"], ["K", "K", "P", "W", "S", "D", "C"]],
  B: [["W", "W", 40, 35, 30, 25, 20], ["W", "W", "W", 40, 35, 30, 25], ["P", "W", "W", "W", 40, 35, 30], ["P", "P", "W", "W", "W", 40, 35], ["P", "P", "P", "W", "W", "W", 40], ["P", "P", "P", "P", "W", "W", "W"]],
  C: [[30, 25, 20, 15, 10, 5, 5], [35, 30, 25, 20, 15, 10, 5], [40, 35, 30, 25, 20, 15, 10], ["P", 40, 35, 30, 25, 20, 15], ["I", "P", 40, 35, 30, 25, 20], ["I", "I", "P", 40, 35, 30, 25]],
  D: [[40, 35, 30, 25, 20, 15, 10], ["R", 40, 35, 30, 25, 20, 15], ["R", "R", 40, 35, 30, 25, 20], ["R", "R", "R", 40, 35, 30, 25], ["R", "R", "R", "R", 40, 35, 30], ["R", "R", "R", "R", "R", 40, 35]],
  E: [[72, 60, 50, 40, 30, 20, 10], [75, 62, 52, 42, 32, 22, 12], [79, 65, 55, 45, 35, 25, 15], [84, 69, 59, 49, 39, 29, 19], [90, 74, 64, 54, 44, 34, 24], [97, 80, 70, 60, 50, 40, 30]]
};
export const PSI_LETTERS = {
  C: "Confused for 2-8 rounds, no psionic activity possible",
  D: "Dazed for 1-4 turns, no psionic or other activity",
  I: "Idiocy: psionic ability lost forever (idiocy curable by a heal spell)",
  K: "Killed: raising or resurrection possible, but psionic ability is lost",
  P: "Permanent loss of one attack or defense mode or discipline, and dazed for 1-4 turns",
  S: "Sleep: coma for 1-4 weeks (99% likely to be mistaken for death)",
  R: "Robot: mind controlled by the victor until released, or until 2-8 weeks pass and a save vs. magic is made",
  W: "Wounded psionically: one attack or defense mode or discipline unusable for 2-8 weeks"
};
/* IV.C: psionic blast upon a non-psionic. Save by total intelligence + wisdom; [short, medium, long]. */
export const PSI_BLAST_SAVE = [[5, 20, 19, 18], [9, 18, 17, 16], [13, 16, 15, 14], [17, 14, 13, 12], [21, 12, 11, 10],
  [25, 10, 9, 8], [29, 8, 7, 6], [33, 6, 5, 4], [35, 4, 3, 2], [37, 2, 1, 0], [Infinity, 0, -1, -2]];
export const PSI_BLAST_ADJ = [
  ["Magic-user", 1], ["Cleric", 2], ["Elf", 2], ["Intellect Fortress within 10'", 2], ["Mind blank spell", 2], ["Dwarf", 4],
  ["Halfling", 4], ["Helm of telepathy", 4], ["Tower of Iron Will within 3'", 6], ["Mind bar", 6],
  ["Panicked", -1], ["Enraged", -1], ["Confused", -2], ["Hopeless", -3], ["Stunned", -3],
  ["Using a psionic-related power or spell", -4], ["Using an ESP device", -5]
];
const BLAST_OUTCOMES = ["Death", "Coma", "Sleep", "Stun", "Confuse", "Enrage", "Panic", "Feeblemind", "Permanent insanity", "Temporary insanity", "Mild insanity"];
/* For each int+wis row: [first outcome index, upper bounds of each successive outcome on d100] */
export const PSI_BLAST_RESULTS = [
  [5, 0, [85, 99, 100]], [9, 0, [10, 90, 99, 100]], [13, 0, [1, 15, 90, 99, 100]], [17, 1, [1, 10, 90, 99, 100]],
  [21, 2, [1, 15, 90, 99, 100]], [25, 3, [1, 15, 90, 99, 100]], [29, 4, [1, 15, 90, 99, 100]], [33, 5, [1, 15, 90, 99, 100]],
  [35, 6, [1, 20, 85, 99, 100]], [37, 7, [1, 15, 90, 100]], [Infinity, 8, [1, 15, 100]]
];
export const PSI_BLAST_EFFECTS = {
  Death: "Can be brought back to life as is usual.",
  Coma: "2-12 days; cannot be awakened.",
  Sleep: "5-20 turns; cannot be awakened.",
  Stun: "2-8 turns, stunned.",
  Confuse: "1-4 turns, as the spell.",
  Enrage: "2-8 rounds; must immediately attack any creature, no thought of defense.",
  Panic: "2-8 rounds, as a fear spell from a 4th level magic-user.",
  Feeblemind: "Until heal, restoration or wish; intelligence and wisdom total 0-5, no spells, cannot attack or defend.",
  "Permanent insanity": "Until heal, restoration or wish; two forms of insanity.",
  "Temporary insanity": "2-12 weeks; two forms of insanity.",
  "Mild insanity": "1-4 weeks; one form of insanity."
};
export function psiBlastResult(intWis, roll) {
  const row = PSI_BLAST_RESULTS.find(r => intWis <= r[0]);
  const i = row[2].findIndex(max => roll <= max);
  return BLAST_OUTCOMES[row[1] + i];
}
export function psiBand(strength) { return PSI_BANDS.findIndex(b => strength <= b); }
export function psiDefenselessCol(total) { return PSI_DEFENSELESS_COLS.findIndex(b => total <= b); }
/** Psionic strength recovery per hour by activity (PHB p.116); the least favorable activity in the hour applies. */
export const PSI_RECOVERY = { exertion: ["Hard exertion", 0], walking: ["Walking and like activity", 3], sitting: ["Sitting and talking or reading", 6], resting: ["Resting and meditating", 12], sleeping: ["Sleeping", 24] };
/** Body weaponry (PHB p.111): level of mastery -> [cleric AC, fighter AC, thief AC, weapon equivalent]. */
export const BODY_WEAPONRY = {
  1: [9, 9, 9, "club"], 2: [8, 8, 8, "dagger"], 3: [7, 7, 7, "axe, hand"], 4: [6, 6, 7, "mace"], 5: [5, 5, 6, "axe, battle"],
  6: [4, 4, 5, "morning star"], 7: [3, 3, 5, "sword, broad"], 8: [3, 2, 4, "sword, long"], 9: [2, 1, 4, "sword, long +1"],
  10: [2, 1, 3, "sword, long +2"], 11: [1, 0, 3, "sword, long +3"], 12: [1, 0, 2, "sword, long +4"]
};

/* ------------------------------------------------------------------ */
/*  PROFICIENCY SLOTS (DSG Table 10 = WSG Table 1)                      */
/* ------------------------------------------------------------------ */
/* [initial weapon, initial nonweapon, weapon added, nonweapon added, every N levels].
 * "First level is included when counting levels" (WSG p.12): new slots come at levels N+1, 2N+1, ...
 * Bard: "As other classes" initially, then 1/1 per 4 bard levels. */
export const PROFICIENCY_SLOTS = {
  cavalier: [3, 2, 1, 1, 2], paladin: [3, 2, 1, 1, 2], cleric: [2, 3, 1, 1, 4], druid: [2, 3, 1, 1, 5],
  fighter: [4, 2, 1, 1, 3], barbarian: [6, 3, 1, 1, 2], ranger: [3, 2, 1, 1, 3], magicuser: [1, 3, 1, 2, 6],
  illusionist: [1, 3, 1, 2, 6], thief: [2, 3, 1, 1, 4], acrobat: [2, 3, 1, 1, 4], assassin: [3, 2, 1, 1, 4],
  monk: [1, 1, 1, 1, 2], bard: [null, null, 1, 1, 4]
};

/**
 * Weapon and nonweapon slots for a character's classes: [{key, level}].
 * Multi-class characters use the class giving the most slots of each kind (the books do not say).
 */
export function proficiencySlots(classes) {
  const per = [], unknown = [];
  for (const c of classes) {
    const t = PROFICIENCY_SLOTS[c.key];
    if (!t) { unknown.push(c.key); continue; }
    const steps = Math.floor(Math.max(0, c.level - 1) / t[4]);
    per.push({ key: c.key, level: c.level, weapon: (t[0] ?? 0) + steps * t[2], nonweapon: (t[1] ?? 0) + steps * t[3], bard: t[0] === null });
  }
  const others = per.filter(p => !p.bard);
  let weapon = others.length ? Math.max(...others.map(p => p.weapon)) : 0;
  let nonweapon = others.length ? Math.max(...others.map(p => p.nonweapon)) : 0;
  for (const b of per.filter(p => p.bard)) { weapon += b.weapon; nonweapon += b.nonweapon; }
  return { weapon, nonweapon, per, unknown };
}

/** Weapon slots a proficiency costs (UA p.18): specialization 2, 3 for a bow other than a crossbow; double +1. */
export function weaponProfCost(w) {
  if (!w.spec) return 1;
  return 2 + (w.bow ? 1 : 0) + (w.spec === "double" ? 1 : 0);
}

/* ------------------------------------------------------------------ */
/*  LOYALTY OF HENCHMEN & HIRELINGS (DMG p.36-37)                      */
/* ------------------------------------------------------------------ */
/* Each group: [key, label, choices [[key, label, modifier]]]. The first choice is the default. */
export const LOYALTY_BASE = 50;   // "NORMAL LOYALTY BASE: 50%, +/- charisma adjustment"
export const LOYALTY_GROUPS = [
  ["enlist", "Enlistment or association", [["mercenary", "hired mercenary", 0], ["henchman", "henchman", 5], ["mercenaryShort", "hired mercenary, short term", -5],
    ["associated", "associated non-player character", -10], ["captured", "captured and enlisted", -15], ["slave", "slave", -30]]],
  ["length", "Length of enlistment or association", [["year", "less than 1 year", 0], ["month", "less than 1 month", -5], ["years5", "1 to 5 years", 10], ["more5", "more than 5 years", 25]]],
  ["training", "Training or status level", [["none", "(not set)", 0], ["peasant", "untrained or peasant", -25], ["levied", "little training, levied troops", -15],
    ["recruits", "newly recruited regulars", -5], ["regulars", "trained regulars", 10], ["elite", "elite, sub-officers, minor officials/expert hireling", 20],
    ["officers", "guards, officers, or major officials/henchmen", 30]]],
  ["pay", "Pay or treasure shared", [["average", "average", 0], ["none", "none", -20], ["partial", "partial, late, or unfair", -10], ["above", "above average, choice shares", 5],
    ["exceptional", "exceptional, bonuses, gift items", 10]]],
  ["discipline", "Discipline/activity", [["harsh", "firm and harsh/occasional", 0], ["none", "none/one (as printed)", -10], ["lax", "lax/little", -5], ["fair", "firm and fair/often", 10]]],
  ["treatment", "General treatment by liege", [["unset", "(not set)", 0], ["inhuman", "inhuman and heartless", -25], ["cruel", "cruel and domineering", -10],
    ["indifferent", "indifferent and uncaring or variable", -5], ["just", "just and invariable", 10], ["kind", "just, kind, and invariable", 15]]],
  ["race", "Racial preference for liege", [["neutral", "neutral", 0], ["antipathy", "antipathy", -5], ["goodwill", "good will", 10], ["hatred", "hatred", -20],
    ["preferred", "preferred", 20], ["tolerance", "tolerance", 0]]],
  ["raceGroup", "Racial preference for associated group (most liked or disliked)", [["neutral", "neutral", 0], ["antipathy", "antipathy", -10], ["goodwill", "good will", 5],
    ["hatred", "hatred", -15], ["preferred", "preferred", 15], ["tolerance", "tolerance", -5]]],
  ["alignLiege", "Alignment is ... from liege", [["same", "same or 1 place removed", 0], ["two", "2 places removed", -15], ["three", "3 places removed", -35]]],
  ["alignGroup", "Alignment is ... from associated group", [["same", "same or 1 place removed", 0], ["two", "2 places removed", -5], ["three", "3 places removed", -20]]],
  ["penalty", "Special consideration: one penalty (the largest)", [["none", "none", 0], ["killed", "killed faithful henchman or hireling in front of witness(es)", -40],
    ["tortured", "tortured faithful henchman or hireling in front of witness(es)", -30], ["reputed", "reputed to have slain faithful henchmen or hirelings or left them to die", -20],
    ["oathbreaker", "foresworn or oath breaker or deserter", -15], ["rumored", "rumored to have tortured faithful henchmen or hirelings", -10],
    ["discharged", "discharged faithful henchmen or hirelings without cause", -5]]],
  ["bonus", "Special consideration: one bonus (the largest)", [["none", "none", 0], ["gift", "choice gift or bonus within 2 months (hireling) or 3 months (henchman)", 5],
    ["risked", "risked life for within 6 months (hireling) or 1 year (henchman)", 10], ["ransomed", "ransomed or rescued within one year", 15],
    ["saved", "saved life directly or personally", 25], ["magic", "uses and diminishes own magic to benefit the NPC (spells, especially cures)", 25],
    ["raised", "returned from a death-like state, raised or resurrected", 50]]]
];
/** Alignment of liege (DMG p.36). Keys are the alignment written out in lower case. */
export const LOYALTY_LIEGE_ALIGNMENT = { "lawful good": 15, "lawful neutral": 10, "lawful evil": 5, "neutral good": 0, "neutral": 0, "true neutral": 0,
  "chaotic good": -5, "chaotic neutral": -10, "neutral evil": -15, "chaotic evil": -20 };
/** DMG p.36: Loyalty of henchmen and allied creatures. */
export function loyaltyBand(score) {
  if (score < 1) return ["None", "will attempt to kill, capture, harm, or desert at first possible opportunity"];
  if (score <= 25) return ["Disloyal", "will always seek own advantage regardless of circumstances"];
  if (score <= 50) return ["Little", "will seek own advantage at first sign of weakness"];
  if (score <= 75) return ["Fair", "will support cause if no great risk is involved"];
  if (score <= 100) return ["Loyal", "will always attempt to further the ends of the liege, even at great risk"];
  return ["Fanatical", "will serve unquestioningly and lay down own life if necessary without hesitation"];
}
/** DMG p.36: typical loyalty, obedience and morale check situations, with the result of failure. */
export const LOYALTY_SITUATIONS = [["offered bribe", "co-operates"], ["ordered to testify against liege", "agrees"], ["has a chance to steal goods", "steals"],
  ["left alone in possible danger", "deserts"], ["abandoned", "deserts"], ["ordered into possible danger", "refuses"], ["ordered to perform heroic act", "refuses"],
  ["ordered to perform heroic and dangerous act", "refuses"], ["ordered to rescue party member(s)", "refuses"], ["ordered to rescue liege", "refuses"],
  ["in combat with possibly dangerous foe", "runs away"], ["liege incapacitated or slain", "runs away"], ["offered surrender terms", "surrenders"],
  ["surrounded by superior foe", "surrenders"], ["ordered to use up or diminish own magic item", "refuses"]];
