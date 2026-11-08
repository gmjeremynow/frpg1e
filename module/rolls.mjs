import { isPC } from "./actor-types.mjs";
/**
 * Every roll the system makes, and the chat cards that report them.
 */
import { CLASSES, classIs, SAVE_KEYS, RANGE_PENALTY, TURN_UNDEAD, turnUndeadColumn, backstabMultiplier, scoreFromBase,
  cavalierChoiceBonus, specialistAttacks, fighterAttacksPerRound } from "./tables.mjs";
import * as R from "./rules.mjs";
import * as Dice from "./dice.mjs";
import * as CF from "./classfeatures.mjs";
import { baseRace } from "./races.mjs";
import * as T from "./tables.mjs";

const { DialogV2 } = foundry.applications.api;
const { renderTemplate } = foundry.applications.handlebars;
export const SYSTEM_ID = "frpg1e";

export const SAVE_LABELS = {
  ppd: "Paralyzation, Poison or Death Magic",
  pp: "Petrification or Polymorph",
  rsw: "Rod, Staff or Wand",
  bw: "Breath Weapon",
  sp: "Spell"
};
export const SAVE_SHORT = { ppd: "Para / Poison / Death", pp: "Petri / Poly", rsw: "Rod / Staff / Wand", bw: "Breath", sp: "Spell" };
export const THIEF_LABELS = {
  pp: "Pick Pockets", ol: "Open Locks", ft: "Find / Remove Traps", ms: "Move Silently",
  hs: "Hide in Shadows", hn: "Hear Noise", cw: "Climb Walls", rl: "Read Languages"
};

const setting = key => game.settings.get(SYSTEM_ID, key);
const signed = n => (n >= 0 ? `+${n}` : `${n}`);

async function postCard(actor, template, data, { rolls = [], flags = {}, flavor } = {}) {
  const content = await renderTemplate(`systems/${SYSTEM_ID}/templates/chat/${template}.hbs`, { actor, ...data });
  const msg = {
    speaker: ChatMessage.getSpeaker({ actor }),
    content, rolls, flavor,
    flags: { [SYSTEM_ID]: flags }
  };
  ChatMessage.applyMode(msg);
  return ChatMessage.create(msg);
}

async function evalRoll(formula, data = {}) {
  return new Roll(formula, data).evaluate();
}

/* ------------------------------------------------------------------ */
/*  Combat numbers                                                      */
/* ------------------------------------------------------------------ */

/** Everything the attacker contributes, independent of target. */
function attackerProfile(actor) {
  if (actor.type === "monster") {
    const s = actor.system;
    return { monster: true, hd: s.attackAs || s.hd };
  }
  const s = actor.system;
  const classes = s.classInfo;
  if (!classes.length) return { monster: false, entries: [{ matrix: "fighter", level: 0, key: null }], nonProf: -2 };
  const entries = classes.map(c => ({ matrix: c.matrix, level: c.level, key: c.key }));
  if (!entries.some(e => e.matrix)) entries.push({ matrix: "fighter", level: 0, key: null });
  return {
    monster: false,
    entries,
    humanCavalier: s.details.race === "human" && classes.some(c => c.def.cavalier),
    cavalierLevel: Math.max(0, ...classes.filter(c => c.def.cavalier).map(c => c.level)),
    // UA p.18: weapon specialization is for single-classed fighters and rangers
    canSpecialize: classes.length === 1 && ["fighter", "ranger"].includes(classes[0].key),
    specLevel: classes.length === 1 ? classes[0].level : 0,
    // Multi-classed characters suffer the least severe non-proficiency penalty of their classes.
    nonProf: Math.max(...classes.map(c => c.def.nonProf ?? -2))
  };
}

/** Score needed for this attacker to hit an AC, with the matrix it came from. */
function neededToHit(profile, ac, { mounted = false } = {}) {
  if (profile.monster) return { score: R.monsterToHit(profile.hd, ac), via: `monster ${R.monsterColumn(profile.hd).label} HD` };
  let best = null;
  for (const e of profile.entries) {
    if (!e.matrix) continue;   // e.g. the bard row: bards fight at their fighter level
    // UA p.16: a human cavalier attacks from horseback as if 1 level higher
    const lvl = e.level + (mounted && profile.humanCavalier && CLASSES[e.key]?.cavalier ? 1 : 0);
    const score = R.characterToHit(e.matrix, lvl, ac);
    if (!best || score < best.score) best = { score, via: `${CLASSES[e.key]?.label ?? "0-level"} ${e.level}`, entry: e };
  }
  return best;
}

/** DMG p.74 optional rule: fighters gain +1 at the second level of each pair. */
function perLevelBonus(profile) {
  if (profile.monster || !setting("fighterPerLevel")) return 0;
  const f = profile.entries.find(e => ["fighter", "paladin", "ranger"].includes(e.key) && e.level > 0 && e.level % 2 === 0);
  return f ? 1 : 0;
}

/** Target's defensive numbers. */
function targetDefense(token, { rear = false } = {}) {
  const a = token.actor;
  if (!a) return null;
  if (a.type === "monster") {
    return { name: token.name, ac: a.system.ac, type: a.system.armorType ?? a.system.ac, size: a.system.size, uuid: token.document.uuid };
  }
  return {
    name: token.name,
    ac: rear ? a.system.ac.rear : a.system.ac.value,
    type: rear ? a.system.ac.type + (a.system.ac.shield ? 1 : 0) : a.system.ac.type,
    size: "M", uuid: token.document.uuid
  };
}

/** Lowest armor class a total would hit, for untargeted rolls. */
function bestACHit(profile, total, mounted = false) {
  for (let ac = -10; ac <= 10; ac++) if (neededToHit(profile, ac, { mounted }).score <= total) return ac;
  return null;
}

/** Which magic ammunition a missile weapon fires. */
export function ammoFor(item) {
  const n = (item?.name ?? "").toLowerCase();
  if (n.includes("crossbow")) return "bolt";
  if (n.includes("bow")) return "arrow";
  if (n.includes("sling")) return "bullet";
  return null;
}

/** Ammunition a launcher uses, as a gear "ammo" key. Null for weapons that are not launchers. */
export const AMMO_KINDS = { arrow: "Arrows", "bolt-light": "Light quarrels", "bolt-heavy": "Heavy quarrels", "bolt-hand": "Hand quarrels",
  bullet: "Sling bullets", stone: "Sling stones", needle: "Blowgun needles" };
export function ammoKey(item) {
  const a = String(item?.system?.ammo ?? "").toLowerCase();
  const n = (item?.name ?? "").toLowerCase();
  const t = a || n;
  if (n.includes("blowgun")) return "needle";
  if (/quarrel|bolt|crossbow/.test(t)) return t.includes("hand") ? "bolt-hand" : t.includes("heavy") ? "bolt-heavy" : t.includes("light") ? "bolt-light" : "bolt";
  if (/arrow|\bbow\b|bow,/.test(t)) return "arrow";
  if (t.includes("sling")) return t.includes("stone") ? "stone" : "bullet";
  return null;
}
/** Does a gear item's ammo key fit a launcher's key? ("bolt" fits any crossbow) */
const ammoFits = (gearKey, key) => !!gearKey && (gearKey === key || (gearKey === "bolt" && key?.startsWith("bolt")) || (key === "bolt" && gearKey.startsWith("bolt")));

/** Missile type for the UA weapon specialization table. */
export function missileKind(item) {
  const n = (item?.name ?? "").toLowerCase();
  if (n.includes("crossbow, light") || n.includes("light crossbow")) return "lightXbow";
  if (n.includes("crossbow, heavy") || n.includes("heavy crossbow")) return "heavyXbow";
  if (n.includes("crossbow")) return "other";
  if (n.includes("bow")) return "bow";
  if (n.includes("lasso") || n.includes("staff sling")) return "lassoSling";
  if (n.includes("dagger")) return "dagger";
  if (n.includes("dart")) return "dart";
  return "other";
}

/** UA p.18-19 weapon specialization bonuses: {hit, dmg, doubleDice}. */
function specialization(profile, item, missile, range) {
  const w = item?.system;
  if (!w?.specialized || !profile.canSpecialize) return null;
  if (!missile) return w.specialized === "double" ? { hit: 3, dmg: 3, label: "Double specialization" } : { hit: 1, dmg: 2, label: "Specialization" };
  const kind = missileKind(item);
  if (kind === "bow") {
    if (range === "pointblank") return { hit: 2, dmg: 2, doubleDice: true, label: "Specialist, point blank" };
    if (range === "short") return { hit: 1, dmg: 1, label: "Specialist, short range" };
    return null;
  }
  if (kind === "lightXbow" || kind === "heavyXbow") {
    if (range === "pointblank") return { hit: 2, dmg: 2, doubleDice: true, label: "Specialist, point blank" };
    if (range === "short") return { hit: 1, dmg: 1, label: "Specialist, short range" };
    if (range === "medium") return { hit: 1, dmg: 0, label: "Specialist, medium range" };
    return null;
  }
  return { hit: 1, dmg: 2, label: "Specialization" };
}

/** Attacks per round shown for a weapon on the sheet. */
export function weaponAttacks(actor, item) {
  const profile = attackerProfile(actor);
  if (profile.monster) return "";
  const w = item.system;
  if (w.specialized && profile.canSpecialize) {
    const kind = w.attackType === "missile" ? missileKind(item) : "melee";
    return specialistAttacks(kind, profile.specLevel) ?? "";
  }
  // UA p.15: weapons of choice attack as if 5 levels higher; 3/1 at 16th level and above
  if (w.choice && profile.cavalierLevel && cavalierChoiceBonus(w.choice, profile.cavalierLevel) > 0) {
    const L = profile.cavalierLevel;
    return L >= 16 ? "3/1" : fighterAttacksPerRound("cavalier", L + 5);
  }
  return "";
}

/* ------------------------------------------------------------------ */
/*  Attack                                                              */
/* ------------------------------------------------------------------ */
/**
 * @param {Actor} actor
 * @param {object} opts
 * @param {Item} [opts.item]          weapon item
 * @param {number} [opts.routine]     monster attack-routine index (system.routine)
 * @param {boolean} [opts.fast]       skip the options dialog
 */
