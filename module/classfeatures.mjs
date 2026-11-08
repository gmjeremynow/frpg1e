/**
 * Class abilities for the Record tab boxes and their rolls: paladin, ranger, druid, monk, assassin,
 * magic-user and illusionist. Text and numbers from the PHB (pp.20-32), DMG p.75 (assassinations)
 * and UA (paladin p.17, druid pp.17-18, ranger pp.21-22).
 */

/* ---------- Paladin (PHB p.22-24) ---------- */
export function paladinInfo(level) {
  return {
    layOnHands: 2 * level,
    cureDisease: Math.ceil(level / 5),          // levels 1-5 one per week, 6-10 two, 11-15 three ...
    turnAs: level >= 3 ? level - 2 : 0,
    warhorse: level >= 4,
    spells: level >= 9
  };
}

/* ---------- Ranger (PHB p.24-25; UA p.21-22) ---------- */
/** UA p.21: 10% per level plus 10%, at most 110% before modifiers. */
export const rangerTrackBase = level => Math.min(110, 10 * level + 10);
export const GIANT_CLASS = ["bugbear", "cyclopskin", "dune stalker", "ettin", "flind", "giant", "gibberling", "gnoll", "goblin", "grimlock",
  "hobgoblin", "kobold", "meazel", "norker", "ogre", "ogre mage", "ogrillon", "orc", "quaggoth", "tasloi", "troll", "xvart"];
// UA p.22, cumulative
const TRACK_ID = [
  [1, "common woodland creatures' tracks and direction of travel"],
  [2, "common woodland creatures' number and pace"],
  [3, "common woodland creatures' time of passage (outdoors only)"],
  [4, "as 3rd level for uncommon woodland creatures"],
  [5, "as 3rd level for rare woodland creatures"],
  [6, "as 3rd level for very rare woodland creatures"],
  [7, "as 3rd level for all creatures, woodland or not, within a 100-mile radius"],
  [8, "the general size and weight of humans"],
  [9, "the size and number of mounted creatures (e.g. a horse carrying more than one rider)"],
  [10, "as 9th level for all creatures ever observed"]
];
export const trackIdentification = level => TRACK_ID.filter(([l]) => level >= l).map(([, t]) => t);
// UA p.21-22 modifiers
export const TRACK_TERRAIN = [
  { value: 20, label: "Soft enough to hold impressions (+20%)" },
  { value: 10, label: "Occasional marks or obvious signs (+10%)" },
  { value: 0, label: "Only infrequent signs: rock, water, wind, overtracking (0%)" },
  { value: -50, label: "Prevents all but the minutest traces (−50%)" }
];
export const TRACK_SURFACE = [
  { value: 20, label: "Dirt floor, or unused and dusty area (+20%)" },
  { value: 0, label: "Wooden floor, or occasional indication of passage (0%)" },
  { value: -50, label: "Stone floor, all but the minutest traces prevented (−50%)" }
];
/**
 * Tracking chance. UA: "If intelligent efforts are made to hide the trail" the terrain (surface)
 * category drops one step; from the −50% category, tracking is impossible. An adjusted chance over 100% is 100%.
 */
export function trackChance({ base, indoor = false, terrain = 0, hidden = false, creatures = 1, hours = 0, rainHours = 0, overtracked = false }) {
  const cats = (indoor ? TRACK_SURFACE : TRACK_TERRAIN).map(c => c.value);
  let t = terrain;
  if (hidden) {
    if (t === -50) return { chance: 0, impossible: true, mods: [] };
    t = cats[cats.indexOf(t) + 1];
  }
  const mods = [{ label: indoor ? "Surface" : "Terrain", value: t }];
  if (creatures > 1) mods.push({ label: `${creatures - 1} more creature${creatures > 2 ? "s" : ""}`, value: 2 * (creatures - 1) });
  if (!indoor && hours >= 12) mods.push({ label: `${hours} hours since the trail was made`, value: -5 * Math.floor(hours / 12) });
  if (!indoor && rainHours > 0) mods.push({ label: `${rainHours} hours of precipitation`, value: -25 * rainHours });
  if (indoor && overtracked) mods.push({ label: "Other creatures cross or overtrack", value: -50 });
  const raw = base + mods.reduce((a, m) => a + m.value, 0);
  return { chance: Math.max(0, Math.min(100, raw)), raw, mods, impossible: false };
}
/** UA p.21 movement while tracking: obvious 71%+, occasional 31-70%, faint 30% or less. */
export function trackingMove(chance, poorLight) {
  if (chance >= 71) return poorLight ? "2/3" : "3/4";
  if (chance >= 31) return poorLight ? "1/2" : "2/3";
  return poorLight ? "1/4" : "1/2";
}

