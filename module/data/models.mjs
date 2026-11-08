/**
 * TypeDataModels for every Actor and Item type (Foundry V14 requires
 * TypeDataModels; the legacy template.json is deprecated).
 */
import { CLASSES, BARD_TABLE, ACROBAT_TABLE, ACROBAT_RACE, ACROBAT_STR, ACROBAT_DEX, THIEF_ARMOR,
  barbarianSaveBonus, barbarianDexAC, barbarianConHP, PSI_ATTACK_MODES, PSI_DEFENSE_MODES, proficiencySlots,
  LOYALTY_BASE, LOYALTY_GROUPS, LOYALTY_LIEGE_ALIGNMENT, loyaltyBand, charismaTable } from "../tables.mjs";
import * as R from "../rules.mjs";
import { RACE_OPTIONS, baseRace } from "../races.mjs";

const f = foundry.data.fields;
const int = (initial = 0, opts = {}) => new f.NumberField({ required: true, integer: true, initial, ...opts });
const num = (initial = 0, opts = {}) => new f.NumberField({ required: true, initial, ...opts });
const str = (initial = "", opts = {}) => new f.StringField({ required: true, blank: true, initial, ...opts });
const html = () => new f.HTMLField({ required: true, blank: true, initial: "" });
const bool = (initial = false) => new f.BooleanField({ required: true, initial });
const ability = () => new f.SchemaField({ value: int(10, { min: 1, max: 25 }) });

/**
 * Dice rolls printed in a spell or magic item description. kind: dmg, heal, dur, num, other, table.
 * formula may use @L (caster level) and @X (a number asked for, e.g. spell levels in a staff).
 * choices: the player picks one formula (e.g. by size); table: a roll looked up in rows.
 * fn: the item function the roll belongs to (blank = every use); charges: what that function costs.
 */
const rowsField = () => new f.ArrayField(new f.SchemaField({ lo: int(1), hi: int(1), text: str(""), formula: str(""), kind: str("") }));
export const rollsField = () => new f.ArrayField(new f.SchemaField({
  label: str(""),
  kind: str("dmg", { choices: ["dmg", "heal", "dur", "num", "other", "table"] }),
  formula: str(""),
  save: str("", { choices: ["", "half", "neg"] }),
  each: str(""),
  choices: new f.ArrayField(new f.SchemaField({ label: str(""), formula: str(""), rows: rowsField() })),
  table: new f.SchemaField({ formula: str(""), rows: rowsField() }),
  fn: str(""),
  charges: int(0, { min: 0 }),
  note: str(""),
  mode: str("", { choices: ["", "allBut", "temp"] }),
  x: str("")
}));

/** Psionics, shared by characters and monsters (PHB Appendix I). */
export const psionicsField = () => new f.SchemaField({
  has: bool(false),
  strength: int(0, { min: 0 }),      // psionic strength; psionic ability = 2 x strength
  attack: int(0, { min: 0 }),        // current attack points (maximum = strength)
  defense: int(0, { min: 0 }),       // current defense points (maximum = strength)
  modes: new f.SchemaField(Object.fromEntries(Object.keys(PSI_ATTACK_MODES).map(k => [k, bool(false)]))),
  defenses: new f.SchemaField(Object.fromEntries(Object.keys(PSI_DEFENSE_MODES).map(k => [k, bool(k === "F")]))),
  mindBar: bool(false)
});

/** UA Thieves Table II / Thief-Acrobat Table V adjustments for the armor worn. */
const ACROBAT_ARMOR = {
  none: [5, 1, 1, 0.5, 1, 2, 4, 5], leather: [0, 0, 0, 0, 0, 0, 0, 0], elfin: [0, -0.5, -0.5, 0, 0, -5, -5, 0],
  studded: [-10, -1, -1, -0.5, -0.5, -10, -10, -5], chain: [-40, -4, -4, -3, -5, -20, -30, -10],
  banded: [-70, -8, -8, -5, -10, -20, -60, -30], platemail: [-90, -12, -12, -7, -15, -30, -70, -50],
  plate: [-100, -18, -18, -10, -20, -50, -70, -70]
};