export async function rollAttack(actor, { item = null, routine = null, fast = false } = {}) {
  const profile = attackerProfile(actor);
  const w = item?.system;
  const isChar = isPC(actor);
  const canMissile = w ? ["missile", "both"].includes(w.attackType) : false;
  const canMelee = w ? ["melee", "both"].includes(w.attackType) : true;
  const thiefLevel = isChar ? Math.max(0, ...actor.system.classInfo.filter(c => c.def.backstab).map(c => c.level)) : 0;

  const pointBlank = canMissile && w?.specialized && profile.canSpecialize && ["bow", "lightXbow", "heavyXbow"].includes(missileKind(item));
  // Special magic bonuses against creature types, and magic ammunition for bows, crossbows and slings
  const vsOptions = (w?.magic?.vs ?? []).map((v, i) => ({ i, label: `+${v.bonus} vs. ${v.text}` }));
  const ammoKind = canMissile ? ammoFor(item) : null;
  const key = canMissile ? ammoKey(item) : null;
  // ordinary ammunition (gear with a matching ammo key) first, then magic ammunition
  const plainAmmo = key ? actor.items.filter(i => i.type === "gear" && ammoFits(i.system.ammo, key) && i.system.quantity > 0) : [];
  const magicAmmo = ammoKind ? actor.items.filter(i => i.type === "magic" && i.system.category === "ammunition" && i.system.ammo === ammoKind && i.system.quantity > 0) : [];
  const ammoItems = [...plainAmmo, ...magicAmmo].map(i => ({ id: i.id, label: `${i.name} (${i.system.quantity})` }));
  const ammoMissing = key && !ammoItems.length ? `No ${AMMO_KINDS[key]?.toLowerCase() ?? "ammunition"} carried: the shot is not counted.` : "";
  // thrown weapons in a stack (darts, javelins, daggers): count them down when thrown
  const thrownStack = canMissile && !key && (item?.system.quantity ?? 0) > 1;
  let opts = { mode: canMelee ? "melee" : "missile", range: "short", rear: false, helpless: false, invisible: false, backstab: false, mounted: false, misc: 0, vs: -1,
    ammo: ammoItems[0]?.id ?? "", countThrown: thrownStack };
  if (!fast) {
    const content = await renderTemplate(`systems/${SYSTEM_ID}/templates/apps/attack-dialog.hbs`, {
      canMelee, canMissile, both: canMelee && canMissile, thief: thiefLevel > 0, ranges: w?.missile,
      cavalier: profile.cavalierLevel > 0, pointBlank, vsOptions, magicHit: w?.magic?.hit ?? 0, ammoItems, ammoMissing, thrownStack,
      quantity: item?.system.quantity ?? 0
    });
    const res = await DialogV2.wait({
      window: { title: `${item?.name ?? actor.system.routine?.[routine]?.text ?? "Attack"}` },
      classes: ["frpg1e-dialog"],
      content,
      rejectClose: false,
      buttons: [{
        action: "roll", label: "Roll to Hit", icon: "fa-solid fa-dice-d20", default: true,
        callback: (event, button) => {
          const el = button.form.elements;
          return {
            mode: el.mode?.value ?? opts.mode,
            range: el.range?.value ?? "short",
            rear: el.rear?.checked ?? false,
            helpless: el.helpless?.checked ?? false,
            invisible: el.invisible?.checked ?? false,
            backstab: el.backstab?.checked ?? false,
            mounted: el.mounted?.checked ?? false,
            misc: Number(el.misc?.value) || 0,
            vs: el.vs ? Number(el.vs.value) : -1,
            ammo: el.ammo?.value ?? "",
            countThrown: el.countThrown?.checked ?? false
          };
        }
      }]
    });
    if (!res) return null;
    opts = res;
  }
  const missile = opts.mode === "missile";

  // Roll modifiers that do not depend on the target
  const mods = [];
  if (isChar) {
    const m = actor.system.mods;
    if (!missile && m.str.hit) mods.push({ label: "Strength", value: m.str.hit });
    if (missile && m.dex.reaction) mods.push({ label: "Dexterity", value: m.dex.reaction });
    if (actor.system.combat.hitMisc) mods.push({ label: "Misc.", value: actor.system.combat.hitMisc });
    if (missile && actor.system.combat.missileMisc) mods.push({ label: "Missile misc.", value: actor.system.combat.missileMisc });
    if (w && !w.proficient && !w.natural) mods.push({ label: "Non-proficient", value: profile.nonProf });
  }
  const vsSel = opts.vs >= 0 ? w?.magic?.vs?.[opts.vs] ?? null : null;
  const magicHit = vsSel ? vsSel.bonus : (w?.magic.hit ?? 0);
  if (magicHit) mods.push({ label: vsSel ? `Magic vs. ${vsSel.text}` : "Magic", value: magicHit });
  const ammoItem = missile && opts.ammo ? actor.items.get(opts.ammo) : null;
  if (ammoItem?.system.bonus?.hit) mods.push({ label: ammoItem.name, value: ammoItem.system.bonus.hit });
  if (w?.bonus.hit) mods.push({ label: "Weapon bonus", value: w.bonus.hit });
  const plb = perLevelBonus(profile);
  if (plb) mods.push({ label: "Per-level progression", value: plb });
  if (missile && RANGE_PENALTY[opts.range]) mods.push({ label: `${opts.range} range`, value: RANGE_PENALTY[opts.range] });
  // UA p.15: cavalier weapons of choice (the lance only while mounted)
  if (w?.choice && profile.cavalierLevel && (w.choice !== "lance" || opts.mounted)) {
    const cb = cavalierChoiceBonus(w.choice, profile.cavalierLevel);
    if (cb) mods.push({ label: "Weapon of choice", value: cb });
  }
  const spec = specialization(profile, item, missile, opts.range);
  if (spec?.hit) mods.push({ label: spec.label, value: spec.hit });
  if (opts.backstab) mods.push({ label: "Back stab", value: 4 });
  else if (opts.rear) mods.push({ label: "Rear / unseen", value: 2 });
  if (opts.helpless) mods.push({ label: "Stunned / prone / motionless", value: 4 });
  if (opts.invisible) mods.push({ label: "Cannot see target", value: -4 });
  // PHB p.21: druids save +2 against fire and lightning (electrical) attacks
  if (opts.fire && s.classInfo?.some(c => c.key === "druid")) mods.push({ label: "Druid vs. fire/lightning", value: 2 });
  if (opts.misc) mods.push({ label: "Situational", value: opts.misc });
  const rAtk = item ? null : actor.system.routine?.[routine];
  if (rAtk?.hit) mods.push({ label: "Attack bonus", value: rAtk.hit });
  const modTotal = mods.reduce((a, m) => a + m.value, 0);

  const roll = await evalRoll(`1d20 + ${modTotal}`);
  const natural = roll.dice[0]?.total ?? roll.total - modTotal;
  const useArmorAdj = setting("weaponVsArmor") && w && !w.natural;
  const adjTable = w ? (missile ? w.missile.acAdj : w.acAdj) : null;
  const behind = opts.rear || opts.backstab;

  const targets = Array.from(game.user.targets).map(t => targetDefense(t, { rear: behind })).filter(Boolean);
  const results = targets.map(t => {
    const need = neededToHit(profile, t.ac, { mounted: opts.mounted });
    const adj = useArmorAdj ? R.weaponArmorAdj(adjTable, t.type) : 0;
    const total = roll.total + adj;
    return { ...t, need: need.score, via: need.via, adj, adjText: adj ? signed(adj) : "", total, hit: total >= need.score };
  });

  // Damage formulas
  const dmg = damageParts(actor, { item, routine, missile, backstab: opts.backstab, thiefLevel, spec, mounted: opts.mounted, profile, vsSel, ammoItem });
  if (ammoItem) await ammoItem.update({ "system.quantity": Math.max(0, ammoItem.system.quantity - 1) });
  // a thrown weapon from a stack is used up (pick it up again by raising the quantity)
  const thrownUsed = missile && !key && opts.countThrown && item && item.system.quantity > 0;
  if (thrownUsed) await item.update({ "system.quantity": item.system.quantity - 1 });
  const largeTarget = results.some(r => r.size === "L");

  return postCard(actor, "attack", {
    title: item?.name ?? actor.system.routine?.[routine]?.text ?? "Attack",
    img: item?.img ?? actor.img,
    mode: (missile ? `Missile (${opts.range === "pointblank" ? "point blank" : opts.range})` : "Melee") + (opts.mounted ? ", mounted" : ""),
    natural, total: roll.total, mods: mods.map(m => ({ ...m, text: signed(m.value) })),
    results,
    untargeted: !results.length,
    bestAC: results.length ? null : bestACHit(profile, roll.total, opts.mounted),
    ammoNote: ammoItem ? `${ammoItem.name}: ${ammoItem.system.quantity} left.${ammoItem.system.quantity ? "" : " That was the last one."}`
      : thrownUsed ? `${item.name}: ${item.system.quantity} left.` : (missile && key ? `No ${AMMO_KINDS[key]?.toLowerCase() ?? "ammunition"} counted.` : ""),
    specNote: w?.specialized && !profile.canSpecialize ? "Specialization ignored: only single-classed fighters and rangers can specialize (UA p.18)." : "",
    armorAdjNote: useArmorAdj && !results.length && adjTable ? "Weapon vs. armor type adjustments are applied per target." : "",
    dmg, largeTarget,
    backstab: opts.backstab ? backstabMultiplier(thiefLevel) : null
  }, {
    rolls: [roll],
    flags: {
      type: "attack", actorUuid: actor.uuid, itemId: item?.id ?? null, routine,
      targets: results.map(r => ({ uuid: r.uuid, hit: r.hit, size: r.size })),
      dmg
    }
  });
}

/** Damage formulas for size S/M and L, with every flat bonus folded in. */
function damageParts(actor, { item, routine, missile, backstab, thiefLevel, spec = null, mounted = false, profile = null, vsSel = null, ammoItem = null }) {
  let sm, l, smRange = "", lRange = "";
  const bonus = [];
  if (item) {
    const d = item.system.damage;
    sm = R.damageFormula(d.sm) || "1d6"; l = R.damageFormula(d.l) || sm;
    smRange = d.smRange; lRange = d.lRange;
    const md = vsSel ? vsSel.bonus : item.system.magic.dmg;
    if (md) bonus.push({ label: vsSel ? `Magic vs. ${vsSel.text}` : "Magic", value: md });
    if (ammoItem?.system.bonus?.dmg) bonus.push({ label: ammoItem.name, value: ammoItem.system.bonus.dmg });
    if (item.system.bonus.dmg) bonus.push({ label: "Weapon bonus", value: item.system.bonus.dmg });
  } else {
    const r = actor.system.routine?.[routine];
    // "by weapon type": no dice of its own; the card says so and shows any printed bonus
    if (r?.weapon) return { sm: "", l: "", smRange: "", lRange: "", weapon: true, bonus: r.dmg ? `${r.dmg >= 0 ? "+" : ""}${r.dmg} damage (as printed)` : "", mult: 1 };
    sm = l = r?.formula || "1d6";
    if (r?.dmg) bonus.push({ label: "Attack bonus", value: r.dmg });
  }
  if (isPC(actor)) {
    // PHB p.9: strength damage adjustment applies to melee combat
    if (!missile && actor.system.mods.str.dmg) bonus.push({ label: "Strength", value: actor.system.mods.str.dmg });
    if (actor.system.combat.dmgMisc) bonus.push({ label: "Misc.", value: actor.system.combat.dmgMisc });
  }
  if (spec?.dmg) bonus.push({ label: spec.label, value: spec.dmg });
  // UA p.16: a cavalier's lance does +1 damage per level mounted, +1 dismounted
  if (item?.system.choice === "lance" && profile?.cavalierLevel) bonus.push({ label: mounted ? "Mounted lance" : "Lance on foot", value: mounted ? profile.cavalierLevel : 1 });
  // Back stab multiplies the weapon's damage (PHB p.27); specialist point-blank shots do double damage (UA p.18)
  const mult = (backstab ? backstabMultiplier(thiefLevel) : 1) * (spec?.doubleDice ? 2 : 1);
  const b = bonus.reduce((a, x) => a + x.value, 0);
  // PHB p.27: back stab damage is a multiple of the normal damage for the weapon used.
  const build = f => {
    let out = mult > 1 ? `(${f}) * ${mult}` : f;
    if (b) out += ` ${b >= 0 ? "+" : "-"} ${Math.abs(b)}`;
    return out;
  };
  return { sm: build(sm), l: build(l), smRange, lRange, bonus: bonus.map(x => `${x.label} ${signed(x.value)}`).join(", "), mult };
}

/* ------------------------------------------------------------------ */
/*  Damage                                                              */
/* ------------------------------------------------------------------ */
export async function rollDamage(message, size) {
  const f = message.flags?.[SYSTEM_ID];
  if (!f?.dmg) return;
  const actor = await fromUuid(f.actorUuid);
  const formula = size === "l" ? f.dmg.l : f.dmg.sm;
  if (!formula) return ui.notifications.info("Damage is by the weapon used: roll the weapon's damage.");
  const roll = await evalRoll(formula);
  const total = Math.max(0, roll.total);
  const hitTargets = (f.targets ?? []).filter(t => t.hit);
  return postCard(actor, "damage", {
    title: size === "l" ? "Damage vs. Large" : "Damage vs. Small/Medium",
    total, formula,
    targets: hitTargets.length
  }, { rolls: [roll], flags: { type: "damage", amount: total, targets: hitTargets.map(t => t.uuid) } });
}

/** Apply a hit point change to message targets (or the user's controlled tokens). */
/**
 * Restore hit points. mode "": up to maximum; "allBut": to maximum less the roll (heal spell);
 * "temp": added even above maximum (aid spell). Returns [{name, before, after}].
 */
export async function healActors(actors, amount, mode = "") {
  const out = [];
  for (const a of actors) {
    if (!a.isOwner) { ui.notifications.warn(`You do not own ${a.name}.`); continue; }
    const hp = a.system.hp, before = hp.value, max = hp.max;
    let value;
    if (mode === "allBut") value = Math.max(before, max - amount);
    else if (mode === "temp") value = before + amount;
    else value = Math.max(before, Math.min(max, before + amount));
    await a.update({ "system.hp.value": value });
    out.push({ name: a.name, before, after: value });
  }
  return out;
}

export async function applyDamage(message, factor = 1, { amount: given = null, mode: givenMode = null } = {}) {
  const f = message.flags?.[SYSTEM_ID];
  const base = given ?? f?.amount ?? 0;
  const amount = Math.floor(base * Math.abs(factor));
  let actors = [];
  const controlled = canvas?.tokens?.controlled ?? [];
  if (controlled.length) actors = controlled.map(t => t.actor).filter(Boolean);
  else for (const uuid of f?.targets ?? []) {
    const doc = await fromUuid(uuid);
    if (doc?.actor) actors.push(doc.actor);
  }
  if (!actors.length) return ui.notifications.warn(factor < 0 ? "Select or target the tokens to heal." : "Select tokens (or target them before attacking) to apply damage.");
  if (factor < 0) {
    const done = await healActors(actors, base, givenMode ?? f?.mode ?? "");
    if (done.length) ui.notifications.info(done.map(d => `${d.name}: ${d.before} → ${d.after} hp`).join("; "));
    return;
  }
  for (const a of actors) {
    if (!a.isOwner) { ui.notifications.warn(`You do not own ${a.name}.`); continue; }
    const hp = a.system.hp;
    const value = factor < 0 ? Math.min(hp.max, hp.value + amount) : hp.value - amount;
    await a.update({ "system.hp.value": value });
  }
}

