/**
 * Random treasure: gems and jewelry (DMG p.25-26) and magic items
 * (DMG tables III-III.H, or the revised tables of UA p.84-89).
 * Treasure types A-Z (coins, gems, jewelry, maps or magic) from the MM appendix, p.105.
 */
const ID = "frpg1e";
const { DialogV2 } = foundry.applications.api;

let _tables = null, _gems = null;
async function load() {
  if (!_tables) _tables = await (await fetch(`systems/${ID}/data/magic-tables.json`)).json();
  if (!_gems) _gems = await (await fetch(`systems/${ID}/data/gems.json`)).json();
  return { tables: _tables, gems: _gems };
}
const roll = async f => (await new Roll(f).evaluate()).total;
const d100 = async () => roll("1d100");
const pick = (rows, n) => rows.find(r => n >= r.range[0] && n <= r.range[1]);
const fmt = v => (v >= 1 ? `${Math.round(v * 100) / 100}`.replace(/\B(?=(\d{3})+(?!\d))/g, ",") + " gp" : `${Math.round(v * 20)} sp`);

/* ------------------------------------------------------------------ */
/*  Gems                                                                */
/* ------------------------------------------------------------------ */
// DMG p.25: base value ladder. Below 10 gp: 5 gp, 1 gp, 10 sp, 5 sp, 1 sp (20 sp = 1 gp). Above 5,000: up to 1,000,000.
export const GEM_LADDER = [0.05, 0.25, 0.5, 1, 5, 10, 50, 100, 500, 1000, 5000, 10000, 25000, 50000, 100000, 250000, 500000, 1000000];
export const GEM_BASE = [[25, 10], [50, 50], [70, 100], [90, 500], [99, 1000], [100, 5000]];
const GEM_CLASS = { 10: "ornamental", 50: "semi-precious", 100: "fancy", 500: "fancy", 1000: "gem", 5000: "gem" };

/**
 * DMG p.25 "Increase or decrease of worth beyond base value" (d10 per stone):
 * 1 next higher base value, roll again ignoring results above 8; 2 double; 3 +10% to +60% (d6);
 * 4-8 unchanged; 9 −10% to −40% (d4); 0 next lower base value, roll again ignoring results below 2.
 * "Ignoring" is read as: such a result on the repeat roll changes nothing and ends the rolling.
 * No stone rises more than 7 places or falls more than 5 places from its initial base value.
 */
export async function gemVariation(base, dice = null) {
  const r = dice ?? (async f => roll(f));
  const start = GEM_LADDER.indexOf(base);
  let idx = start, value = base, steps = [], mode = null;
  for (let guard = 0; guard < 20; guard++) {
    const n = await r("1d10");
    const v = n === 10 ? 0 : n;
    if (mode === "up" && (v === 9 || v === 0)) { steps.push(`${v}: ignored`); break; }
    if (mode === "down" && v === 1) { steps.push(`${v}: ignored`); break; }
    if (v === 1) {
      if (idx - start >= 7 || idx >= GEM_LADDER.length - 1) { steps.push("1: at the maximum"); break; }
      idx++; value = GEM_LADDER[idx]; steps.push(`1: up to ${fmt(value)}`); mode = "up"; continue;
    }
    if (v === 0) {
      if (start - idx >= 5 || idx <= 0) { steps.push("0: at the minimum"); break; }
      idx--; value = GEM_LADDER[idx]; steps.push(`0: down to ${fmt(value)}`); mode = "down"; continue;
    }
    if (v === 2) { value *= 2; steps.push("2: doubled"); break; }
    if (v === 3) { const p = (await r("1d6")) * 10; value = value * (1 + p / 100); steps.push(`3: +${p}%`); break; }
    if (v === 9) { const p = (await r("1d4")) * 10; value = value * (1 - p / 100); steps.push(`9: −${p}%`); break; }
    steps.push(`${v}: unchanged`); break;
  }
  return { value: Math.round(value * 100) / 100, steps };
}