// PHB stocks and UA sub-races (module/races.mjs). Old keys stay as the PHB defaults: dwarf = hill, elf = high,
// gnome = surface, halfling = stout, half-elf = high elf descent.
export const RACES = RACE_OPTIONS;

/* ================================================================== */
/*  Character                                                           */
/* ================================================================== */
export class CharacterData extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    return {
      abilities: new f.SchemaField({
        str: new f.SchemaField({ value: int(10, { min: 1, max: 25 }), pct: int(0, { min: 0, max: 100 }) }),
        int: ability(), wis: ability(), dex: ability(), con: ability(), cha: ability()
      }),
      details: new f.SchemaField({
        race: str("human"), alignment: str(""), sex: str(""), age: str(""), height: str(""), weight: str(""),
        deity: str(""), languages: str(""), player: str(""), biography: html(), notes: html(),
        dualClass: bool(false)
      }),
      psionics: psionicsField(),
      classes: new f.ArrayField(new f.SchemaField({
        key: str("fighter"), level: int(1, { min: 0 }), xp: int(0, { min: 0 }),
        matrix: str(""), save: str(""), hitDie: int(0, { min: 0 })
      }), { initial: [] }),
      hp: new f.SchemaField({ value: int(1), max: int(1, { min: 0 }) }),
      ac: new f.SchemaField({ misc: int(0), override: new f.NumberField({ required: false, nullable: true, integer: true, initial: null }) }),
      move: new f.SchemaField({ base: int(12, { min: 0 }) }),
      combat: new f.SchemaField({ hitMisc: int(0), dmgMisc: int(0), missileMisc: int(0) }),
      saves: new f.SchemaField(Object.fromEntries(R.SAVE_KEYS.map(k => [k, new f.SchemaField({ misc: int(0) })]))),
      thief: new f.SchemaField(Object.fromEntries(R.THIEF_SKILL_KEYS.map(k => [k, new f.SchemaField({ misc: int(0) })]))),
      money: new f.SchemaField({ pp: int(0), gp: int(0), ep: int(0), sp: int(0), cp: int(0) }),
      treasure: str(""),
      // Proficiencies (DSG/WSG): weapons the character is proficient with, and slots the DM grants beyond the table
      profs: new f.SchemaField({
        weapons: new f.ArrayField(new f.SchemaField({ name: str(""), spec: str("", { choices: ["", "single", "double"] }), bow: bool(false) }), { initial: [] }),
        extraWeapon: int(0), extraNonweapon: int(0)
      }),
      extraSlots: new f.SchemaField({
        cleric: new f.ArrayField(int(0), { initial: [] }),
        druid: new f.ArrayField(int(0), { initial: [] }),
        magicuser: new f.ArrayField(int(0), { initial: [] }),
        illusionist: new f.ArrayField(int(0), { initial: [] })
      })
    };
  }

  /** Classes with their table definitions merged in. */
  get classEntries() {
    const list = this.classes.length ? this.classes : [];
    return list.map((c, i) => {
      const def = CLASSES[c.key] ?? CLASSES.custom;
      return {
        index: i, key: c.key, level: c.level, xp: c.xp, def,
        label: def.label,
        matrix: c.matrix || def.matrix,
        save: c.save || def.save,
        hitDie: c.hitDie || def.hitDie
      };
    });
  }

  prepareDerivedData() {
    const classes = this.classEntries;
    const fighterCon = classes.some(c => c.def.fighterCon);
    const exceptionalStr = classes.some(c => c.def.exceptionalStr);
    const ab = R.abilityDetails(this.abilities, { fighterCon, exceptionalStr });
    const barb = classes.find(c => c.def.barbarian);
    // UA p.19: barbarians get +2 hp per point of constitution over 14 instead of the normal adjustment
    if (barb) ab.con.hpAdj = barbarianConHP(this.abilities.con.value);
    this.mods = ab;
    this.barbarian = barb ? { level: barb.level, saves: barbarianSaveBonus(barb.level) } : null;

    // Saving throws: best of every class (DMG p.79); 0-level uses the fighter 0 row.
    const saveEntries = classes.map(c => ({ group: c.save, level: c.level }));
    const best = R.bestSaves(saveEntries);
    const paladin = classes.some(c => (c.key === "paladin" || c.key === "paladinUA") && c.level > 0);
    for (const k of R.SAVE_KEYS) {
      this.saves[k].base = best[k].value;
      // PHB p.22: paladins make all saving throws at +2 (UA p.17: unchanged for the UA paladin)
      this.saves[k].class = (this.barbarian ? (this.barbarian.saves[k] ?? 0) : 0) + (paladin ? 2 : 0);
      this.saves[k].value = best[k].value - this.saves[k].misc - this.saves[k].class;
    }
    this.racialSave = R.racialSaveBonus(baseRace(this.details.race), this.abilities.con.value);

    // Monks: AC and movement come from the monk table
    const monk = classes.find(c => c.key === "monk");
    this.monk = monk ? R.monkInfo(monk.level) : null;

    // Bard (PHB Bards Table II)
    const bard = classes.find(c => c.key === "bard");
    if (bard) {
      const r = BARD_TABLE[Math.max(1, Math.min(23, bard.level))];
      this.bard = { level: bard.level, college: r[0], languages: r[1], charm: r[2], lore: r[3] };
    } else this.bard = null;
    // Cavalier and UA paladin
    const cav = classes.find(c => c.def.cavalier);
    this.cavalier = cav ? { level: cav.level, horsemanship: Math.min(100, 85 + Math.max(0, cav.level - 1)) } : null;

    // Spell slots
    this.spellSlots = R.spellSlots(classes.map(c => ({ key: c.key, level: c.level })), this.abilities.wis.value, this.extraSlots);

    // Experience for next level
    for (const c of classes) c.next = R.xpForLevel(c.key, c.level + 1);
    this.classInfo = classes;
    this.totalLevel = classes.reduce((a, c) => a + c.level, 0);
    // Proficiency slots (DSG Table 10 / WSG Table 1), plus any the DM grants
    const ps = proficiencySlots(classes.map(c => ({ key: c.key, level: c.level })));
    this.profSlots = { ...ps, weapon: ps.weapon + this.profs.extraWeapon, nonweapon: ps.nonweapon + this.profs.extraNonweapon };
    // PHB p.111: level of mastery equals the character's level of experience (highest class used for multi-class)
    this.totalMastery = Math.max(1, ...classes.map(c => c.level));
  }

  /** Called by the Actor once embedded items are prepared. */
  prepareArmor(items) {
    const worn = items.filter(i => i.type === "armor" && i.system.equipped).map(i => i.system);
    const suits = worn.filter(a => a.kind === "armor");
    let dexDef = this.mods.dex.defense;
    if (this.barbarian) {
      // UA p.19: replaces the normal defensive adjustment
      const bulky = suits.some(a => /fairly|bulky/i.test(a.bulk) && !/non/i.test(a.bulk));
      dexDef = barbarianDexAC(this.abilities.dex.value, bulky);
      this.mods.dex.barbarianDefense = dexDef;
    }
    this.mods.dex.effectiveDefense = dexDef;
    const bw = items.find(i => i.type === "psionic" && i.system.active && /body weaponry/i.test(i.name));
    this.bodyWeaponry = bw ? R.bodyWeaponry(this.classInfo, bw.system.mastery ?? this.totalMastery) : null;
    // Worn protection devices (DMG p.137 ring of protection, p.150 cloak of protection, p.144 bracers of defense)
    const prot = items.filter(i => i.type === "magic" && i.system.equipped && i.system.protection?.kind).map(i => ({ name: i.name, ...i.system.protection }));
    const anyShield = worn.some(a => a.kind === "shield");
    const nonLeather = suits.some(a => a.thiefArmor !== "leather");
    const bracers = !suits.length ? prot.filter(p => p.kind === "bracers" && p.ac) : [];
    const rings = prot.filter(p => p.kind === "ring");
    const cloaks = prot.filter(p => p.kind === "cloak");
    const bestRing = rings.sort((a, b) => b.ac - a.ac)[0];          // only the strongest ring functions
    const ringSave = rings.reduce((m, r) => Math.max(m, r.save), 0);
    const cloakOK = !suits.some(a => a.magic > 0) && !nonLeather && !anyShield;
    const bestCloak = cloakOK ? cloaks.sort((a, b) => b.ac - a.ac)[0] : null;
    let protAC = 0, protSave = ringSave + (bestCloak?.save ?? 0);
    const notes = [];
    if (bestRing) { if (suits.some(a => a.magic > 0)) notes.push(`${bestRing.name}: no armor class bonus with magic armor`); else protAC += bestRing.ac; }
    if (bestCloak) protAC += bestCloak.ac;
    else if (cloaks.length) notes.push(`${cloaks[0].name}: not with magic armor, armor other than leather, or a shield`);
    this.protection = { ac: protAC, save: protSave, notes, bracers: bracers.length ? Math.min(...bracers.map(b => b.ac)) : null };
    const ac = R.armorClass(worn, dexDef, { misc: this.ac.misc - protAC, monkAC: this.monk ? this.monk.ac : null, bodyAC: this.bodyWeaponry?.ac ?? null, bracersAC: this.protection.bracers });
    if (this.ac.override !== null && this.ac.override !== undefined) ac.ac = this.ac.override;
    this.ac.value = ac.ac;
    this.ac.rear = ac.rear;
    this.ac.type = ac.type;
    this.ac.shield = ac.shield;
    // Movement: slowest worn armor base movement (DMG p.27); magic armor moves at the next higher rate.
    const rates = [6, 9, 12];
    let move = this.monk ? this.monk.move : this.move.base;
    for (const a of worn.filter(a => a.kind === "armor" && a.baseMove)) {
      let r = a.baseMove;
      if (a.magic > 0) r = rates[Math.min(rates.length - 1, rates.indexOf(r) + 1)] ?? r;
      move = Math.min(move, r);
    }
    this.move.value = move;
    if (protSave) for (const k of R.SAVE_KEYS) this.saves[k].value -= protSave;
    this.encumbrance = items.reduce((t, i) => t + (Number(i.system.weight) || 0) * (Number(i.system.quantity ?? 1) || 0), 0);

    // Thieving abilities, with UA Thieves Table II armor effects
    const suit = suits.sort((a, b) => a.baseAC - b.baseAC)[0];
    let armorCat = suit ? (suit.thiefArmor || null) : "none";
    this.thiefArmorUnknown = !!suit && !suit.thiefArmor;
    const classes = this.classInfo;
    const ts = R.thiefSkills(classes.map(c => ({ key: c.key, level: c.level })), baseRace(this.details.race), this.abilities.dex.value, armorCat);
    this.thiefSkills = ts;
    if (ts) for (const k of R.THIEF_SKILL_KEYS) {
      if (ts.skills[k]) ts.skills[k].total = Math.round((ts.skills[k].total + this.thief[k].misc) * 10) / 10;
    }

    // Thief-acrobat functions (UA p.25)
    const acro = classes.find(c => c.def.acrobat && c.level >= 6);
    if (acro) {
      const r = ACROBAT_TABLE[Math.min(23, acro.level)];
      const race = ACROBAT_RACE[baseRace(this.details.race)] ?? ACROBAT_RACE.human;
      const st = ACROBAT_STR[Math.min(18, this.abilities.str.value)] ?? [0, 0, 0];
      const dx = ACROBAT_DEX[Math.min(19, this.abilities.dex.value)] ?? [0, 0, 0, 0, 0];
      const arm = armorCat ? ACROBAT_ARMOR[armorCat] : [0, 0, 0, 0, 0, 0, 0, 0];
      const dexOK = !armorCat || armorCat === "none" || armorCat === "leather";
      const d = v => (dexOK || v < 0 ? v : 0);
      this.acrobat = {
        level: acro.level,
        tightrope: Math.min(100, r[0] + race[0] + d(dx[0]) + arm[0]),
        poleVault: r[1] + race[1] + d(dx[1]) + arm[1],
        highJump: r[2] + race[2] + st[0] + arm[2],
        standingBroad: r[3] + race[3] + st[1] + arm[3],
        runningBroad: r[4] + race[4] + st[2] + arm[4],
        attack: r[5] + race[5] + d(dx[2]) + arm[5],
        evasion: r[6] + race[6] + d(dx[3]) + arm[6],
        fallPct: r[7][0] + race[7],
        fallDist: r[7][1] + d(dx[4]) + arm[7],
        armorCat
      };
    } else this.acrobat = null;
    // Setting modules (e.g. a campaign add-on) may adjust saves, spell slots and notes here.
    this.settingNotes = [];
    globalThis.Hooks?.callAll?.("frpg1e.prepareCharacter", this, items);
  }
}