/* ------------------------------------------------------------------ */
/*  Saving throws                                                       */
/* ------------------------------------------------------------------ */
export async function rollSave(actor, key, { fast = false } = {}) {
  const s = actor.system;
  const target = actor.type === "monster" ? s.saves[key].value : s.saves[key].value;
  const isChar = isPC(actor);
  let opts = { misc: 0, wis: false, dex: false, racial: false, poison: false, illusion: false };
  if (!fast) {
    const racial = isChar && s.racialSave ? s.racialSave : null;
    const barb = isChar && s.barbarian && key === "ppd" ? s.barbarian : null;
    const cav = isChar && s.cavalier;
    const content = await renderTemplate(`systems/${SYSTEM_ID}/templates/apps/save-dialog.hbs`, {
      isChar, key,
      wisAdj: isChar ? signed(s.mods.wis.magicAdj) : null,
      dexAdj: isChar ? signed(-s.mods.dex.defense) : null,
      racial: racial && ((["rsw", "sp"].includes(key) && racial.magic) || (key === "ppd" && racial.poison)) ? racial : null,
      racialText: racial ? signed(racial.value) : "",
      poisonOnly: key === "ppd",
      barbarianPoison: !!barb, cavalier: !!cav, druid: isChar && s.classInfo.some(c => c.key === "druid"), classBonus: isChar && s.saves[key].class ? signed(s.saves[key].class) : ""
    });
    const res = await DialogV2.wait({
      window: { title: `Save vs. ${SAVE_LABELS[key]}` },
      classes: ["frpg1e-dialog"], content, rejectClose: false,
      buttons: [{
        action: "roll", label: "Roll Save", icon: "fa-solid fa-dice-d20", default: true,
        callback: (ev, button) => {
          const el = button.form.elements;
          return {
            misc: Number(el.misc?.value) || 0, wis: el.wis?.checked ?? false, dex: el.dex?.checked ?? false,
            racial: el.racial?.checked ?? false, poison: el.poison?.checked ?? false, illusion: el.illusion?.checked ?? false, fire: el.fire?.checked ?? false
          };
        }
      }]
    });
    if (!res) return null;
    opts = res;
  }
  const mods = [];
  if (opts.wis) mods.push({ label: "Wisdom (mental attack)", value: s.mods.wis.magicAdj });
  // PHB p.11: the defensive adjustment applies to saves against attacks that can be dodged (fire ball, lightning bolt...)
  if (opts.dex) mods.push({ label: "Dexterity (dodge)", value: -s.mods.dex.defense });
  if (opts.racial && s.racialSave) mods.push({ label: "Racial (constitution)", value: s.racialSave.value });
  // UA p.20: barbarians save +4 vs. poison (the sheet already counts +3 for this column)
  if (opts.poison && s.barbarian && key === "ppd") mods.push({ label: "Barbarian vs. poison", value: 1 });
  // UA p.17: cavaliers save at +2 versus all forms of illusion spells
  if (opts.illusion && s.cavalier) mods.push({ label: "Cavalier vs. illusion", value: 2 });
  // PHB p.21: druids save +2 against fire and lightning (electrical) attacks
  if (opts.fire && s.classInfo?.some(c => c.key === "druid")) mods.push({ label: "Druid vs. fire/lightning", value: 2 });
  if (opts.misc) mods.push({ label: "Situational", value: opts.misc });
  const modTotal = mods.reduce((a, m) => a + m.value, 0);
  const roll = await evalRoll(`1d20 + ${modTotal}`);
  const natural = roll.dice[0]?.total;
  // DMG p.79: a roll of 1 is always failure
  const success = natural !== 1 && roll.total >= target;
  return postCard(actor, "save", {
    title: `Save vs. ${SAVE_LABELS[key]}`, target, natural, total: roll.total, success,
    autoFail: natural === 1, mods: mods.map(m => ({ ...m, text: signed(m.value) }))
  }, { rolls: [roll], flags: { type: "save" } });
}

/* ------------------------------------------------------------------ */
/*  Percentile abilities                                                */
/* ------------------------------------------------------------------ */
export async function rollPercent(actor, label, chance, { note = "" } = {}) {
  const roll = await evalRoll("1d100");
  return postCard(actor, "percent", {
    title: label, chance, roll: roll.total, success: roll.total <= chance, note
  }, { rolls: [roll], flags: { type: "percent" } });
}

export async function rollThiefSkill(actor, key) {
  const sk = actor.system.thiefSkills?.skills?.[key];
  if (!sk) return;
  const note = key === "pp" ? "DM adjusts for the victim's level." : key === "hs" ? "The observer's powers may modify this." : "";
  return rollPercent(actor, THIEF_LABELS[key], sk.total, { note });
}

/** Open doors (d6) and bend bars / lift gates (d%) from Strength Table II. */
export async function rollOpenDoors(actor) {
  const od = actor.system.mods.str.od;
  const m = od.match(/^1-(\d)/);
  const max = m ? Number(m[1]) : 1;
  const roll = await evalRoll("1d6");
  return postCard(actor, "percent", {
    title: "Open Doors", d6: true, chance: `1-${max} on d6`, roll: roll.total, success: roll.total <= max,
    note: od.includes("(") ? `Locked, barred or magically held doors: ${od.match(/\((\d)\)/)[1]} in 6, one attempt only.` : ""
  }, { rolls: [roll], flags: { type: "percent" } });
}

/* ------------------------------------------------------------------ */
/*  Turn undead (DMG III)                                               */
/* ------------------------------------------------------------------ */
export function turningLevel(actor) {
  if (!isPC(actor)) return 0;
  let lvl = 0;
  for (const c of actor.system.classInfo) {
    if (classIs(c.key, "cleric") && !CLASSES[c.key]?.noTurning) lvl = Math.max(lvl, c.level + (CLASSES[c.key]?.turnUndeadOffset ?? 0));
    // DMG p.75: paladins turn undead as a cleric two levels below their level
    if (c.key === "paladin" || c.key === "paladinUA") lvl = Math.max(lvl, c.level - 2);
  }
  return lvl;
}

export function turnUndeadRows(actor) {
  const col = turnUndeadColumn(turningLevel(actor));
  if (col === null) return null;
  return TURN_UNDEAD.map(r => ({ key: r.key, label: r.label, value: r.v[col] ?? "—", possible: r.v[col] !== null }));
}

export async function rollTurnUndead(actor, key) {
  const col = turnUndeadColumn(turningLevel(actor));
  const row = TURN_UNDEAD.find(r => r.key === key);
  if (col === null || !row) return;
  const v = row.v[col];
  if (v === null) return ui.notifications.info(`No effect is possible on ${row.label.toLowerCase()} at this level.`);
  const rolls = [];
  let success, natural = null;
  if (typeof v === "number") {
    const r = await evalRoll("1d20");
    rolls.push(r); natural = r.total; success = r.total >= v;
  } else success = true;
  let number = null, numberFormula = null;
  if (success) {
    numberFormula = key === "special" ? "1d2" : (v === "D*" ? "1d6 + 6" : "1d12");
    const n = await evalRoll(numberFormula);
    rolls.push(n); number = n.total;
  }
  const outcome = !success ? "Failed. No further attempt can be made against these undead."
    : v === "T" ? "Turned automatically." : String(v).startsWith("D") ? "Destroyed (good) / made friendly (evil)." : "Turned.";
  return postCard(actor, "turn", {
    title: `Turn Undead: ${row.label}`, needed: v, natural, success, number, numberFormula, outcome,
    duration: success && !String(v).startsWith("D") ? "Good clerics drive them off for 3-12 rounds." : ""
  }, { rolls, flags: { type: "turn" } });
}

/* ------------------------------------------------------------------ */
/*  Hit points                                                          */
/* ------------------------------------------------------------------ */
export async function rollLevelHP(actor, classIndex) {
  const c = actor.system.classInfo[classIndex];
  if (!c) return;
  const hd = R.levelHitDice(c.key, c.level);
  const die = c.hitDie;
  const con = actor.system.mods.con.hpAdj;
  // PHB p.19: multi-classed characters divide by the number of classes. Bards and dual-classed humans add to existing dice.
  const dual = actor.system.details.dualClass || actor.system.classInfo.some(x => x.def.dualClass);
  const nClasses = dual ? 1 : (actor.system.classInfo.length || 1);
  let raw, perDie = [], rolls = [], formula = null, note = "";
  if (hd.formula) {
    // UA p.15: cavaliers (and UA paladins) start with 1d10+3; constitution applies to that die
    const r = await evalRoll(hd.formula);
    rolls.push(r); formula = hd.formula;
    perDie = r.dice[0].results.map(x => x.result);
    raw = Math.max(1, r.total + con);
  } else if (hd.dice > 0) {
    const r = await evalRoll(`${hd.dice}d${die}`);
    rolls.push(r);
    perDie = r.dice[0].results.map(x => x.result);
    // PHB p.12: constitution adjusts each hit die, but never reduces a die below 1
    raw = perDie.reduce((t, x) => t + Math.max(1, x + con), 0);
  } else if (hd.fixed === null) {
    return ui.notifications.warn(`${c.label}: the book gives no hit point rule beyond level ${c.def.maxHD}. Add hit points by hand.`);
  } else {
    raw = hd.fixed;
    if (c.key === "bard" && c.level <= 1) note = "Bards keep the hit dice earned as a fighter (and thief); no new die at 1st bard level.";
  }
  const gained = nClasses > 1 ? Math.round(raw / nClasses) : raw;
  return postCard(actor, "hp", {
    title: `Hit Points: ${c.label} level ${c.level}`,
    dice: formula ?? (hd.dice ? `${hd.dice}d${die}` : null), perDie: perDie.join(", "), con: (hd.dice || formula) ? signed(con) : null,
    fixed: (hd.dice || formula) ? null : hd.fixed, raw, divided: nClasses > 1 ? nClasses : null, gained, note
  }, { rolls, flags: { type: "hp", actorUuid: actor.uuid, amount: gained } });
}

export async function addHPFromCard(message) {
  const f = message.flags?.[SYSTEM_ID];
  const actor = await fromUuid(f.actorUuid);
  if (!actor?.isOwner) return;
  await actor.update({ "system.hp.max": actor.system.hp.max + f.amount, "system.hp.value": actor.system.hp.value + f.amount });
  ui.notifications.info(`${actor.name}: +${f.amount} maximum hit points.`);
}

/**
 * The roll formula for a monster's hit dice as printed: plain dice ("4+2" = 4d8+2, "1-1" = 1d8-1,
 * "1/2" = 1d4), d10 dice ("9 (10-sided dice)"), a fixed number ("22 hit points") or a range of
 * hit points ("1-4 hit points" = 1d4). Null when the entry cannot be rolled ("See below").
 */
export function hpFormulaFor(hd) {
  const s = String(hd ?? "").trim();
  let m = s.match(/^(\d+)\s*(?:hit points?|hits points|hp\b|h\/p\b)/i);
  if (m) return m[1];
  m = s.match(/^(\d+)\s*-\s*(\d+)\s*(?:hit points?\b|hp\b)/i);
  if (m) { const a = +m[1], b = +m[2]; return a === 1 ? `1d${b}` : `1d${b - a + 1} + ${a - 1}`; }
  m = s.match(/^[½1]\s*\/?\s*2?\s*\((\d+)\s*-\s*(\d+)\s*hit points?\)/i);
  if (m) { const a = +m[1], b = +m[2]; return a === 1 ? `1d${b}` : `1d${b - a + 1} + ${a - 1}`; }
  m = s.match(/^(\d+)\s*\(10-sided dice\)/i);
  if (m) return `${m[1]}d10`;
  m = s.match(/^(\d+)\s*\+\s*(\d+)\s*-\s*(\d+)$/);       // MM giants: "12+2-7" = 12 dice plus 2-7 points
  if (m) { const a = +m[2], b = +m[3]; return `${m[1]}d8 + 1d${b - a + 1}${a > 1 ? ` + ${a - 1}` : ""}`; }
  if (/^¼|^1\s*\/\s*4/.test(s)) return "1d2";
  if (!/^\d/.test(s.replace("½", "1/2"))) return null;
  if (R.hdRange(s)) return null;      // a range of hit dice ("6-8"): which one depends on the creature
  const { dice, plus, minus, fraction } = R.parseHitDice(s);
  return fraction ? "1d4" : `${dice}d8${plus ? ` + ${plus}` : ""}${minus ? ` - ${minus}` : ""}`;
}

const AGES = ["Very young", "Young", "Sub-adult", "Young adult", "Adult", "Old", "Very old", "Ancient"];

/**
 * Roll a monster's hit points and post a card. Uses the book's own method where it differs from
 * plain d8s: a choice of hit dice (hpOptions), separately tracked parts (hpParts), and FF oriental
 * dragons (hpByAge: d8 for size, 1-2 small / 3-7 average / 8 huge, sets the hit dice; d8 for age
 * sets the hit points per die). Returns the new maximum, or null if nothing was rolled.
 */