export async function rollGem() {
  const { gems } = await load();
  const n = await d100();
  const base = GEM_BASE.find(([max]) => n <= max)[1];
  const cls = GEM_CLASS[base];
  // Names come from the DMG list for the stone's class; fancy and gem stones also match the printed value
  const prized = g => /500 gp for the most prized/.test(g.system.description);
  const pool = gems.filter(g => g.system.class === cls &&
    (cls === "ornamental" || cls === "semi-precious" || g.system.baseValue === base || (base === 500 && prized(g))));
  const g = pool[Math.floor(Math.random() * pool.length)] ?? gems[0];
  const varied = await gemVariation(base);
  const data = foundry.utils.deepClone(g);
  data.system.baseValue = base; data.system.value = varied.value;
  return { kind: "gem", label: `${g.name}`, detail: `base ${fmt(base)} (d% ${n}); ${varied.steps.join(", ")}`, value: varied.value, data };
}

/* ------------------------------------------------------------------ */
/*  Jewelry                                                             */
/* ------------------------------------------------------------------ */
// DMG p.26. The book prints value ranges; each is rolled with dice that reproduce the range exactly.
export const JEWELRY = [
  { max: 10, desc: "Ivory or wrought silver", range: "100-1,000", f: "1d10*100", hi: 1000, gems: false },
  { max: 20, desc: "Wrought silver and gold", range: "200-1,200", f: "2d6*100", hi: 1200, gems: false },
  { max: 40, desc: "Wrought gold", range: "300-1,800", f: "3d6*100", hi: 1800, gems: false },
  { max: 50, desc: "Jade, coral or wrought platinum", range: "500-3,000", f: "1d6*500", hi: 3000, gems: false },
  { max: 70, desc: "Silver with gems", range: "1,000-6,000", f: "1d6*1000", hi: 6000, gems: true },
  { max: 90, desc: "Gold with gems", range: "2,000-8,000", f: "2d4*1000", hi: 8000, gems: true },
  { max: 100, desc: "Platinum with gems", range: "2,000-12,000", f: "2d6*1000", hi: 12000, gems: true }
];
const PIECES = ["bracelet", "brooch", "crown", "earrings", "necklace", "pendant", "ring", "tiara"];

export async function rollJewelry() {
  const n = await d100();
  let cls = JEWELRY.findIndex(j => n <= j.max);
  let value = await roll(JEWELRY[cls].f);
  const notes = [];
  // Workmanship: a 1 on d10 makes the piece exceptional (highest value in its class, or the next class at the DM's option)
  for (let guard = 0; guard < 7; guard++) {
    if ((await roll("1d10")) !== 1) break;
    if (value < JEWELRY[cls].hi) { value = JEWELRY[cls].hi; notes.push("exceptional workmanship: highest value in its class"); }
    else if (cls < JEWELRY.length - 1) { cls++; value = await roll(JEWELRY[cls].f); notes.push(`exceptional workmanship: moved to ${JEWELRY[cls].desc.toLowerCase()}`); }
    else break;
  }
  // Exceptional stone: 1 on d8 adds 5,000 gp; each successive 1 on d6 doubles the increase, to 640,000 gp
  if (JEWELRY[cls].gems && (await roll("1d8")) === 1) {
    let inc = 5000;
    while (inc < 640000 && (await roll("1d6")) === 1) inc *= 2;
    value += inc; notes.push(`exceptional stone: +${fmt(inc)}`);
  }
  const piece = PIECES[Math.floor(Math.random() * PIECES.length)];
  const name = `${piece[0].toUpperCase()}${piece.slice(1)}, ${JEWELRY[cls].desc.toLowerCase()}`;
  const data = { name, type: "treasure", img: "icons/svg/jewel.svg", system: {
    kind: "jewelry", value, baseValue: value, quantity: 1, weight: 1, source: "DMG",
    description: `<p>${JEWELRY[cls].desc}, ${JEWELRY[cls].range} gp class (DMG p.26).${notes.length ? ` ${notes.join("; ")}.` : ""}</p><p class="hint">The type of piece is chosen at random from the DMG's examples; rename it as you like. Encumbrance 1-5 gp (small) or 50 gp (large), DMG Appendix O.</p>` } };
  return { kind: "jewelry", label: name, detail: `d% ${n}${notes.length ? `; ${notes.join("; ")}` : ""}`, value, data };
}