/* ================================================================== */
/*  NPC: the character rules on a compact sheet, plus service details    */
/*  for henchmen and hirelings (DMG p.28-37)                            */
/* ================================================================== */
export const NPC_ROLES = { independent: "Independent (no tie to the party)", henchman: "Henchman", hireling: "Hireling (expert)", soldier: "Man-at-arms (soldier)",
  associate: "Associate", ally: "Ally (allied creature)", patron: "Patron or employer", rival: "Rival", enemy: "Enemy or villain", townsperson: "Townsfolk or bystander", other: "Other" };
/** Roles that serve a liege, so the DMG loyalty rules apply (DMG p.36: henchmen, hirelings and allied creatures). */
export const NPC_SERVING = ["henchman", "hireling", "soldier", "associate", "ally"];
export class NpcData extends CharacterData {
  static defineSchema() {
    return {
      ...super.defineSchema(),
      npc: new f.SchemaField({
        role: str("independent", { choices: Object.keys(NPC_ROLES) }),
        occupation: str(""),
        liegeId: str(""),          // actor id of the employer; empty = enter charisma and alignment by hand
        liegeName: str(""),
        liegeCha: int(10, { min: 3, max: 25 }),
        liegeAlignment: str(""),
        wages: str(""),
        loyalty: new f.SchemaField(Object.fromEntries(LOYALTY_GROUPS.map(([k, , ch]) => [k, str(ch[0][0], { choices: ch.map(c => c[0]) })]))),
        loyaltyMisc: int(0),
        notes: str("")
      })
    };
  }