export async function rollMonsterHP(actor) {
  const s = actor.system;
  const rolls = [], lines = [];
  let hp = null, label = "", extra = {};
  const esc = t => foundry.utils.escapeHTML(String(t));
  if (s.hpNoRoll) {
    ui.notifications.warn(`${actor.name}: hit points cannot be rolled. ${s.hpNote || "Set them by hand."}`);
    return null;
  }
  if (s.hpByAge) {
    const range = String(s.hd).match(/(\d+)\s*-\s*(\d+)/);
    if (!range) return ui.notifications.warn(`${actor.name}: the hit dice are not a range, so size cannot set them.`), null;
    const lo = +range[1], hi = +range[2];
    const plus = Number(s.hpAgePlus) || 0;
    const split = s.hpSizeSplit?.length === 3 ? s.hpSizeSplit : null;     // d% bands, e.g. [25, 75, 100]
    const big = split ? "Large" : "Huge";
    const sizeRoll = split ? `Roll d% (${split[0]}% small, ${split[1] - split[0]}% average, ${split[2] - split[1]}% large)` : "Roll d8 (1-2 small, 3-7 average, 8 huge)";
    const sizes = [["roll", sizeRoll], ["0", `Small (${lo} HD)`], ["1", `Average (${lo + 1} HD)`], ["2", `${big} (${hi} HD)`]];
    const ages = [["roll", "Roll d8"], ...AGES.map((a, i) => [String(i + 1), `${a} (${i + 1 + plus} per die)`])];
    const opt = await foundry.applications.api.DialogV2.wait({
      window: { title: `Hit points: ${actor.name}` }, classes: ["frpg1e-dialog"], rejectClose: false,
      content: `<div class="form-group"><label>Size</label><select name="size">${sizes.map(([v, t]) => `<option value="${v}">${esc(t)}</option>`).join("")}</select></div>
        <div class="form-group"><label>Age</label><select name="age">${ages.map(([v, t]) => `<option value="${v}">${esc(t)}</option>`).join("")}</select></div>`,
      buttons: [{ action: "roll", label: "Roll", default: true, callback: (e, b) => ({ size: b.form.elements.size.value, age: b.form.elements.age.value }) },
        { action: "cancel", label: "Cancel" }]
    });
    if (!opt || opt === "cancel") return null;
    let size = opt.size, age = opt.age;
    if (size === "roll") {
      if (split) { const r = await evalRoll("1d100"); rolls.push(r); size = r.total <= split[0] ? 0 : r.total <= split[1] ? 1 : 2; lines.push(`Size roll ${r.total} (d%).`); }
      else { const r = await evalRoll("1d8"); rolls.push(r); size = r.total <= 2 ? 0 : r.total <= 7 ? 1 : 2; lines.push(`Size roll ${r.total}.`); }
    }
    if (age === "roll") { const r = await evalRoll("1d8"); rolls.push(r); age = r.total; lines.push(`Age roll ${r.total}.`); }
    size = Number(size); age = Number(age);
    const hd = [lo, lo + 1, hi][size];
    const perDie = age + plus;
    hp = hd * perDie;
    label = `${["Small", "Average", big][size]}, ${AGES[age - 1].toLowerCase()}: ${hd} HD × ${perDie} per die`;
    // FF p.28 and the MMII dragons (general notes): at 5 or more hit points per die a dragon saves as total
    // hit points ÷ 4 hit dice; below that (even very young) it saves by its actual hit dice. Rounding is not stated: rounded down here.
    if (/^(FF|MMII)/.test(s.source)) {
      const saveLevel = perDie >= 5 ? Math.floor(hp / 4) : hd;
      extra = { "system.attackAs": String(hd), "system.saveAs.level": saveLevel };
      lines.push(`Attacks as ${hd} HD; saves as ${saveLevel} HD.`);
    } else {
      extra = { "system.attackAs": String(hd) };
      lines.push(`Attacks and saves as ${hd} HD.`);
    }
  } else {
    let formula = null;
    if (s.hpOptions.length > 1) {
      const opt = await foundry.applications.api.DialogV2.wait({
        window: { title: `Hit points: ${actor.name}` }, classes: ["frpg1e-dialog"], rejectClose: false,
        content: `<div class="form-group"><label>Kind</label><select name="opt">${s.hpOptions.map((o, i) => `<option value="${i}">${esc(o.label)} (${esc(o.formula)})</option>`).join("")}</select></div>`,
        buttons: [{ action: "roll", label: "Roll", default: true, callback: (e, b) => Number(b.form.elements.opt.value) }, { action: "cancel", label: "Cancel" }]
      });
      if (opt === null || opt === "cancel" || opt === undefined) return null;
      ({ formula, label } = s.hpOptions[opt]);
      if (s.hpOptions[opt].hd) extra = { "system.attackAs": s.hpOptions[opt].hd };
    } else if (s.hpOptions.length === 1) {
      ({ formula, label } = s.hpOptions[0]);
      if (s.hpOptions[0].hd) extra = { "system.attackAs": s.hpOptions[0].hd };
    }
    else if (R.hdRange(s.hd)) {
      // MM p.5 gives no rule for picking within a printed range of hit dice: the DM chooses
      const [lo, hi] = R.hdRange(s.hd);
      const n = await foundry.applications.api.DialogV2.wait({
        window: { title: `Hit points: ${actor.name}` }, classes: ["frpg1e-dialog"], rejectClose: false,
        content: `<div class="form-group"><label>Hit dice (${lo}-${hi})</label><input type="number" name="hd" value="${lo}" min="${lo}" max="${hi}"></div>
          <p class="hint">The entry gives a range of hit dice; pick this one's (the text may say how, e.g. by size).</p>`,
        buttons: [{ action: "roll", label: "Roll", default: true, callback: (e, b) => Number(b.form.elements.hd.value) }, { action: "cancel", label: "Cancel" }]
      });
      if (!n || n === "cancel") return null;
      const hd = Math.min(hi, Math.max(lo, Math.round(n)));
      formula = `${hd}d8`; label = `${hd} HD`;
      extra = { "system.attackAs": String(hd) };
    }
    else formula = hpFormulaFor(s.hd);
    if (!formula) {
      ui.notifications.warn(`${actor.name}: hit points cannot be rolled from "${s.hd}". ${s.hpNote || "Set them by hand."}`);
      return null;
    }
    const r = await evalRoll(formula);
    rolls.push(r);
    hp = Math.max(1, r.total);
    label = `${label ? `${label}: ` : ""}${formula}`;
  }
  for (const part of s.hpParts) {
    const vals = [];
    for (let i = 0; i < part.count; i++) { const r = await evalRoll(part.formula); rolls.push(r); vals.push(Math.max(1, r.total)); }
    lines.push(`${esc(part.label)} (${esc(part.formula)}${part.count > 1 ? ` each` : ""}): ${vals.join(", ")} hit points. Track these separately.`);
  }
  if (extra["system.attackAs"] && !s.hpByAge) lines.push(`Attacks as ${esc(extra["system.attackAs"])} HD.`);
  if (s.hpNote) lines.push(esc(s.hpNote));
  await actor.update({ "system.hp.value": hp, "system.hp.max": hp, ...extra });
  const content = `<div class="frpg1e chat-card"><h3>${esc(actor.name)}: hit points</h3>
    <div class="result hit">${hp} hit points</div><div class="hint">${esc(label)}</div>
    ${lines.map(l => `<p class="hint">${l}</p>`).join("")}</div>`;
  const msg = { speaker: ChatMessage.getSpeaker({ actor }), content, rolls };
  ChatMessage.applyMode(msg);
  await ChatMessage.create(msg);
  return hp;
}

/* ------------------------------------------------------------------ */
/*  Spells                                                              */
/* ------------------------------------------------------------------ */
const LIST_LABELS = { cleric: "Cleric", druid: "Druid", magicuser: "Magic-User", illusionist: "Illusionist" };

/** Options for the catalogued rolls of a spell or item (level, @X, function, choices). Null if cancelled. */
async function rollOptions(title, rolls, { level = null, levelLabel, levelHint, functions = [] } = {}) {
  const entries = rolls.map((r, i) => ({ r, i }));
  return Dice.askRollOptions({
    title,
    level: Dice.usesVar(rolls, "L") ? level ?? 1 : null,
    levelLabel, levelHint,
    x: rolls.find(r => r.x && Dice.usesVar([r], "X"))?.x ?? null,
    functions,
    choiceRolls: entries.filter(({ r }) => (r.choices?.length ?? 0) > 1)
  });
}

export async function castSpell(actor, item) {
  const s = item.system;
  if (s.memorized < 1) return ui.notifications.warn(`${item.name} is not memorized.`);
  const catalogued = s.rolls ?? [];
  let opts = null;
  if (catalogued.length) {
    opts = await rollOptions(item.name, catalogued, {
      level: Dice.defaultLevel(actor, s.list), levelLabel: "Caster level",
      levelHint: "Prefilled from the caster's class level for this spell list; change it if the spell is cast at another level."
    });
    if (!opts) return;
  }
  await item.update({ "system.memorized": s.memorized - 1 });
  const rolls = [];
  let failure = null;
  // PHB Wisdom Table II: chance of spell failure for clerics and druids with low wisdom
  // (the table covers druids too per the errata in The Dragon #35)
  if (isPC(actor) && ((s.list === "cleric" && actor.system.classInfo.some(c => classIs(c.key, "cleric")))
      || (s.list === "druid" && actor.system.classInfo.some(c => classIs(c.key, "druid"))))) {
    const chance = actor.system.mods.wis.spellFailure;
    if (chance) {
      const r = await evalRoll("1d100");
      rolls.push(r);
      failure = { chance, roll: r.total, failed: r.total <= chance };
    }
  }
  let dmgRoll = null, healRoll = null, resultsHTML = "";
  if (s.damage && !failure?.failed) {
    dmgRoll = await evalRoll(R.damageFormula(s.damage));
    rolls.push(dmgRoll);
  }
  if (s.heal && !failure?.failed) {
    healRoll = await evalRoll(s.heal);
    rolls.push(healRoll);
  }
  if (catalogued.length && !failure?.failed) {
    const out = await Dice.runRolls(catalogued.map((r, i) => ({ r, i })), opts);
    rolls.push(...out.rolls);
    resultsHTML = await Dice.renderResults(out.results);
  }
  const targets = Array.from(game.user.targets).map(t => t.document.uuid);
  const levelNote = opts?.level !== null && opts?.level !== undefined ? `Cast at level ${opts.level}.` : "";
  if (healRoll) return postCard(actor, "spell", {
    title: item.name, img: item.img, s, failure, heal: healRoll.total, healMode: s.healMode, resultsHTML, levelNote,
    healText: s.healMode === "allBut" ? `Heals all hit points except ${healRoll.total}` : s.healMode === "temp" ? `+${healRoll.total} hit points, even above maximum, for the spell's duration` : `Heals ${healRoll.total} hit points`,
    reversedDamage: s.reversible && !s.healMode,
    listLabel: LIST_LABELS[s.list]
  }, { rolls, flags: { type: "heal", amount: healRoll.total, mode: s.healMode, targets } });
  return postCard(actor, "spell", {
    title: item.name, img: item.img, s, failure, damage: dmgRoll?.total ?? null, resultsHTML, levelNote,
    listLabel: LIST_LABELS[s.list]
  }, { rolls, flags: { type: dmgRoll ? "damage" : "spell", amount: dmgRoll?.total ?? 0, targets } });
}

/* ------------------------------------------------------------------ */
/*  Encounter: surprise and side initiative (DMG p.61-62)              */
/* ------------------------------------------------------------------ */
export async function rollSurprise({ partyChance = 2, foeChance = 2 } = {}) {
  const p = await evalRoll("1d6");
  const m = await evalRoll("1d6");
  const pS = p.total <= partyChance, mS = m.total <= foeChance;
  let text;
  if (pS && mS) {
    const diff = Math.abs(p.total - m.total);
    text = diff === 0 ? "Both sides surprised equally: no effect."
      : `Both surprised. ${p.total < m.total ? "The party" : "The monsters"} lose ${diff} segment${diff > 1 ? "s" : ""}.`;
  } else if (pS) text = `The party is surprised for ${p.total} segment${p.total > 1 ? "s" : ""}.`;
  else if (mS) text = `The monsters are surprised for ${m.total} segment${m.total > 1 ? "s" : ""}.`;
  else text = "No one is surprised.";
  const content = await renderTemplate(`systems/${SYSTEM_ID}/templates/chat/surprise.hbs`, {
    party: p.total, foe: m.total, partyChance, foeChance, pS, mS, text
  });
  const msg = { speaker: { alias: "Surprise" }, content, rolls: [p, m] };
  ChatMessage.applyMode(msg);
  return ChatMessage.create(msg);
}

export { SAVE_KEYS };

/* ------------------------------------------------------------------ */
/*  Sheet helper: "adjusted to hit armor class" row for a weapon        */
/* ------------------------------------------------------------------ */
/**
 * Score needed on the d20 against AC 10 down to AC 0 with this weapon, after
 * every roll modifier the attacker always has (strength or dexterity, magic,
 * proficiency) and the weapon vs. armor type adjustment for that armor class.
 * This is the row printed on the TSR record sheet.
 */
export function weaponToHitRow(actor, item, { missile = null } = {}) {
  const profile = attackerProfile(actor);
  const w = item?.system;
  const useMissile = missile ?? (w ? w.attackType === "missile" : false);
  let mod = 0;
  if (isPC(actor)) {
    const m = actor.system.mods;
    mod += useMissile ? m.dex.reaction : m.str.hit;
    mod += actor.system.combat.hitMisc + (useMissile ? actor.system.combat.missileMisc : 0);
    if (w && !w.proficient && !w.natural) mod += profile.nonProf;
  }
  if (w) mod += w.magic.hit + w.bonus.hit;
  mod += perLevelBonus(profile);
  if (w?.choice && w.choice !== "lance" && profile.cavalierLevel) mod += cavalierChoiceBonus(w.choice, profile.cavalierLevel);
  const spec = specialization(profile, item, useMissile, "short");
  if (spec) mod += spec.hit;
  const useAdj = setting("weaponVsArmor") && w && !w.natural;
  const table = w ? (useMissile ? w.missile.acAdj : w.acAdj) : null;
  const row = [];
  for (let ac = 10; ac >= 0; ac--) {
    const adj = useAdj ? R.weaponArmorAdj(table, ac) : 0;
    row.push({ ac, need: neededToHit(profile, ac).score - mod - adj });
  }
  return row;
}