/* ---------- Druid (PHB p.21; UA p.17-18) ---------- */
export function druidPowers(level) {
  const out = [];
  if (level >= 3) out.push("Identify plant type, animal type and pure water; pass through overgrown areas without a trail at normal movement (PHB p.21).");
  if (level >= 7) out.push("Immune to charm spells cast by woodland creatures (dryads, nixies, sylphs, etc.) (PHB p.21).",
    "Change form up to 3 times a day into a reptile, bird or mammal, each type once a day, from bullfrog, bluejay or bat size to large snake, eagle or black bear (about double the druid's weight). Each change heals 10-60% (d6 × 10) of damage taken (PHB p.21).");
  if (level >= 16) out.push("Immune to natural poisons (not mineral poisons or poison gas); +1 decade of life per level; vigorous health; alter appearance at will in 1 segment (UA p.18).");
  if (level >= 17) out.push("Hibernate (suspended animation); enter the Elemental Plane of Earth at will; conjure water elemental once a day (UA p.18).");
  if (level >= 18) out.push("Enter the Elemental Plane of Fire; conjure air elemental once a day (UA p.18).");
  if (level >= 19) out.push("Enter the Elemental Plane of Water; conjure magma/smoke para-elemental once a day (UA p.18).");
  if (level >= 20) out.push("Enter the Elemental Plane of Air; conjure ice/ooze para-elemental once a day (UA p.18).");
  if (level >= 21) out.push("Enter the Para-Elemental Planes (UA p.18).");
  if (level >= 22) out.push("Enter the Plane of Shadow (UA p.18).");
  if (level >= 23) out.push("Enter any Inner Plane, roam the Inner Plane Probability Lines, dwell on the Plane of Concordant Opposition (UA p.18).");
  if (level >= 16) out.push(`Conjuring: ${level}% chance to choose the creature type; otherwise roll on the UA p.18 table. Conjured individuals gain +${level} hp (UA p.18).`);
  return out;
}
/** PHB p.21: one language of choice at 3rd level and each level thereafter. */
export const druidLanguages = level => Math.max(0, level - 2);

/* ---------- Monk (PHB p.30-32) ---------- */
/** Chance of being surprised: 33⅓% at 1st, 32% at 2nd, then 2% less per level. */
export const monkSurprised = level => (level <= 1 ? "33⅓%" : `${Math.max(0, 36 - 2 * level)}%`);
export function monkFall(level) {
  if (level >= 13) return "any distance within 8’ of a wall";
  if (level >= 6) return "up to 30’ within 4’ of a wall";
  if (level >= 4) return "up to 20’ within 1’ of a wall";
  return "";
}
export function monkSpecials(level) {
  const out = [];
  if (level >= 3) out.push("A: speak with animals as druids do.");
  if (level >= 4) out.push(`B: mind masked; ESP has only a ${Math.max(0, 30 - 2 * (level - 4))}% chance of success.`);
  if (level >= 5) out.push("C: immune to disease of any sort and to haste and slow spells.");
  if (level >= 6) out.push(`D: self-induced catalepsy (appear dead) for up to ${2 * level} turns.`);
  if (level >= 7) out.push(`E: heal own wounds once a day: d4+${1 + (level - 7)} hp (${2 + level - 7}-${5 + level - 7}).`);
  if (level >= 8) out.push("F: speak with plants as druids do.");
  if (level >= 9) out.push(`G: beguiling, charm, hypnosis and suggestion spells have only a ${Math.max(0, 50 - 5 * (level - 9))}% chance to affect the monk (saves still apply).`);
  if (level >= 10) out.push("H: telepathic and mind blast attacks are made as if the monk had 18 intelligence.");
  if (level >= 11) out.push("I: not affected by poison of any type.");
  if (level >= 12) out.push("J: geas and quest have no effect.");
  if (level >= 13) out.push(`K: quivering palm once a week (touch within 3 rounds or lost for a week). No effect on undead or creatures hit only by magic weapons; victim's hit dice no more than the monk's and hit points no more than 200% over the monk's; death on command within ${level} days.`);
  return out;
}
/** Monk weapon damage bonus: +½ hp per level. */
export const monkWeaponBonus = level => level / 2;