  prepareDerivedData() {
    super.prepareDerivedData();
    const n = this.npc;
    if (!NPC_SERVING.includes(n.role)) { this.loyalty = null; return; }
    const liege = n.liegeId ? globalThis.game?.actors?.get?.(n.liegeId) : null;
    const cha = liege ? (liege.system?.abilities?.cha?.value ?? n.liegeCha) : n.liegeCha;
    const align = String(liege ? (liege.system?.details?.alignment ?? "") : n.liegeAlignment).trim().toLowerCase();
    const parts = [{ label: "Normal loyalty base", value: LOYALTY_BASE }, { label: `Liege's charisma ${cha}`, value: charismaTable(cha).loyalty }];
    for (const [k, label, choices] of LOYALTY_GROUPS) {
      const c = choices.find(x => x[0] === n.loyalty[k]) ?? choices[0];
      if (c[2]) parts.push({ label: `${label}: ${c[1]}`, value: c[2] });
    }
    const al = LOYALTY_LIEGE_ALIGNMENT[align];
    if (al) parts.push({ label: `Alignment of liege: ${align}`, value: al });
    if (n.loyaltyMisc) parts.push({ label: "Other", value: n.loyaltyMisc });
    const score = parts.reduce((t, p) => t + p.value, 0);
    const [band, text] = loyaltyBand(score);
    this.loyalty = { score, band, text, parts, liegeName: liege?.name ?? n.liegeName, alignKnown: al !== undefined || !align };
  }
}