export { attackerProfile, neededToHit };

/* ------------------------------------------------------------------ */
/*  Magic items                                                         */
/* ------------------------------------------------------------------ */
const TextEditorImpl = () => foundry.applications.ux.TextEditor.implementation;
/** Drink a potion, read a scroll, use a charge, or show the item. */
export async function useMagicItem(actor, item) {
  const s = item.system;
  if (s.heal) return useHealingItem(actor, item);
  if (s.rolls?.length) return useRolledItem(actor, item);
  let usage = "", update = null;
  if (["potion", "scroll"].includes(s.category)) {
    if (s.quantity < 1) return ui.notifications.warn(`${actor.name} has no ${item.name} left.`);
    update = { "system.quantity": s.quantity - 1 };
    usage = `${s.category === "potion" ? "Drinks" : "Reads"} it${s.quantity - 1 ? ` (${s.quantity - 1} left)` : " (none left)"}.`;
  } else if (["wand", "staff", "rod"].includes(s.category) && s.charges.max > 0) {
    if (s.charges.value < 1) return ui.notifications.warn(`${item.name} has no charges left.`);
    update = { "system.charges.value": s.charges.value - 1 };
    usage = `Uses a charge: ${s.charges.value - 1} of ${s.charges.max} left.`;
  } else if (["wand", "staff", "rod"].includes(s.category)) {
    usage = "Charges are not set on this item; set them on its sheet to track them (DMG: typically found with fewer than full charges).";
  }
  if (update) await item.update(update);
  const description = await TextEditorImpl().enrichHTML(s.description ?? "", { relativeTo: item });
  return postCard(actor, "item", { item, s, description, usage }, { flags: { type: "item" } });
}

/**
 * Items whose descriptions print dice (system.rolls): choose the function, pay its
 * charges (or use up the potion or scroll), roll, and post the results.
 * "Determine type (when found)" rolls cost nothing; a "Charges" result there sets the charges.
 */
async function useRolledItem(actor, item) {
  const s = item.system;
  const rolls = s.rolls;
  let functions = Dice.itemFunctions(rolls);
  const hasFns = functions.length > 0;
  if (rolls.some(r => !r.fn) && !functions.some(o => o.fn !== Dice.FIND_FN)) functions = [{ fn: "", charges: 0 }, ...functions];
  if (!functions.length) functions = [{ fn: "", charges: 0 }];
  const labelled = functions.map(o => ({ ...o, fn: o.fn || (s.category === "potion" ? "Drink" : s.category === "scroll" ? "Read" : "Use") }));
  const opts = await rollOptions(item.name, rolls, {
    level: Dice.defaultLevel(actor, /C/.test(s.usable ?? "") ? "cleric" : null), levelLabel: "Level of the user",
    functions: labelled
  });
  if (!opts) return;
  const pick = functions[Math.max(0, labelled.findIndex(o => o.fn === opts.fn))];
  const fn = pick.fn;
  const finding = fn === Dice.FIND_FN;
  let usage = "", update = {};
  if (finding) usage = "Rolled for the item as found; nothing is used up.";
  else if (["potion", "scroll"].includes(s.category)) {
    if (s.quantity < 1) return ui.notifications.warn(`${actor.name} has no ${item.name} left.`);
    update["system.quantity"] = s.quantity - 1;
    usage = `${s.category === "potion" ? "Drinks" : "Reads"} it${s.quantity - 1 ? ` (${s.quantity - 1} left)` : " (none left)"}.`;
  } else {
    const cost = hasFns ? pick.charges : (["wand", "staff", "rod"].includes(s.category) ? 1 : 0);
    if (cost && s.charges.max > 0) {
      if (s.charges.value < cost) return ui.notifications.warn(`${item.name} has ${s.charges.value} charge${s.charges.value === 1 ? "" : "s"}; ${fn || "this"} needs ${cost}.`);
      update["system.charges.value"] = s.charges.value - cost;
      usage = `Uses ${cost} charge${cost > 1 ? "s" : ""}: ${s.charges.value - cost} of ${s.charges.max} left.`;
    } else if (cost) usage = `Uses ${cost} charge${cost > 1 ? "s" : ""}. Charges are not set on this item; set them on its sheet to track them.`;
  }
  const entries = Dice.rollsForFunction(rolls, fn);
  const out = await Dice.runRolls(entries, opts);
  if (finding) {
    const ch = out.results.find(r => /^charges/i.test(r.label));
    if (ch) { update["system.charges.value"] = ch.total; update["system.charges.max"] = ch.total; usage += ` Charges set to ${ch.total}.`; }
  }
  if (Object.keys(update).length) await item.update(update);
  const resultsHTML = await Dice.renderResults(out.results);
  const description = await TextEditorImpl().enrichHTML(s.description ?? "", { relativeTo: item });
  const targets = Array.from(game.user.targets).map(t => t.document.uuid);
  return postCard(actor, "item", { item, s, description, usage, resultsHTML, fnLabel: fn ? (finding ? "When found" : fn) : "" },
    { rolls: out.rolls, flags: { type: "rolls", targets } });
}

/** Potions, ointments and staves that restore hit points (formulas from their descriptions). */
async function useHealingItem(actor, item) {
  const s = item.system;
  const isPotion = s.category === "potion";
  if (isPotion && s.quantity < 1) return ui.notifications.warn(`${actor.name} has no ${item.name} left.`);
  if (!isPotion && s.charges.max > 0 && s.charges.value < 1) return ui.notifications.warn(`${item.name} has no charges or applications left.`);
  let formula = s.heal, part = "whole";
  const update = {};
  // DMG: extra-healing restores 3d8+3 when wholly consumed, or 1d8 for each one-third of the potion
  if (isPotion && s.healThird) {
    const fresh = s.charges.value >= s.charges.max;
    part = await DialogV2.wait({
      window: { title: item.name }, classes: ["frpg1e-dialog"], rejectClose: false,
      content: `<p>Drink the whole potion (${s.heal}) or one third (${s.healThird})? ${fresh ? "" : `<br><em>This potion is partly drunk (${s.charges.value} of ${s.charges.max} thirds left).</em>`}</p>`,
      buttons: [
        ...(fresh ? [{ action: "whole", label: `Whole (${s.heal})`, default: true }] : []),
        { action: "third", label: `One third (${s.healThird})`, default: !fresh }
      ]
    });
    if (!part) return;
    if (part === "third") {
      formula = s.healThird;
      const left = s.charges.value - 1;
      if (left <= 0) { update["system.quantity"] = s.quantity - 1; update["system.charges.value"] = s.charges.max; }
      else update["system.charges.value"] = left;
    } else update["system.quantity"] = s.quantity - 1;
  } else if (isPotion) update["system.quantity"] = s.quantity - 1;
  else if (s.charges.max > 0) update["system.charges.value"] = s.charges.value - 1;
  if (Object.keys(update).length) await item.update(update);

  const r = await evalRoll(formula);
  const description = await TextEditorImpl().enrichHTML(s.description ?? "", { relativeTo: item });
  let usage, flags = { type: "heal", amount: r.total, mode: "", targets: Array.from(game.user.targets).map(t => t.document.uuid) };
  if (s.healTarget === "self") {
    const [done] = await healActors([actor], r.total);
    usage = `${part === "third" ? "Drinks one third" : "Drinks it"} and regains ${r.total} hit points${done ? ` (${done.before} → ${done.after})` : ""}.`;
    flags.applied = true;
  } else {
    usage = `Heals ${r.total} hit points. Target or select who receives it, then click Apply healing.`;
  }
  return postCard(actor, "item", { item, s, description, usage, heal: r.total, formula, applyButton: s.healTarget !== "self" }, { rolls: [r], flags });
}

/* ------------------------------------------------------------------ */
/*  Nonweapon proficiency checks (WSG p.11-12; DSG p.23)                */
/* ------------------------------------------------------------------ */
const ABILITY_NAMES = { str: "Strength", int: "Intelligence", wis: "Wisdom", dex: "Dexterity", con: "Constitution", cha: "Charisma" };
/** DM-only checks: the WSG says the DM always rolls these in secret. */
const SECRET_PROFS = new Set(["Direction Sense", "Weather sense"]);

/**
 * Proficiency Check, as the WSG gives it: roll d20, add the proficiency's die roll modifier, -2 for each
 * slot spent improving it, and any situational modifier; succeed if the result is at or under the
 * ability score, counting scores above 18 as 18. An unmodified 20 always fails, and so does an
 * unmodified 19 unless the proficiency has been improved.
 */
export function proficiencyCheck({ raw, ability, modifier = 0, improvements = 0, situational = 0 }) {
  const target = Math.min(18, ability);
  const total = raw + modifier - 2 * improvements + situational;
  const autoFail = raw === 20 || (raw === 19 && improvements < 1);
  const success = !autoFail && total <= target;
  return { raw, total, target, autoFail, success, margin: target - total };
}

export async function rollProficiency(actor, item, { fast = false } = {}) {
  const p = item.system;
  const description = await TextEditorImpl().enrichHTML(p.description ?? "", { relativeTo: item });
  if (item.name === "Tracking" && !p.check) return rollTracking(actor, item, description);
  if (!p.check || !p.ability) {
    return postCard(actor, "proficiency", { item, p, description, noCheck: true }, { flags: { type: "proficiency" } });
  }
  const score = actor.system.abilities?.[p.ability]?.value ?? 10;
  let situational = 0;
  if (!fast) {
    const res = await DialogV2.wait({
      window: { title: `${item.name}: Proficiency Check` }, classes: ["frpg1e-dialog"], rejectClose: false,
      content: `<div class="frpg1e-roll-options">
        <p>${ABILITY_NAMES[p.ability]} ${score}${score > 18 ? " (counts as 18)" : ""}; die roll modifier ${p.modifier >= 0 ? "+" : ""}${p.modifier}${p.improvements ? `, improved ${p.improvements}× (−${2 * p.improvements})` : ""}.</p>
        <div class="form-group"><label>Situational die roll modifier</label><input type="number" name="sit" value="0"></div>
        <p class="hint">Added to the d20: positive is harder (e.g. +4 for direction sense in total darkness, +3 or +6 for bonds, +2 per extra weather sense check that day).</p></div>`,
      buttons: [{ action: "roll", label: "Roll", default: true, callback: (e, b) => Number(b.form.elements.sit?.value) || 0 }]
    });
    if (res === null || res === undefined) return;
    situational = res;
  }
  const roll = await evalRoll("1d20");
  const r = proficiencyCheck({ raw: roll.total, ability: score, modifier: p.modifier, improvements: p.improvements, situational });
  const mods = [];
  if (p.modifier) mods.push(`${p.modifier > 0 ? "+" : ""}${p.modifier} proficiency`);
  if (p.improvements) mods.push(`−${2 * p.improvements} improved`);
  if (situational) mods.push(`${situational > 0 ? "+" : ""}${situational} situation`);
  const secret = SECRET_PROFS.has(item.name);
  const content = await renderTemplate(`systems/${SYSTEM_ID}/templates/chat/proficiency.hbs`, {
    actor, item, p, description, r, mods: mods.join(", "), abilityLabel: ABILITY_NAMES[p.ability], score, capped: score > 18, secret,
    resultText: r.autoFail ? `Unmodified ${r.raw}: automatic failure` : r.success ? `Success by ${r.margin}` : `Failure by ${-r.margin}`
  });
  const msg = { speaker: ChatMessage.getSpeaker({ actor }), content, rolls: [roll], flags: { [SYSTEM_ID]: { type: "proficiency" } } };
  if (secret) {
    msg.whisper = ChatMessage.getWhisperRecipients("GM").map(u => u.id);
    msg.blind = true;
    if (!game.user.isGM) ui.notifications.info(`${item.name}: the DM rolls this check in secret.`);
  } else ChatMessage.applyMode(msg);
  return ChatMessage.create(msg);
}

/** WSG p.17: tracking as a ranger does, at half the chance: 5% per level plus 5%, at most 55%. */
async function rollTracking(actor, item, description) {
  const level = isPC(actor) ? Math.max(1, ...actor.system.classInfo.map(c => c.level)) : 1;
  const chance = Math.min(55, 5 * level + 5);
  return rollPercent(actor, `${item.name} (base chance; apply the UA ranger tracking modifiers)`, chance,
    { note: "WSG p.17: 5% per level plus 5%, up to 55%. Multi-class characters use their highest level here." });
}

/* ------------------------------------------------------------------ */
/*  Ability Checks (DSG p.12, WSG p.6)                                  */
/* ------------------------------------------------------------------ */
/**
 * WSG p.6: roll 1d20, add any modifier (positive is harder), succeed at or under the score.
 * Scores above 18 count as 18, and an unmodified 19 or 20 always fails.
 * DSG p.12: a check may call for other dice ("a 4d6 Dexterity Check"): roll the score or less.
 * With other dice the WSG's d20 limits are not applied.
 */
export function abilityCheck({ dice = "1d20", raw, score, modifier = 0 }) {
  const d20 = dice.replace(/\s+/g, "") === "1d20";
  const target = d20 ? Math.min(18, score) : score;
  const total = raw + modifier;
  const autoFail = d20 && raw >= 19;
  return { raw, total, target, autoFail, success: !autoFail && total <= target, margin: target - total, d20 };
}