/* ------------------------------------------------------------------ */
/*  Magic items                                                         */
/* ------------------------------------------------------------------ */
const DMG_MAIN = [[20, "A"], [35, "B"], [40, "C"], [45, "D"], [48, "E1"], [51, "E2"], [54, "E3"], [57, "E4"], [60, "E5"], [75, "F"], [86, "G"], [100, "H"]];
// UA p.84 revised table III: [main max, [[sub max, table], ...]]
const UA_MAIN = [
  [20, [[65, "III.A"], [100, "III.A.2"]]], [35, [[85, "B"], [100, "III.B.2"]]], [40, [[67, "III.C"], [100, "III.C.2"]]],
  [45, [[40, "III.D"], [100, "III.D.2"]]],
  [60, [[14, "III.E.1"], [28, "III.E.2"], [42, "III.E.3"], [56, "III.E.4"], [70, "III.E.5"], [85, "III.E.6"], [100, "III.E.7"]]],
  [75, [[50, "III.F"], [100, "III.F.2"]]], [86, [[95, "III.G"], [100, "III.G.2"]]], [100, [[50, "III.H"], [100, "III.H.2"]]]
];
// DMG III.B (UA III.B is the same): spells and spell level range [magic-user, cleric]
const SCROLL_SPELLS = [
  [10, 1, [1, 4], [1, 4]], [16, 1, [1, 6], [1, 6]], [19, 1, [2, 9], [2, 7]], [24, 2, [1, 4], [1, 4]], [27, 2, [1, 8], [1, 6]],
  [32, 3, [1, 4], [1, 4]], [35, 3, [2, 9], [2, 7]], [39, 4, [1, 6], [1, 6]], [42, 4, [1, 8], [1, 6]], [46, 5, [1, 6], [1, 6]],
  [49, 5, [1, 8], [1, 6]], [52, 6, [1, 6], [1, 6]], [54, 6, [3, 8], [3, 6]], [57, 7, [1, 8], [1, 8]], [59, 7, [2, 9], [2, 9]], [60, 7, [4, 9], [4, 7]]
];
const DMG_SCROLL_PROT = [[62, "Scroll of Protection from Demons"], [64, "Scroll of Protection from Devils"], [70, "Scroll of Protection from Elementals"],
  [76, "Scroll of Protection from Lycanthropes"], [82, "Scroll of Protection from Magic"], [87, "Scroll of Protection from Petrification"],
  [92, "Scroll of Protection from Possession"], [97, "Scroll of Protection from Undead"], [100, "Cursed Scroll"]];

async function findItem(name) {
  for (const key of [`world.${ID}-magic`]) {
    const pack = game.packs.get(key);
    if (!pack) continue;
    const idx = await pack.getIndex();
    const e = idx.find(i => i.name === name);
    if (e) return (await pack.getDocument(e._id)).toObject();
  }
  return null;
}

async function randomSpell(list, level) {
  const names = [];
  for (const key of [`world.${ID}-spells`, `world.${ID}-spells-ua`]) {
    const pack = game.packs.get(key);
    if (!pack) continue;
    const idx = await pack.getIndex({ fields: ["system.list", "system.level"] });
    for (const e of idx) if (e.system?.list === list && e.system?.level === level) names.push(e.name);
  }
  return names.length ? names[Math.floor(Math.random() * names.length)] : null;
}

async function rollScroll(n) {
  if (n > 60) {
    const name = DMG_SCROLL_PROT.find(([max]) => n <= max)[1];
    return { name };
  }
  const row = SCROLL_SPELLS.find(r => n <= r[0]);
  // 30% clerical (25% of those druidical); 10% of magic-user scrolls are illusionist
  const t = await d100();
  let list = "magicuser";
  if (t >= 71) list = (await d100()) <= 25 ? "druid" : "cleric";
  else if ((await d100()) <= 10) list = "illusionist";
  const range = ["cleric", "druid"].includes(list) ? row[3] : row[2];
  const spells = [];
  for (let i = 0; i < row[1]; i++) {
    let lvl = await roll(`1d${range[1] - range[0] + 1}+${range[0] - 1}`);
    const max = { cleric: 7, druid: 7, magicuser: 9, illusionist: 7 }[list];
    lvl = Math.min(lvl, max);
    spells.push({ level: lvl, name: await randomSpell(list, lvl) });
  }
  const label = { magicuser: "magic-user", illusionist: "illusionist", cleric: "cleric", druid: "druid" }[list];
  return { name: "Scroll of Spells", scroll: { list: label, spells } };
}