/* ================================================================== */
/*  Monster                                                             */
/* ================================================================== */
export class MonsterData extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    return {
      hd: str("1"),
      hp: new f.SchemaField({ value: int(4), max: int(4, { min: 0 }) }),
      ac: int(7),
      armorType: new f.NumberField({ required: false, nullable: true, integer: true, initial: null }),
      move: str("12\""),
      attacks: str("1"),
      damage: str("1d6"),
      specialAttacks: str(""),
      specialDefenses: str(""),
      magicResistance: str("Standard"),
      intelligence: str(""),
      alignment: str(""),
      size: str("M"),
      numberAppearing: str(""),
      treasure: str(""),
      xp: str(""),
      surprise: str("2 in 6"),
      attackAs: str(""),
      saveAs: new f.SchemaField({ group: str("fighter"), level: new f.NumberField({ required: false, nullable: true, integer: true, initial: null }) }),
      nonIntelligent: bool(false),
      psionics: psionicsField(),
      intWis: new f.NumberField({ required: false, nullable: true, integer: true, initial: null }),
      // MM stat block lines kept as printed
      frequency: str(""), inLair: str(""), acText: str(""), sizeText: str(""), psionicText: str(""), source: str(""),
      description: html(),
      // editable attack buttons; empty = one button per "/" part of Damage/Attack
      attackList: new f.ArrayField(new f.SchemaField({ name: str(""), damage: str("1d6"), hit: int(0), dmg: int(0) }), { initial: [] }),
      attackListEdited: bool(false),
      // Hit point rolling where the book's hit dice are not plain d8s (see Rolls.rollMonsterHP):
      // hpOptions: choices offered in a dialog (e.g. 6, 7 or 8 HD; hd, if set, becomes Attacks as HD); hpParts: separately tracked parts
      // (legs, tentacles, stalks) rolled alongside; hpByAge: oriental dragons (size picks HD, age = hp per die);
      // hpNote: shown on the card, or as the reason when hit points must be set by hand.
      hpOptions: new f.ArrayField(new f.SchemaField({ label: str(""), formula: str(""), hd: str("") }), { initial: [] }),
      hpParts: new f.ArrayField(new f.SchemaField({ label: str(""), formula: str(""), count: int(1, { min: 1 }) }), { initial: [] }),
      hpByAge: bool(false),
      // MMII dragons: hpAgePlus adds hit points per die (shadow dragon +1); hpSizeSplit gives d% bands for small/average/large
      // (shadow dragon 25/50/25) in place of the d8 size roll; hpNoRoll: the book gives no way to roll them (hpNote says why)
      hpAgePlus: int(0, { min: 0 }),
      hpSizeSplit: new f.ArrayField(new f.NumberField({ required: true, integer: true }), { initial: [] }),
      hpNoRoll: bool(false),
      hpNote: str(""),
      surpriseOn: int(2, { min: 0 }), surpriseDie: int(6, { min: 2 })   // surprised on 1-surpriseOn of a d-surpriseDie (DMG p.61)          // true once the buttons were edited: attackList is used even when empty
    };
  }

  prepareDerivedData() {
    const col = R.monsterColumn(this.attackAs || this.hd);
    this.matrixColumn = col.label;
    this.saveLevel = this.saveAs.level ?? R.monsterSaveLevel(R.hdForRules(this.hd, this.attackAs));
    const row = R.saveRow(this.saveAs.group || "fighter", this.saveLevel);
    // DMG II.D: non-intelligent creatures save at half their hit dice (rounded up) except vs. poison or death magic
    const half = R.saveRow(this.saveAs.group || "fighter", Math.ceil(this.saveLevel / 2));
    this.saves = {};
    for (const k of R.SAVE_KEYS) this.saves[k] = { value: (this.nonIntelligent && k !== "ppd") ? half[k] : row[k] };
    this.ac_type = this.armorType ?? this.ac;
    this.routine = (this.attackList.length || this.attackListEdited)
      ? this.attackList.map((a, i) => ({ index: i, text: a.name || a.damage || "Weapon", name: a.name, damage: a.damage, formula: R.damageFormula(a.damage),
          hit: a.hit, dmg: a.dmg, weapon: !String(a.damage ?? "").trim(), alt: false, edited: true }))
      : R.monsterAttackButtons(this.damage)
        .map((b, i) => ({ index: i, text: b.text, name: "", damage: b.weapon ? "" : b.text, formula: b.formula, hit: 0, dmg: b.dmg, weapon: b.weapon, alt: b.alt, edited: false }));
    // a printed range of hit dice ("12-19") attacks by its lowest until Attacks as HD is set (rolling hit points sets it)
    this.matrixHint = !this.attackAs && R.hdRange(this.hd) ? `the lowest of ${this.hd}, until Attacks as HD is set` : "";
  }
}