export async function rollAbilityCheck(actor, key, { fast = false } = {}) {
  const score = actor.system.abilities?.[key]?.value;
  if (score === undefined) return;
  const label = ABILITY_NAMES[key];
  let modifier = 0, dice = "1d20";
  if (!fast) {
    const res = await DialogV2.wait({
      window: { title: `${label} Check` }, classes: ["frpg1e-dialog"], rejectClose: false,
      content: `<div class="frpg1e-roll-options">
        <p>${label} ${score}${score > 18 ? " (counts as 18 on a d20)" : ""}: roll at or under the score.</p>
        <div class="form-group"><label>Die roll modifier</label><input type="number" name="mod" value="0"></div>
        <div class="form-group"><label>Dice</label><select name="dice">
          <option value="1d20" selected>1d20</option><option value="2d10">2d10</option><option value="3d6">3d6</option>
          <option value="4d6">4d6</option><option value="5d6">5d6</option><option value="6d6">6d6</option></select></div>
        <p class="hint">The modifier is added to the roll: positive is harder. Some rules call for other dice (DSG: "a 4d6 Dexterity Check").</p></div>`,
      buttons: [{ action: "roll", label: "Roll", default: true,
        callback: (e, b) => ({ mod: Number(b.form.elements.mod?.value) || 0, dice: b.form.elements.dice?.value || "1d20" }) }]
    });
    if (!res) return;
    modifier = res.mod; dice = res.dice;
  }
  const roll = await evalRoll(dice);
  const r = abilityCheck({ dice, raw: roll.total, score, modifier });
  return postCard(actor, "ability", {
    label, score, r, dice, modifier, capped: r.d20 && score > 18,
    resultText: r.autoFail ? `Unmodified ${r.raw}: automatic failure` : r.success ? `Success by ${r.margin}` : `Failure by ${-r.margin}`
  }, { rolls: [roll], flags: { type: "ability" } });
}

/* ------------------------------------------------------------------ */
/*  Class ability rolls: ranger tracking, assassination, disguise       */
/* ------------------------------------------------------------------ */
const opts = list => list.map(o => `<option value="${o.value}">${o.label}</option>`).join("");

/** UA p.21-22 ranger tracking (barbarians: as a ranger of the same level, outdoors only, UA p.21). */
export async function rollRangerTracking(actor, { level, label = "Ranger", outdoorOnly = false, fast = false } = {}) {
  const base = CF.rangerTrackBase(level);
  let o = { indoor: false, terrain: 0, hidden: false, creatures: 1, hours: 0, rainHours: 0, overtracked: false, poor: false };
  if (!fast) {
    const res = await DialogV2.wait({
      window: { title: "Tracking" }, classes: ["frpg1e-dialog"], rejectClose: false,
      content: `<div class="frpg1e-roll-options">
        <p>${label} ${level}: base ${base}% (UA p.21: 10% per level plus 10%, at most 110%).</p>
        ${outdoorOnly ? "" : `<div class="form-group"><label>Where</label><select name="where"><option value="out">Outdoors</option><option value="in">Indoors / underground</option></select></div>`}
        <div class="form-group"><label>Outdoor terrain</label><select name="terrain">${opts(CF.TRACK_TERRAIN.map(t => ({ ...t, label: t.label })))}</select></div>
        ${outdoorOnly ? "" : `<div class="form-group"><label>Indoor surface</label><select name="surface">${opts(CF.TRACK_SURFACE)}</select></div>`}
        <div class="form-group"><label>Creatures tracked</label><input type="number" name="creatures" value="1" min="1"></div>
        <div class="form-group"><label>Hours since trail made (outdoors)</label><input type="number" name="hours" value="0" min="0"></div>
        <div class="form-group"><label>Hours of precipitation (outdoors)</label><input type="number" name="rain" value="0" min="0"></div>
        <label><input type="checkbox" name="hidden"> Intelligent efforts made to hide the trail (one category worse)</label>
        ${outdoorOnly ? "" : `<label><input type="checkbox" name="over"> Indoors: other creatures cross or overtrack the trail (−50%)</label>`}
        <label><input type="checkbox" name="poor"> Poor illumination (for movement rate)</label>
        <p class="hint">Indoors, tracking is impossible unless the ranger saw a distinguishing feature of the tracks, or saw the quarry make the trail and followed within a reasonable time (typically 10-30 minutes).</p></div>`,
      buttons: [{ action: "roll", label: "Track", default: true, callback: (e, b) => {
        const el = b.form.elements, indoor = el.where?.value === "in";
        return { indoor, terrain: Number(indoor ? el.surface.value : el.terrain.value), hidden: el.hidden.checked, creatures: Number(el.creatures.value) || 1,
          hours: Number(el.hours.value) || 0, rainHours: Number(el.rain.value) || 0, overtracked: el.over?.checked ?? false, poor: el.poor.checked };
      } }]
    });
    if (!res) return;
    o = res;
  }
  const t = CF.trackChance({ base, ...o });
  const where = o.indoor ? "indoors" : "outdoors";
  if (t.impossible) return postCard(actor, "percent", { title: `Tracking (${where})`, chance: 0, roll: "—", success: false,
    note: "The trail was hidden on the worst category of ground: tracking is impossible (UA p.21-22)." });
  const roll = await evalRoll("1d100");
  const modText = t.mods.filter(m => m.value).map(m => `${m.label} ${signed(m.value)}%`).join(", ");
  const note = [`Base ${base}%${modText ? `; ${modText}` : ""}${t.raw > 100 ? " (capped at 100%)" : ""}.`,
    `Movement while tracking: ${CF.trackingMove(t.chance, o.poor)} of normal.`,
    roll.total <= t.chance ? "A second roll at the same chance identifies the tracks (see the ranger box for what can be identified)." : ""].filter(Boolean).join(" ");
  return postCard(actor, "percent", { title: `Tracking (${where})`, chance: t.chance, roll: roll.total, success: roll.total <= t.chance, note },
    { rolls: [roll], flags: { type: "percent" } });
}

/** DMG p.75 Assassins' Table for Assassinations; the attack itself is rolled separately (weapon damage always applies). */
export async function rollAssassination(actor, { level, fast = false } = {}) {
  const tgt = Array.from(game.user?.targets ?? [])[0]?.actor;
  const tgtLevel = isPC(tgt) ? Math.max(0, ...tgt.system.classInfo.map(c => c.level)) : "";
  let victim = Number(tgtLevel) || 0, mod = 0;
  if (!fast) {
    const res = await DialogV2.wait({
      window: { title: "Assassination" }, classes: ["frpg1e-dialog"], rejectClose: false,
      content: `<div class="frpg1e-roll-options">
        <p>Assassin level ${level}. The victim must be surprised (PHB p.29).</p>
        <div class="form-group"><label>Victim's level${tgt ? ` (${tgt.name})` : ""}</label><input type="number" name="victim" value="${tgtLevel}" min="0" placeholder="level"></div>
        <div class="form-group"><label>DM adjustment (%)</label><input type="number" name="mod" value="0"></div>
        <p class="hint">DMG p.75: the table is for near optimum conditions; adjust up slightly for perfect conditions (asleep and unguarded, very drunk...) and down if the victim is wary, takes precautions or is guarded. Important, popular or noble victims count as higher level for fees only.</p></div>`,
      buttons: [{ action: "roll", label: "Roll", default: true, callback: (e, b) => ({ victim: Number(b.form.elements.victim.value) || 0, mod: Number(b.form.elements.mod.value) || 0 }) }]
    });
    if (!res) return;
    victim = res.victim; mod = res.mod;
  }
  const base = CF.assassinationChance(level, victim);
  const chance = Math.max(0, Math.min(100, base + mod));
  const roll = await evalRoll("1d100");
  return postCard(actor, "percent", {
    title: `Assassination (victim level ${victim})`, chance, roll: roll.total, success: roll.total <= chance,
    note: `Table ${base}%${mod ? `, DM ${signed(mod)}%` : ""}. Success is instant death. Weapon damage always applies and may kill even if the assassination fails; with a poisoned weapon the victim must also save vs. poison (PHB p.29, DMG p.75).`
  }, { rolls: [roll], flags: { type: "percent" } });
}

/** PHB p.29: chance that an observer spots a disguised assassin (checked on meeting and every 24 hours). Rolled for the GM. */
export async function rollDisguise(actor, { fast = false } = {}) {
  let o = { otherClass: false, otherRace: false, otherSex: false, intWis: 24 };
  if (!fast) {
    const res = await DialogV2.wait({
      window: { title: "Disguise" }, classes: ["frpg1e-dialog"], rejectClose: false,
      content: `<div class="frpg1e-roll-options">
        <p>Base 2% per day of being spotted, +2% for each of these (at most 8%):</p>
        <label><input type="checkbox" name="cls"> Posing as another class</label>
        <label><input type="checkbox" name="race"> Posing as another race</label>
        <label><input type="checkbox" name="sex"> Posing as the opposite sex</label>
        <div class="form-group"><label>Observer's intelligence + wisdom</label><input type="number" name="iw" value="24"></div>
        <p class="hint">−1% per point below 24, +1% per point above 30. True seeing or a wand of enemy detection finds the assassin, as may detect evil or know alignment.</p></div>`,
      buttons: [{ action: "roll", label: "Roll", default: true, callback: (e, b) => {
        const el = b.form.elements;
        return { otherClass: el.cls.checked, otherRace: el.race.checked, otherSex: el.sex.checked, intWis: Number(el.iw.value) || 24 };
      } }]
    });
    if (!res) return;
    o = res;
  }
  const chance = CF.disguiseChance(o);
  const roll = await evalRoll("1d100");
  const spotted = roll.total <= chance;
  const content = await renderTemplate(`systems/${SYSTEM_ID}/templates/chat/percent.hbs`, {
    title: `Disguise: ${spotted ? "spotted" : "not spotted"}`, chance, roll: roll.total, success: spotted,
    note: `A success here means the observer sees through the disguise. Check each observer on meeting and every 24 hours (PHB p.29).`
  });
  return ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor }), content, rolls: [roll],
    whisper: ChatMessage.getWhisperRecipients("GM").map(u => u.id), blind: true, flags: { [SYSTEM_ID]: { type: "percent" } } });
}

/* ------------------------------------------------------------------ */
/*  Brawl: weaponless combat, UA Appendix Q (System II), pp.106-108    */
/* ------------------------------------------------------------------ */
// "Fist or Open Hand" armor class adjustments, AC 0-10 (UA p.28)
export const FIST_AC_ADJ = [-9, -8, -7, -5, -3, -1, 0, 0, 2, 0, 4];
export const PUMMEL_OBJECTS = {
  smallSoft: { label: "Bare fist or foot (small, soft)", dmg: "1d2" },
  smallHard: { label: "Mailed fist, pommel or metal-shod boot (small, hard)", dmg: "1d3" },
  largeSoft: { label: "Large, soft object (e.g. a held body)", dmg: "1d4" },
  largeHard: { label: "Large, hard object (a table or chair)", dmg: "1d4" }
};
// UA p.107 Pummeling Table: % per point of strength [unexposed, semi-exposed, exposed], and the value at 18/01+
const STUN_RATE = { smallSoft: [0, 1, 2], smallHard: [1, 2, 4], largeSoft: [1, 2, 4], largeHard: [2, 4, 5] };
const STUN_CAP = { 1: 20, 2: 40, 4: 75, 5: 95 };
const VULN = ["Unexposed", "Semi-exposed", "Exposed"];
// UA p.108 overbearing: armor class adjustment [defender][attacker], and for the defender's legs
const OVERBEAR_SIZE = { S: { S: 0, M: 2, L: 4 }, M: { S: -4, M: 0, L: 2 }, L: { S: -8, M: -4, L: 0 } };
const LEGS = { 2: 0, 4: -6, 6: -8, more: -10 };

/** Stun chance (%) for a pummel: strength × rate, 18/01 or higher counting as 18/01 (UA p.107). */
export function stunChance(object, vulnerability, str, exceptional = false) {
  const rate = STUN_RATE[object]?.[vulnerability] ?? 0;
  if (!rate || !str) return 0;
  if (str > 18 || (str === 18 && exceptional)) return STUN_CAP[rate];
  return rate * str;
}
const S_RACES = ["dwarf", "gnome", "halfling"];
export function actorSize(actor) {
  if (actor.type === "monster") return ["S", "M", "L"].includes(actor.system.size) ? actor.system.size : "M";
  return S_RACES.includes(baseRace(actor.system.details.race)) ? "S" : "M";   // MM: dwarves, gnomes, halflings are size S
}