// DMG/UA Table III: main d% ranges by kind of item
export const MAGIC_KINDS = { potion: [1, 20], scroll: [21, 35], ring: [36, 40], rod: [41, 45], misc: [46, 60], armor: [61, 75], sword: [76, 86], weapon: [87, 100] };
const kindOf = n => Object.keys(MAGIC_KINDS).find(k => n >= MAGIC_KINDS[k][0] && n <= MAGIC_KINDS[k][1]);

/** Roll one magic item. source: "DMG" or "UA". only: kinds to keep (others are rerolled); exclude: kinds to reroll. */
export async function rollMagicItem(source = "UA", { only = null, exclude = [] } = {}) {
  const { tables } = await load();
  let n = await d100();
  for (let i = 0; i < 100 && ((only && !only.includes(kindOf(n))) || exclude.includes(kindOf(n))); i++) n = await d100();
  let table, sub = null;
  if (source === "DMG") table = DMG_MAIN.find(([max]) => n <= max)[1];
  else {
    const [, subs] = UA_MAIN.find(([max]) => n <= max);
    sub = await d100();
    table = subs.find(([max]) => sub <= max)[1];
  }
  const path = [`III d% ${n}`];
  if (sub !== null) path.push(`sub-table d% ${sub} → ${table}`);
  let entry, scroll = null;
  if (table === "B") {
    const r = await d100(); path.push(`III.B d% ${r}`);
    const s = await rollScroll(r); entry = { name: s.name }; scroll = s.scroll ?? null;
  } else {
    const rows = tables[source === "DMG" ? "DMG" : "UA"][table] ?? tables.DMG[table];
    const r = await d100(); path.push(`${table} d% ${r}`);
    entry = pick(rows, r);
    if (entry.name === "ARTIFACT") {
      const a = await d100(); path.push(`Special d% ${a}`);
      entry = pick(tables.DMG.ES, a);
    }
  }
  const data = await findItem(entry.name);
  let qty = 1;
  if (data?.system?.quantityRoll) { qty = await roll(data.system.quantityRoll); data.system.quantity = qty; }
  if (data && scroll) {
    data.name = `Scroll of ${scroll.spells.length} ${scroll.list} spell${scroll.spells.length > 1 ? "s" : ""}`;
    data.system.description = `<p><strong>${scroll.list[0].toUpperCase() + scroll.list.slice(1)} scroll:</strong> ${scroll.spells.map(s => `${s.name ?? "(no spell of that level in the compendia)"} (level ${s.level})`).join(", ")}.</p>` + data.system.description;
  }
  return { kind: "magic", label: data?.name ?? entry.name, detail: path.join("; ") + (qty > 1 ? `; ${qty} found` : ""), value: null, data,
    missing: !data };
}