/* ================================================================== */
/*  Items                                                               */
/* ================================================================== */
const common = () => ({
  description: html(),
  weight: num(0, { min: 0 }),
  quantity: int(1, { min: 0 }),
  cost: str(""),
  source: str(""),
  xp: str(""),          // DMG/UA experience point value (as printed)
  gpValue: str(""),     // DMG/UA gold piece sale value (as printed)
  quantityRoll: str("") // number found, e.g. 2d12 arrows (used by the treasure roller)
});
const acAdj = () => new f.ArrayField(int(0), { initial: () => Array(11).fill(0) });

export class WeaponData extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    return {
      ...common(),
      attackType: str("melee", { choices: ["melee", "missile", "both"] }),
      damage: new f.SchemaField({ sm: str("1d6"), l: str("1d6"), smRange: str(""), lRange: str("") }),
      speed: str(""),
      acAdj: acAdj(),
      missile: new f.SchemaField({
        rate: str(""),
        short: new f.NumberField({ required: false, nullable: true, initial: null }),
        medium: new f.NumberField({ required: false, nullable: true, initial: null }),
        long: new f.NumberField({ required: false, nullable: true, initial: null }),
        acAdj: acAdj()
      }),
      ammo: str(""),
      magic: new f.SchemaField({
        hit: int(0), dmg: int(0),
        // special bonuses against creature types (replace the normal bonus), e.g. +3 vs. lycanthropes
        vs: new f.ArrayField(new f.SchemaField({ bonus: int(0), text: str("") }), { initial: [] })
      }),
      bonus: new f.SchemaField({ hit: int(0), dmg: int(0) }),
      proficient: bool(true),
      equipped: bool(true),
      natural: bool(false),
      weightText: str(""),
      choice: str("", { choices: ["", "lance", "sword", "horseman"] }),
      specialized: str("", { choices: ["", "single", "double"] })
    };
  }
}