/** Target's armor class for each weaponless attack form, and its vulnerability to stunning (UA pp.107-108). */
export function brawlDefense(token, { action, attackerSize = "M", legs = "2" } = {}) {
  const a = token.actor;
  if (!a) return null;
  const size = actorSize(a);
  let ac, notes = [], vuln, type;
  if (a.type === "monster") {
    ac = Number(a.system.ac);
    type = a.system.armorType ?? ac;
    vuln = ac >= 7 ? 2 : ac <= 2 ? 0 : 1;                     // natural armor class
  } else {
    ac = a.system.ac.value; type = a.system.ac.type;
    const worn = a.items.filter(i => i.type === "armor" && i.system.equipped);
    const shield = worn.find(i => i.system.kind === "shield");
    const suit = worn.filter(i => i.system.kind === "armor").sort((x, y) => x.system.baseAC - y.system.baseAC)[0];
    const shieldTotal = shield ? Number(shield.system.shieldBonus ?? 1) + Number(shield.system.magic || 0) : 0;
    const buckler = shield && /buckler/i.test(shield.name);
    if (action === "pummel" && shield && !buckler) { ac += shieldTotal; notes.push("shield ignored"); }
    if (action === "grapple") {
      if (shield) { ac += shieldTotal; notes.push("shield ignored"); }
      if (suit?.system.magic && !/plate/i.test(suit.name)) { ac += Number(suit.system.magic); notes.push("magic armor bonus ignored"); }
    }
    const n = (suit?.name ?? "").toLowerCase();
    vuln = !suit || /leather|padded/.test(n) ? 2 : /full plate|field plate/.test(n) ? 0 : 1;
  }
  let possible = true;
  if (action === "overbear") {
    const sAdj = OVERBEAR_SIZE[size]?.[attackerSize] ?? 0;
    if (sAdj) { ac += sAdj; notes.push(`size ${size} vs ${attackerSize} ${signed(sAdj)}`); }
    if (legs === "none") possible = false;
    else if (LEGS[legs]) { ac += LEGS[legs]; notes.push(`${legs} legs ${LEGS[legs]}`); }
  }
  return { name: token.name, ac, type, size, vuln, notes, possible, uuid: token.document.uuid };
}

export async function rollBrawl(actor) {
  const isChar = isPC(actor);
  const profile = attackerProfile(actor);
  const keys = isChar ? actor.system.classInfo.map(c => c.key) : [];
  const monk = keys.includes("monk");
  const thiefish = keys.some(k => ["thief", "assassin", "acrobat"].includes(k));
  const cavalier = keys.some(k => ["cavalier", "paladin", "paladinUA"].includes(k));
  const str = isChar ? actor.system.abilities.str.value : null;
  const strPct = isChar ? actor.system.abilities.str.pct : 0;
  const mySize = actorSize(actor);
  const objOpts = Object.entries(PUMMEL_OBJECTS).map(([k, o]) => `<option value="${k}">${o.label} — ${o.dmg.replace("1d", "1-")}</option>`).join("");
  const content = `<div class="frpg1e-form brawl-form">
    <div class="row"><span class="lbl">Attack</span>
      <label><input type="radio" name="action" value="pummel" checked> Pummel</label>
      <label><input type="radio" name="action" value="grapple"> Grapple</label>
      <label><input type="radio" name="action" value="overbear"> Overbear</label></div>
    <div class="row"><span class="lbl">Striking with</span><select name="object">${objOpts}</select></div>
    <div class="row"><span class="lbl">Strength</span><input type="number" name="str" class="w4" value="${str ?? ""}" ${isChar ? "" : 'placeholder="?"'}>
      ${isChar ? `<label><input type="checkbox" name="exc" ${str === 18 && strPct > 0 ? "checked" : ""}> 18/01 or more</label>` : '<span class="hint">for the chance to stun</span>'}</div>
    <div class="row"><span class="lbl">Target's legs</span><select name="legs"><option value="2">2 or fewer (upright)</option><option value="4">4 (−6)</option><option value="6">6 (−8)</option><option value="more">more than 6 (−10)</option><option value="none">none (cannot be overborne)</option></select>
      <span class="hint">overbear only</span></div>
    <div class="row col">
      <label><input type="checkbox" name="rear"> Surprise or from behind (pummel +2${thiefish ? "; thieves +4" : ""}, no initiative penalty)</label>
      <label><input type="checkbox" name="helpless"> Target stunned or prone (+4)</label>
      <label><input type="checkbox" name="held"> Target held by a grapple (+2)</label>
      <label><input type="checkbox" name="rushing"> Rushing or leaping to attack</label>
    </div>
    <div class="row"><span class="lbl">Other modifier</span><input type="number" name="misc" value="0" class="w4"></div>
    <p class="hint">UA Appendix Q (System II). Target tokens first: their armor class is adjusted for the attack form (pummel ignores a shield other than a buckler; grapple ignores shield and magic armor bonus except magic plate; overbear adds size and legs).</p>
  </div>`;
  const res = await DialogV2.wait({
    window: { title: `Brawl: ${actor.name}` }, classes: ["frpg1e-dialog"], content, rejectClose: false,
    buttons: [{ action: "roll", label: "Roll to Hit", icon: "fa-solid fa-hand-fist", default: true, callback: (ev, button) => {
      const el = button.form.elements;
      return { action: el.action.value, object: el.object.value, str: el.str.value === "" ? null : Number(el.str.value), exc: el.exc?.checked ?? false,
        legs: el.legs.value, rear: el.rear.checked, helpless: el.helpless.checked, held: el.held.checked, misc: Number(el.misc.value) || 0 };
    } }]
  });
  if (!res || typeof res !== "object") return null;
  const { action } = res;
  const mods = [];
  if (isChar && actor.system.mods.str.hit) mods.push({ label: "Strength", value: actor.system.mods.str.hit });
  if (isChar && actor.system.combat.hitMisc) mods.push({ label: "Misc.", value: actor.system.combat.hitMisc });
  if (action === "pummel" && res.rear) mods.push(thiefish ? { label: "Thief from behind", value: 4 } : { label: "Surprise / from behind", value: 2 });
  if (action === "pummel" && cavalier && res.object === "smallSoft") mods.push({ label: "Cavalier bare-handed", value: -2 });
  if (res.helpless) mods.push({ label: "Stunned / prone", value: 4 });
  if (res.held) mods.push({ label: "Held", value: 2 });
  if (res.misc) mods.push({ label: "Situational", value: res.misc });
  const modTotal = mods.reduce((t, m) => t + m.value, 0);
  const roll = await evalRoll(`1d20 + ${modTotal}`);
  const natural = roll.dice[0]?.total ?? roll.total - modTotal;
  const rolls = [roll];
  const useAdj = action === "pummel" && setting("weaponVsArmor");
  const targets = Array.from(game.user.targets).map(t => brawlDefense(t, { action, attackerSize: mySize, legs: res.legs })).filter(Boolean);
  let rows = "";
  for (const t of targets) {
    if (!t.possible) { rows += `<div class="target-line miss"><span class="t-name">${t.name}</span><span class="verdict small">cannot be overborne</span></div>`; continue; }
    const need = neededToHit(profile, t.ac).score;
    const adj = useAdj ? R.weaponArmorAdj(FIST_AC_ADJ, t.type) : 0;
    const total = roll.total + adj;
    const hit = total >= need;
    let result = "";
    if (hit && action === "pummel") {
      const dmg = await evalRoll(PUMMEL_OBJECTS[res.object].dmg); rolls.push(dmg);
      const chance = stunChance(res.object, t.vuln, res.str, res.exc);
      let stun = "";
      if (res.str === null) stun = "set the attacker's strength to check for a stun";
      else if (!chance) stun = `no chance to stun (${VULN[t.vuln].toLowerCase()} target)`;
      else {
        const d = await evalRoll("1d100"); rolls.push(d);
        if (d.total <= chance) { const seg = await evalRoll("1d10"); rolls.push(seg); stun = `<strong>STUNNED</strong> for ${seg.total} segments (rolled ${d.total} vs ${chance}%)`; }
        else stun = `not stunned (rolled ${d.total} vs ${chance}%)`;
      }
      result = `${dmg.total} damage · ${stun}`;
    } else if (hit && action === "grapple") result = "<strong>HELD</strong>: no further action this round; −2 to hit, +2 to be hit, no dexterity bonus while held";
    else if (hit && action === "overbear") result = "<strong>KNOCKED PRONE</strong>: +4 to be hit, −2 to hit until back on its feet";
    rows += `<div class="target-line ${hit ? "hit" : "miss"}"><span class="t-name">${t.name}</span>
      <span class="gm-only t-need">AC ${t.ac}${t.notes.length ? ` (${t.notes.join(", ")})` : ""} needs ${need}${adj ? ` · fist vs. armor ${signed(adj)} → ${total}` : ""}${action === "pummel" ? ` · ${VULN[t.vuln].toLowerCase()}` : ""}</span>
      <span class="verdict">${hit ? "HIT" : "MISS"}</span></div>${result ? `<div class="hint">${result}</div>` : ""}`;
  }
  if (!targets.length) rows = `<div class="target-line"><span class="t-name">No target</span><span class="verdict small">${(() => { const b = bestACHit(profile, roll.total); return b === null ? "hits no armor class" : `hits AC ${b} or worse`; })()}</span></div>
    <div class="hint">Target a token to apply the attack form's armor class adjustments${action === "pummel" ? ", the stun chance and damage" : ""}.</div>`;
  const init = action === "pummel" ? (monk || res.rear ? "no initiative penalty" : "initiative −4") : action === "grapple" ? "initiative −1" : "no initiative penalty";
  const label = { pummel: `Pummel (${PUMMEL_OBJECTS[res.object].label.split(" (")[0].toLowerCase()})`, grapple: "Grapple", overbear: "Overbear" }[action];
  const modsHtml = mods.map(m => `<span class="mod" title="${m.label}">${signed(m.value)}</span>`).join("");
  const content2 = `<div class="frpg1e-card attack-card">
    <header class="card-head"><img src="${actor.img}" alt=""><div><div class="card-title">Brawl: ${label}</div><div class="card-sub">UA Appendix Q · ${init}</div></div></header>
    <div class="roll-line"><span class="die" title="Natural d20">${natural}</span>${modsHtml}<span class="eq">=</span><span class="adnd-big">${roll.total}</span></div>
    ${mods.length ? `<div class="mod-list">${mods.map(m => `${m.label} ${signed(m.value)}`).join(", ")}</div>` : ""}
    ${rows}
    <div class="hint">The attack is spoiled if the attacker takes damage this round before it is made.</div></div>`;
  const msg = { speaker: ChatMessage.getSpeaker({ actor }), content: content2, rolls, flags: { [SYSTEM_ID]: { type: "brawl" } } };
  ChatMessage.applyMode(msg);
  return ChatMessage.create(msg);
}

/* ------------------------------------------------------------------ */
/*  Per-actor initiative, surprise and morale (sheet buttons)           */
/* ------------------------------------------------------------------ */
/** Initiative: the actor's combatant joins its side's d6 (DMG p.62); outside combat, a plain d6. */
export async function rollActorInitiative(actor) {
  const combat = game.combat;
  const combatant = combat?.combatants?.find(c => c.actor?.id === actor.id || c.actorId === actor.id);
  if (combatant) return combat.rollInitiative([combatant.id]);
  const r = await evalRoll("1d6");
  const msg = { speaker: ChatMessage.getSpeaker({ actor }), rolls: [r],
    content: `<div class="frpg1e-card"><header class="card-head"><img src="${actor.img}" alt=""><div><div class="card-title">Initiative</div><div class="card-sub">d6, DMG p.62</div></div></header>
      <div class="roll-line"><span class="die">${r.total}</span></div>
      <div class="hint">1e FRPG rolls one d6 per side; the higher side acts first. Add the actor to a combat to share its side's roll.</div></div>` };
  ChatMessage.applyMode(msg);
  return ChatMessage.create(msg);
}

/**
 * Chance of being surprised: { on, die } (surprised on 1-on of a d-die) or { pct } (monks), with its source.
 * Normal 2 in 6 (DMG p.61); rangers 1 in 6 (PHB p.24); monks 33⅓% less 2% a level after 2nd (PHB p.31);
 * barbarians 10%, 5% in familiar terrain (UA p.20); drow 1 in 8, duergar 1 in 10, svirfneblin 1 in 12 (UA pp.9-14).
 * The most favorable applies.
 */
export function surpriseChance(actor, { familiar = false } = {}) {
  if (actor.type === "monster") {
    const s = actor.system;
    return { on: s.surpriseOn ?? 2, die: s.surpriseDie ?? 6, src: "monster" };
  }
  const opts = [{ on: 2, die: 6, src: "normal" }];
  const keys = actor.system.classInfo.map(c => c.key);
  const race = actor.system.details.race;
  if (keys.includes("ranger")) opts.push({ on: 1, die: 6, src: "ranger" });
  if (keys.includes("barbarian")) opts.push(familiar ? { on: 1, die: 20, src: "barbarian, familiar terrain" } : { on: 1, die: 10, src: "barbarian" });
  if (race === "elf-dark") opts.push({ on: 1, die: 8, src: "drow" });
  if (race === "dwarf-gray") opts.push({ on: 1, die: 10, src: "duergar" });
  if (race === "gnome-deep") opts.push({ on: 1, die: 12, src: "svirfneblin" });
  const monk = actor.system.classInfo.find(c => c.key === "monk");
  if (monk && monk.level >= 2) opts.push({ pct: Math.max(0, 36 - 2 * monk.level), src: `monk ${monk.level}` });
  const pctOf = o => (o.pct ?? (100 * o.on / o.die));
  return opts.sort((a, b) => pctOf(a) - pctOf(b))[0];
}