/* ------------------------------------------------------------------ */
/*  Treasure types (MM p.105)                                           */
/* ------------------------------------------------------------------ */
// Coins: [range, chance %] in thousands (platinum in hundreds); "ind": pieces per individual.
// gems/jewelry: [range, chance]. magic: [chance, spec].
export const TREASURE_TYPES = {
  A: { cp: ["1-6", 25], sp: ["1-6", 30], ep: ["1-6", 35], gp: ["1-10", 40], pp: ["1-4", 25], gems: ["4-40", 60], jewelry: ["3-30", 50], magic: [30, "Any 3"] },
  B: { cp: ["1-8", 50], sp: ["1-6", 25], ep: ["1-4", 25], gp: ["1-3", 25], gems: ["1-8", 30], jewelry: ["1-4", 20], magic: [10, "Sword, armor, or misc. weapon"] },
  C: { cp: ["1-12", 20], sp: ["1-6", 30], ep: ["1-4", 10], gems: ["1-6", 25], jewelry: ["1-3", 20], magic: [10, "Any 2"] },
  D: { cp: ["1-8", 10], sp: ["1-12", 15], ep: ["1-8", 15], gp: ["1-6", 50], gems: ["1-10", 30], jewelry: ["1-6", 25], magic: [15, "Any 2 plus 1 potion"] },
  E: { cp: ["1-10", 5], sp: ["1-12", 25], ep: ["1-6", 25], gp: ["1-8", 25], gems: ["1-12", 15], jewelry: ["1-8", 10], magic: [25, "Any 3 plus 1 scroll"] },
  F: { sp: ["1-20", 10], ep: ["1-12", 15], gp: ["1-10", 40], pp: ["1-8", 35], gems: ["3-30", 20], jewelry: ["1-10", 10], magic: [30, "Any 3 except swords or misc. weapons, plus 1 potion & 1 scroll"] },
  G: { gp: ["10-40", 50], pp: ["1-20", 50], gems: ["5-20", 30], jewelry: ["1-10", 25], magic: [35, "Any 4 plus 1 scroll"] },
  H: { cp: ["5-30", 25], sp: ["1-100", 40], ep: ["10-40", 40], gp: ["10-60", 55], pp: ["5-50", 25], gems: ["1-100", 50], jewelry: ["10-40", 50], magic: [15, "Any 4 plus 1 potion & 1 scroll"] },
  I: { pp: ["3-18", 30], gems: ["2-20", 55], jewelry: ["1-12", 50], magic: [15, "Any 1"] },
  J: { ind: ["cp", "3-24"] }, K: { ind: ["sp", "3-18"] }, L: { ind: ["ep", "2-12"] }, M: { ind: ["gp", "2-8"] }, N: { ind: ["pp", "1-6"] },
  O: { cp: ["1-4", 25], sp: ["1-3", 20] },
  P: { sp: ["1-6", 30], ep: ["1-2", 25] },
  Q: { gems: ["1-4", 50] },
  R: { gp: ["2-8", 40], pp: ["10-60", 50], gems: ["4-32", 55], jewelry: ["1-12", 45] },
  S: { magic: [40, "2-8 potions"] },
  T: { magic: [50, "1-4 scrolls"] },
  U: { gems: ["10-80", 90], jewelry: ["5-30", 80], magic: [70, "1 of each magic excluding potions & scrolls"] },
  V: { magic: [85, "2 of each magic excluding potions & scrolls"] },
  W: { gp: ["5-30", 60], pp: ["1-8", 15], gems: ["10-80", 60], jewelry: ["5-40", 50], magic: [55, "1 map"] },
  X: { magic: [60, "1 misc. magic plus 1 potion"] },
  Y: { gp: ["2-12", 70] },
  Z: { cp: ["1-3", 20], sp: ["1-4", 25], ep: ["1-4", 25], gp: ["1-4", 30], pp: ["1-6", 30], gems: ["10-60", 55], jewelry: ["5-30", 50], magic: [50, "Any 3 magic"] }
};
const COIN = { cp: "copper", sp: "silver", ep: "electrum", gp: "gold", pp: "platinum" };
const COIN_GP = { cp: 0.005, sp: 0.05, ep: 0.5, gp: 1, pp: 5 };   // PHB p.35: 200 cp = 20 sp = 2 ep = 1 gp = 1/5 pp
const rangeDice = r => { const [a, b] = r.split("-").map(Number); if (a === 1) return `1d${b}`; return b % a === 0 ? `${a}d${b / a}` : `1d${b - a + 1}+${a - 1}`; };

/** "D, Q (× 5), S" -> [{type:"D", mult:1}, {type:"Q", mult:5}, {type:"S", mult:1}] (letters A-Z only). */
export function parseTreasureTypes(text) {
  const out = [];
  const s = String(text ?? "").replace(/\(\s*[x×]\s*(\d+)\s*\)/gi, "×$1");
  for (const m of s.matchAll(/\b([A-Z])(?:\s*×(\d+))?\b/g)) out.push({ type: m[1], mult: Number(m[2] ?? 1) });
  return out.filter(t => TREASURE_TYPES[t.type]);
}