export class ArmorData extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    return {
      ...common(),
      thiefArmor: str("", { choices: ["", ...Object.keys(THIEF_ARMOR)] }),
      kind: str("armor", { choices: ["armor", "shield"] }),
      baseAC: int(10),
      shieldBonus: int(1),
      magic: int(0),
      bulk: str(""),
      baseMove: int(0),
      equipped: bool(false)
    };
  }
}

export class SpellData extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    return {
      description: html(),
      source: str(""),
      list: str("magicuser", { choices: ["cleric", "druid", "magicuser", "illusionist"] }),
      level: int(1, { min: 0, max: 9 }),
      school: str(""),
      reversible: bool(false),
      components: str(""),
      range: str(""),
      castingTime: str(""),
      duration: str(""),
      aoe: str(""),
      save: str(""),
      memorized: int(0, { min: 0 }),
      inBook: bool(true),
      damage: str(""),
      heal: str(""),                                        // hit points restored, e.g. 1d8
      healMode: str("", { choices: ["", "allBut", "temp"] }), // allBut: all but the roll (heal); temp: may exceed maximum (aid)
      rolls: rollsField()
    };
  }
}

export class PsionicData extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    return {
      description: html(),
      source: str(""),
      kind: str("minor", { choices: ["minor", "major"] }),
      range: str(""), cost: str(""), duration: str(""), save: str(""), aoe: str(""),
      active: bool(false),
      activeSince: new f.NumberField({ required: false, nullable: true, integer: true, initial: null }),
      mastery: new f.NumberField({ required: false, nullable: true, integer: true, initial: null, min: 1 })
    };
  }
}