export async function rollActorSurprise(actor) {
  const isChar = isPC(actor);
  const base = surpriseChance(actor);
  const barb = isChar && actor.system.classInfo.some(c => c.key === "barbarian");
  const dex = isChar ? (actor.system.mods.dex.reaction ?? 0) : 0;
  const content = `<div class="frpg1e-form">
    <div class="row"><span class="lbl">Surprised on</span>
      ${base.pct !== undefined ? `<input type="number" name="pct" value="${base.pct}" class="w4">%`
        : `1 to <input type="number" name="on" value="${base.on}" class="w4"> on a d<input type="number" name="die" value="${base.die}" class="w4">`}
      <span class="hint">${base.src}</span></div>
    ${barb ? `<div class="row"><label><input type="checkbox" name="familiar"> Familiar terrain (barbarian surprised 5%)</label></div>` : ""}
    ${isChar ? `<div class="row"><span class="lbl">Dexterity reaction</span><input type="number" name="dex" value="${dex}" class="w4"><span class="hint">only changes the segments lost if surprised (DMG p.62)</span></div>` : ""}
    <p class="hint">DMG p.61: each point of the die is one segment lost. Prior detection, noise or light can rule surprise out: roll only for a side that could be surprised.</p></div>`;
  const res = await DialogV2.wait({ window: { title: `Surprise: ${actor.name}` }, classes: ["frpg1e-dialog"], content, rejectClose: false,
    buttons: [{ action: "roll", label: "Roll", icon: "fa-solid fa-dice-six", default: true, callback: (ev, b) => {
      const el = b.form.elements;
      return { pct: el.pct ? Number(el.pct.value) : null, on: el.on ? Number(el.on.value) : null, die: el.die ? Number(el.die.value) : null,
        familiar: el.familiar?.checked ?? false, dex: el.dex ? Number(el.dex.value) || 0 : 0 };
    } }] });
  if (!res || typeof res !== "object") return null;
  let chance = res;
  if (res.familiar) chance = { on: 1, die: 20, pct: null };
  let r, surprised, segments, desc;
  if (chance.pct !== null && chance.pct !== undefined) {
    r = await evalRoll("1d100");
    surprised = r.total <= chance.pct;
    segments = surprised ? (r.total <= chance.pct / 2 ? 1 : 2) : 0;   // a 2-in-6 equivalent: lower half of the chance 1 segment, upper half 2
    desc = `d100 ${r.total} vs ${chance.pct}%`;
  } else {
    r = await evalRoll(`1d${Math.max(2, chance.die)}`);
    surprised = r.total <= chance.on;
    segments = surprised ? r.total : 0;
    desc = `d${chance.die} ${r.total}, surprised on 1${chance.on > 1 ? `-${chance.on}` : ""}`;
  }
  let dexNote = "";
  if (surprised && res.dex) {
    const before = segments;
    segments = Math.max(0, segments - res.dex);
    dexNote = ` (${before} ${res.dex > 0 ? "−" : "+"} ${Math.abs(res.dex)} dexterity)`;
  }
  const verdict = !surprised ? "Not surprised" : segments ? `SURPRISED: loses ${segments} segment${segments > 1 ? "s" : ""}${dexNote}` : `Surprised, but dexterity negates it${dexNote}`;
  const msg = { speaker: ChatMessage.getSpeaker({ actor }), rolls: [r],
    content: `<div class="frpg1e-card"><header class="card-head"><img src="${actor.img}" alt=""><div><div class="card-title">Surprise</div><div class="card-sub">${desc}</div></div></header>
      <div class="result ${surprised && segments ? "miss" : "hit"}">${verdict}</div>
      <div class="hint">If both sides are surprised, the side with less surprise loses only the difference (DMG p.61).</div></div>` };
  ChatMessage.applyMode(msg);
  return ChatMessage.create(msg);
}

/** DMG p.67 base morale: monsters 50% +5% per hit die above 1, +1% per hit point above the dice. */
export function baseMorale(actor) {
  if (actor.type === "npc" && actor.system.loyalty) return actor.system.loyalty.score;
  if (actor.type !== "monster") return 50;
  const { dice, plus, fraction } = R.parseHitDice(R.hdForRules(actor.system.hd, actor.system.attackAs));
  if (fraction || dice < 1) return 50;
  return 50 + 5 * (dice - 1) + plus;
}
const MORALE_WHEN = [["", "Other reason", 0], ["superior", "Faced by obviously superior force", 0], ["q25", "25% of party eliminated or slain", 5],
  ["leaderOut", "Leader unconscious", 10], ["half", "50% or more of party eliminated or slain", 15], ["leaderSlain", "Leader slain or deserts", 30]];
const MORALE_MODS = [["enemyDesert", "Each enemy deserting", -5, true], ["enemySlain", "Each enemy slain", -10, true],
  ["inflicting", "Inflicting casualties without receiving any", -20, false], ["friendKilled", "Each friend killed", 10, true],
  ["taking", "Taking casualties without receiving any", 10, false], ["friendDesert", "Each friend deserting", 15, true],
  ["outnumbered", "Outnumbered & outclassed by 3 or more to 1", 20, false]];
export function moraleResult(adjusted, base) {
  if (adjusted <= base) return { ok: true, text: "Morale holds" };
  const fail = adjusted - base;
  const text = fail <= 15 ? "Falls back, fighting" : fail <= 30 ? "Disengages and retreats" : fail <= 50 ? "Flees in panic" : "Surrenders";
  return { ok: false, fail, text };
}
export async function rollMorale(actor) {
  const base = baseMorale(actor);
  const nonInt = actor.type === "monster" && actor.system.nonIntelligent;
  const content = `<div class="frpg1e-form">
    <div class="row"><span class="lbl">Morale (loyalty)</span><input type="number" name="base" value="${base}" class="w4">%
      <span class="hint">${actor.type === "monster" ? `50% +5%/HD above 1 +1%/hp above the dice` : (actor.type === "npc" ? "the NPC's loyalty score (DMG p.36)" : "50% base; use a henchman's loyalty score if you have one")}</span></div>
    <div class="row"><span class="lbl">Check because</span><select name="when">${MORALE_WHEN.map(([k, l, v]) => `<option value="${k}">${l}${v ? ` (+${v}%)` : ""}</option>`).join("")}</select></div>
    ${MORALE_MODS.map(([k, l, v, n]) => `<div class="row"><span class="lbl">${l} (${v > 0 ? "+" : ""}${v}%)</span>${n ? `<input type="number" name="${k}" value="0" min="0" class="w4">` : `<input type="checkbox" name="${k}">`}</div>`).join("")}
    <div class="row"><span class="lbl">Other modifier</span><input type="number" name="misc" value="0" class="w4">%</div>
    ${nonInt ? '<p class="warn">Non-intelligent: the DMG morale rules are for henchmen, hirelings and intelligent monsters.</p>' : ""}
    <p class="hint">DMG p.67: roll d100 + modifiers; at or under the morale score it holds. The amount over is the % of failure.</p></div>`;
  const res = await DialogV2.wait({ window: { title: `Morale: ${actor.name}` }, classes: ["frpg1e-dialog", "morale-dialog"], content, rejectClose: false,
    buttons: [{ action: "roll", label: "Roll Morale", icon: "fa-solid fa-flag", default: true, callback: (ev, b) => {
      const el = b.form.elements;
      const mods = [];
      const w = MORALE_WHEN.find(x => x[0] === el.when.value);
      if (w?.[2]) mods.push({ label: w[1], value: w[2] });
      for (const [k, l, v, n] of MORALE_MODS) {
        const count = n ? Number(el[k].value) || 0 : (el[k].checked ? 1 : 0);
        if (count) mods.push({ label: n && count > 1 ? `${l} ×${count}` : l, value: v * count });
      }
      if (Number(el.misc.value)) mods.push({ label: "Other", value: Number(el.misc.value) });
      return { base: Number(el.base.value) || 0, mods };
    } }] });
  if (!res || typeof res !== "object") return null;
  const r = await evalRoll("1d100");
  const total = res.mods.reduce((t, m) => t + m.value, 0);
  const adjusted = r.total + total;
  const out = moraleResult(adjusted, res.base);
  const msg = { speaker: ChatMessage.getSpeaker({ actor }), rolls: [r],
    content: `<div class="frpg1e-card"><header class="card-head"><img src="${actor.img}" alt=""><div><div class="card-title">Morale</div><div class="card-sub">score ${res.base}% · DMG p.67</div></div></header>
      <div class="roll-line"><span class="die">${r.total}</span>${res.mods.map(m => `<span class="mod" title="${m.label}">${signed(m.value)}</span>`).join("")}<span class="eq">=</span><span class="adnd-big">${adjusted}</span></div>
      ${res.mods.length ? `<div class="mod-list">${res.mods.map(m => `${m.label} ${signed(m.value)}%`).join(", ")}</div>` : ""}
      <div class="result ${out.ok ? "hit" : "miss"}">${out.ok ? out.text : `${out.text} (failed by ${out.fail}%)`}</div></div>` };
  ChatMessage.applyMode(msg);
  return ChatMessage.create(msg);
}

/* ------------------------------------------------------------------ */
/*  Loyalty check (DMG p.36)                                           */
/* ------------------------------------------------------------------ */
/** d100 against the adjusted loyalty score: a roll above it means the NPC is disloyal, disobedient or has poor morale. */
export async function rollLoyalty(actor) {
  const L = actor.system.loyalty;
  if (!L) { ui.notifications?.info("Loyalty applies to henchmen, hirelings, men-at-arms, associates and allies (DMG p.36). Change the NPC's role to use it."); return null; }
  const opts = T.LOYALTY_SITUATIONS.map(([s, f], i) => `<option value="${i}">${s} (failure: ${f})</option>`).join("");
  const content = `<div class="frpg1e-form">
    <div class="row"><span class="lbl">Loyalty score</span><input type="number" name="base" value="${L.score}" class="w4">% <span class="hint">${L.band}</span></div>
    <div class="row"><span class="lbl">Situation</span><select name="sit"><option value="">(other)</option>${opts}</select></div>
    <div class="row"><span class="lbl">Other modifier to the score</span><input type="number" name="misc" value="0" class="w4">%</div>
    <p class="hint">DMG p.36: if the score is less than the percentile roll, the NPC is disloyal, disobedient or has poor morale.</p></div>`;
  const res = await DialogV2.wait({ window: { title: `Loyalty: ${actor.name}` }, classes: ["frpg1e-dialog"], content, rejectClose: false,
    buttons: [{ action: "roll", label: "Roll Loyalty", icon: "fa-solid fa-handshake", default: true, callback: (ev, b) => {
      const el = b.form.elements;
      return { base: Number(el.base.value) || 0, sit: el.sit.value === "" ? null : T.LOYALTY_SITUATIONS[Number(el.sit.value)], misc: Number(el.misc.value) || 0 };
    } }] });
  if (!res || typeof res !== "object") return null;
  const r = await evalRoll("1d100");
  const score = res.base + res.misc;
  const ok = !(score < r.total);
  const msg = { speaker: ChatMessage.getSpeaker({ actor }), rolls: [r],
    content: `<div class="frpg1e-card"><header class="card-head"><img src="${actor.img}" alt=""><div><div class="card-title">Loyalty${res.sit ? `: ${res.sit[0]}` : ""}</div><div class="card-sub">score ${score}% · DMG p.36</div></div></header>
      <div class="roll-line"><span class="die">${r.total}</span><span class="eq">vs</span><span class="adnd-big">${score}</span></div>
      <div class="result ${ok ? "hit" : "miss"}">${ok ? "Loyal: obeys" : `Fails${res.sit ? `: ${res.sit[1]}` : ": disloyal, disobedient, or poor morale"}`}</div></div>` };
  ChatMessage.applyMode(msg);
  return ChatMessage.create(msg);
}

/* ------------------------------------------------------------------ */
/*  Ability scores: 4d6, drop the lowest, six times (DMG p.11 Method I) */
/* ------------------------------------------------------------------ */
export async function rollAbilityScores(actor = null) {
  const rolls = [];
  for (let i = 0; i < 6; i++) rolls.push(await evalRoll("4d6dl1"));
  const rows = rolls.map((r, i) => {
    const dice = r.dice[0].results.map(d => (d.discarded ? `<s class="dropped">${d.result}</s>` : `${d.result}`)).join(" ");
    return `<tr><td>${i + 1}</td><td>${dice}</td><td class="num"><strong>${r.total}</strong></td></tr>`;
  }).join("");
  const totals = rolls.map(r => r.total);
  const msg = { speaker: actor ? ChatMessage.getSpeaker({ actor }) : ChatMessage.getSpeaker(), rolls, sound: CONFIG.sounds?.dice,
    content: `<div class="frpg1e-card ability-roll"><header class="card-head"><div><div class="card-title">Ability Scores</div><div class="card-sub">4d6, drop the lowest · DMG p.11, Method I</div></div></header>
      <table class="ability-roll-table"><tr><th>#</th><th>Dice</th><th class="num">Score</th></tr>${rows}</table>
      <div class="mod-list"><strong>Scores:</strong> ${totals.join(", ")} · <strong>Total:</strong> ${totals.reduce((a, b) => a + b, 0)}</div>
      <p class="hint">Arrange the six scores as you like (Method I).</p></div>` };
  ChatMessage.applyMode(msg);
  return ChatMessage.create(msg);
}