async function magicSpec(spec, source) {
  const out = [];
  const add = async (n, opts) => { for (let i = 0; i < n; i++) out.push(await rollMagicItem(source, opts)); };
  const m = spec.match(/^Any (\d)/);
  if (spec.startsWith("Sword, armor")) await add(1, { only: ["sword", "armor", "weapon"] });
  else if (/except swords/.test(spec)) await add(3, { exclude: ["sword", "weapon"] });
  else if (m) await add(Number(m[1]));
  if (/plus 1 potion/.test(spec)) await add(1, { only: ["potion"] });
  if (/(plus|&) 1 scroll/.test(spec)) await add(1, { only: ["scroll"] });
  if (spec === "2-8 potions") await add(await roll("2d4"), { only: ["potion"] });
  if (spec === "1-4 scrolls") await add(await roll("1d4"), { only: ["scroll"] });
  const each = spec.match(/^(\d) of each magic excluding potions/);
  if (each) for (const k of ["ring", "rod", "misc", "armor", "sword", "weapon"]) await add(Number(each[1]), { only: [k] });
  if (spec.startsWith("1 misc. magic")) { await add(1, { only: ["misc"] }); await add(1, { only: ["potion"] }); }
  if (spec === "1 map") out.push({ kind: "map", label: "1 map", detail: "Treasure map: the DM determines what it shows.", value: null, data: null });
  return out;
}

/**
 * Roll treasure types. Coins: the range is rolled and multiplied by 1,000 (platinum by 100); types J-N are
 * pieces per individual. A multiplier (×5) multiplies the coins, gems and jewelry found (MM p.5: "larger treasures").
 */
export async function rollTreasureTypes(types, { individuals = 1, source = "UA" } = {}) {
  const coins = { cp: 0, sp: 0, ep: 0, gp: 0, pp: 0 }, lines = [], results = [];
  let gems = 0, jewelry = 0;
  for (const { type, mult } of types) {
    const t = TREASURE_TYPES[type];
    const tag = `${type}${mult > 1 ? ` (×${mult})` : ""}`;
    if (t.ind) {
      let n = 0; for (let i = 0; i < individuals; i++) n += await roll(rangeDice(t.ind[1]));
      coins[t.ind[0]] += n * mult; lines.push(`${tag}: ${n * mult} ${COIN[t.ind[0]]} (${t.ind[1]} each × ${individuals})`); continue;
    }
    for (const k of Object.keys(COIN)) {
      if (!t[k]) continue;
      const pct = await d100();
      if (pct > t[k][1]) { lines.push(`${tag} ${COIN[k]}: d% ${pct} vs ${t[k][1]}%, none`); continue; }
      const n = (await roll(rangeDice(t[k][0]))) * (k === "pp" ? 100 : 1000) * mult;
      coins[k] += n; lines.push(`${tag} ${COIN[k]}: d% ${pct}, ${n.toLocaleString()}`);
    }
    for (const k of ["gems", "jewelry"]) {
      if (!t[k]) continue;
      const pct = await d100();
      if (pct > t[k][1]) { lines.push(`${tag} ${k}: d% ${pct} vs ${t[k][1]}%, none`); continue; }
      const n = (await roll(rangeDice(t[k][0]))) * mult;
      if (k === "gems") gems += n; else jewelry += n;
      lines.push(`${tag} ${k}: d% ${pct}, ${n}`);
    }
    if (t.magic) {
      const pct = await d100();
      if (pct > t.magic[0]) { lines.push(`${tag} maps or magic: d% ${pct} vs ${t.magic[0]}%, none`); continue; }
      lines.push(`${tag} maps or magic: d% ${pct}, ${t.magic[1]}`);
      results.push(...await magicSpec(t.magic[1], source));
    }
  }
  return { coins, gems, jewelry, lines, results };
}

/* ------------------------------------------------------------------ */
/*  Dialog and chat card                                                */
/* ------------------------------------------------------------------ */
export async function treasureDialog({ types = "", individuals = 1, title = "Roll Treasure" } = {}) {
  if (!game.user.isGM) return;
  const src = game.settings.get(ID, "magicTables");
  const content = `<div class="frpg1e-form">
    <div class="row"><span class="lbl">Treasure types</span><input type="text" name="types" value="${foundry.utils.escapeHTML?.(types) ?? types}" placeholder="e.g. D, Q (×5)"></div>
    <div class="row"><span class="lbl">Individuals (J-N)</span><input type="number" name="individuals" value="${individuals}" min="1" class="w4"></div>
    <div class="row"><span class="lbl">Extra gems</span><input type="number" name="gems" value="0" min="0" class="w4"></div>
    <div class="row"><span class="lbl">Extra jewelry</span><input type="number" name="jewelry" value="0" min="0" class="w4"></div>
    <div class="row"><span class="lbl">Extra magic items</span><input type="number" name="magic" value="0" min="0" class="w4"></div>
    <div class="row"><span class="lbl">Magic item tables</span><select name="source">
      <option value="UA" ${src === "UA" ? "selected" : ""}>UA (revised)</option>
      <option value="DMG" ${src === "DMG" ? "selected" : ""}>DMG</option></select></div>
    <p class="hint">Treasure types A-Z from the MM (p.105). Edit the letters to those that apply (for example only the individual types when the monsters are not in their lair). The MM advises scaling treasure down for few monsters and up for many.</p></div>`;
  const res = await DialogV2.wait({
    window: { title }, classes: ["frpg1e-dialog"], content, rejectClose: false,
    buttons: [{ action: "roll", label: "Roll", default: true, callback: (ev, b) => {
      const e = b.form.elements;
      return { types: e.types.value, individuals: Math.max(1, Number(e.individuals.value) || 1), gems: Number(e.gems.value) || 0,
        jewelry: Number(e.jewelry.value) || 0, magic: Number(e.magic.value) || 0, source: e.source.value };
    } }]
  });
  if (!res) return;
  return rollTreasure(res);
}