export class GearData extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    // ammo: what this gear is ammunition for ("arrow", "bolt-light", "bolt-heavy", "bolt-hand", "bullet", "stone", "needle")
    return { ...common(), carried: bool(true), category: str(""), ammo: str("") };
  }
}

export const MAGIC_CATEGORIES = {
  potion: "Potion or oil", scroll: "Scroll", ring: "Ring", rod: "Rod", staff: "Staff", wand: "Wand",
  misc: "Miscellaneous magic", artifact: "Artifact or relic", ammunition: "Magic ammunition", reference: "Reference"
};

/** Magic items other than armor and weapons (DMG/UA tables III.A-E, plus magic ammunition). */
export class MagicData extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    return {
      ...common(),
      category: str("misc", { choices: Object.keys(MAGIC_CATEGORIES) }),
      usable: str(""),                  // class restriction as printed: C, D, F, M, T
      charges: new f.SchemaField({ value: int(0, { min: 0 }), max: int(0, { min: 0 }) }),
      equipped: bool(false),            // worn / in hand
      identified: bool(true),
      ammo: str("", { choices: ["", "arrow", "bolt", "bullet"] }),
      bonus: new f.SchemaField({ hit: int(0), dmg: int(0) }),
      // worn protection: ring or cloak of protection (AC and save bonus), bracers of defense (armor class)
      protection: new f.SchemaField({ kind: str("", { choices: ["", "ring", "cloak", "bracers"] }), ac: int(0), save: int(0) }),
      heal: str(""),          // hit points restored, e.g. 2d4+2
      healThird: str(""),     // potion of extra-healing: one third of the potion
      healTarget: str("self", { choices: ["self", "touch"] }),
      rolls: rollsField()
    };
  }
}

export const PROF_GROUPS = { craftsman: "Craftsman (DSG)", adventuring: "Adventuring (DSG)", wilderness: "Wilderness (WSG)", other: "Other" };
export const ABILITY_LABELS = { str: "Strength", int: "Intelligence", wis: "Wisdom", dex: "Dexterity", con: "Constitution", cha: "Charisma" };
/** Nonweapon proficiencies (DSG pp.23-29, WSG pp.11-17). modifier: added to the d20 roll (WSG convention; negative is easier). */
export class ProficiencyData extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    return {
      description: html(),
      source: str(""),
      group: str("other", { choices: Object.keys(PROF_GROUPS) }),
      slots: int(1, { min: 0 }),
      ability: str("", { choices: ["", ...Object.keys(ABILITY_LABELS)] }),
      check: bool(true),          // false: "NA", the proficiency never calls for a check
      modifier: int(0),
      everyUse: bool(false),      // DSG asterisk: a check every time it is used
      improvements: int(0, { min: 0 }),
      specialty: str(""),         // animal type, mount, and so on
      notes: str("")
    };
  }
}

export const TREASURE_KINDS = { gem: "Gem", jewelry: "Jewelry", art: "Object of art", other: "Other valuables" };
/** Gems, jewelry and other valuables (DMG p.25-26). */
export class TreasureData extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    return {
      ...common(),
      kind: str("gem", { choices: Object.keys(TREASURE_KINDS) }),
      class: str(""),          // gem class: ornamental, semi-precious, fancy, gem
      baseValue: num(0, { min: 0 }),
      value: num(0, { min: 0 }),  // gp each, after variation
      color: str(""), opaque: bool(false), property: str("")
    };
  }
}