/* ---------- Assassin (PHB p.28-30; DMG p.75) ---------- */
const ASSASSINATION = {   // DMG I.D.2: victim level columns 0-1, 2-3, 4-5, 6-7, 8-9, 10-11, 12-13, 14-15, 16-17, 18+
  1: [50, 45, 35, 25, 10, 1, 0, 0, 0, 0], 2: [55, 50, 40, 30, 15, 2, 0, 0, 0, 0], 3: [60, 55, 45, 35, 20, 5, 0, 0, 0, 0],
  4: [65, 60, 50, 40, 25, 10, 1, 0, 0, 0], 5: [70, 65, 55, 45, 30, 15, 5, 0, 0, 0], 6: [75, 70, 60, 50, 35, 20, 10, 1, 0, 0],
  7: [80, 75, 65, 55, 40, 25, 15, 5, 0, 0], 8: [85, 80, 70, 60, 45, 30, 20, 10, 2, 0], 9: [95, 90, 80, 70, 55, 40, 30, 20, 5, 0],
  10: [99, 95, 85, 75, 60, 45, 35, 25, 10, 1], 11: [100, 99, 90, 80, 65, 50, 40, 30, 15, 5], 12: [100, 100, 95, 85, 70, 55, 45, 35, 20, 10],
  13: [100, 100, 99, 95, 80, 65, 50, 40, 25, 15], 14: [100, 100, 100, 99, 90, 75, 60, 50, 35, 25], 15: [100, 100, 100, 100, 99, 85, 70, 60, 40, 30]
};
export function assassinationChance(assassinLevel, victimLevel) {
  const row = ASSASSINATION[Math.max(1, Math.min(15, assassinLevel))];
  return row[Math.min(9, Math.floor(Math.max(0, victimLevel) / 2))];
}
/** PHB p.29: one alignment tongue per level from 9th, intelligence 15+, at most one per point over 14 (four at 18). */
export function assassinLanguages(level, int) {
  if (level < 9 || int < 15) return 0;
  return Math.min(level - 8, int - 14, 4);
}
/**
 * PHB p.29 disguise: base 2% per day of being spotted; +2% each for posing as another class, race, or
 * the opposite sex (at most 8%); −1% per point of the observer's combined intelligence and wisdom below 24,
 * +1% per point above 30.
 */
export function disguiseChance({ otherClass = false, otherRace = false, otherSex = false, intWis = 24 }) {
  let c = Math.min(8, 2 + 2 * (otherClass + otherRace + otherSex));
  if (intWis < 24) c -= 24 - intWis;
  if (intWis > 30) c += intWis - 30;
  return Math.max(0, c);
}

/* ---------- Magic-user and illusionist ---------- */
export const MU_NOTES = {
  magicuser: [[7, "Can scribe magic scrolls and concoct potions (Enchanter, PHB p.25 as corrected by the errata in The Dragon #35)."],
    [12, "Can attempt to enchant items (Wizard, PHB p.25 as corrected by the errata in The Dragon #35)."],
    [12, "Can build a stronghold and clear a 10 or 20 mile radius; revenue 5 sp per inhabitant per month (PHB p.25)."]],
  illusionist: [[10, "Can make magic items that create or sustain illusion (PHB p.26)."]]
};
export const ILLUSIONIST_ITEMS = "Magic items usable (PHB p.26): potions not restricted to fighters; illusionist scrolls, and magic-user scrolls with spells usable by illusionists; all rings; rod of cancellation, staff of striking, and wands of enemy detection, fear, illusion, magic detection, metal & mineral detection, secret door & trap detection, and wonder; miscellaneous items usable by every class, crystal balls (no added powers), all robes except the robe of the archmagi, and books readable by magic-users; artifacts not of a proscribed type.";