export async function rollTreasure({ types = "", individuals = 1, gems = 0, jewelry = 0, magic = 0, source = "UA" } = {}) {
  const results = [];
  const tt = parseTreasureTypes(types);
  const typed = tt.length ? await rollTreasureTypes(tt, { individuals, source }) : null;
  const nGems = gems + (typed?.gems ?? 0), nJewel = jewelry + (typed?.jewelry ?? 0);
  for (let i = 0; i < nGems; i++) results.push(await rollGem());
  for (let i = 0; i < nJewel; i++) results.push(await rollJewelry());
  if (typed) results.push(...typed.results);
  for (let i = 0; i < magic; i++) results.push(await rollMagicItem(source));
  const total = results.reduce((t, r) => t + (r.value ?? 0), 0);
  const coinRows = typed ? Object.entries(typed.coins).filter(([, n]) => n).map(([k, n]) => `<li><strong>${n.toLocaleString()} ${COIN[k]} pieces</strong> · ${fmt(n * COIN_GP[k])}</li>`).join("") : "";
  const coinGP = typed ? Object.entries(typed.coins).reduce((t, [k, n]) => t + n * COIN_GP[k], 0) : 0;
  const rows = results.map(r => `<li><strong>${r.label}</strong>${r.value !== null ? ` · ${fmt(r.value)}` : ""}${r.missing ? ` <em>(not found in the compendium: import the book compendia)</em>` : ""}<div class="hint">${r.detail}</div></li>`).join("");
  const content = `<div class="frpg1e-card treasure-card"><div class="card-title">Treasure${tt.length ? `: ${tt.map(t => t.type + (t.mult > 1 ? ` (×${t.mult})` : "")).join(", ")}` : ""}</div>
    ${typed ? `<details class="hint"><summary>Treasure type rolls</summary>${typed.lines.join("<br>")}</details>` : ""}
    <ul class="treasure-list">${coinRows}${rows}</ul>
    ${coinGP ? `<div class="roll-line"><span class="vs">Coins</span><span class="adnd-big">${fmt(coinGP)}</span></div>` : ""}
    ${total ? `<div class="roll-line"><span class="vs">Gems and jewelry</span><span class="adnd-big">${fmt(total)}</span></div>` : ""}
    <div class="card-buttons"><button type="button" data-card-action="treasure-give">Give to selected token</button></div></div>`;
  return ChatMessage.create({
    content, whisper: ChatMessage.getWhisperRecipients("GM"), speaker: { alias: "Treasure" },
    flags: { [ID]: { type: "treasure", items: results.filter(r => r.data).map(r => r.data), coins: typed?.coins ?? null } }
  });
}

export async function giveTreasure(message) {
  const items = message.flags?.[ID]?.items ?? [];
  const actor = canvas?.tokens?.controlled?.[0]?.actor ?? game.user.character;
  if (!actor) return ui.notifications.warn("Select a token (or set your user character) to receive the treasure.");
  if (!items.length) return;
  await actor.createEmbeddedDocuments("Item", items.map(i => { const d = foundry.utils.deepClone(i); delete d._id; return d; }));
  ui.notifications.info(`${items.length} item${items.length > 1 ? "s" : ""} given to ${actor.name}.`);
}
