/**
 * Builds world compendia from the JSON data shipped with the system.
 * (Foundry V11+ packs are LevelDB databases; building them in-world avoids
 * shipping a compiled database and keeps the data easy to inspect.)
 */
import { getArtIndex, applyArtToData } from "./monsterart.mjs";
const ID = "frpg1e";
const DATA_VERSION = "50";
const LIST_LABEL = { cleric: "Cleric", druid: "Druid", magicuser: "Magic-User", illusionist: "Illusionist" };
const ORD = ["Cantrips:", "1st", "2nd", "3rd", "4th", "5th", "6th", "7th", "8th", "9th"];

const MAGIC_FOLDER = { potion: "Potions & Oils", scroll: "Scrolls", ring: "Rings", rod: "Rods", staff: "Staves", wand: "Wands",
  misc: "Miscellaneous Magic", artifact: "Artifacts & Relics", ammunition: "Magic Ammunition", reference: "Reference Tables" };
// nested: class › level (folders may be a path; see makeFolders)
const spellFolder = d => [LIST_LABEL[d.system.list] ?? d.system.list, d.system.level === 0 ? "Cantrips" : `${ORD[d.system.level]} level`];
const magicFolder = d => (d.type === "armor" ? "Magic Armor & Shields" : d.type === "weapon" ? (/^(Sword|Sun Blade)/.test(d.name) ? "Magic Swords" : "Magic Weapons") : MAGIC_FOLDER[d.system.category] ?? "Miscellaneous Magic");
const gemFolder = d => ({ ornamental: "Ornamental stones (10 gp)", "semi-precious": "Semi-precious stones (50 gp)", fancy: "Fancy stones (100-500 gp)", gem: "Gem stones (1,000+ gp)" })[d.system.class] ?? "Gems";

/**
 * Create folders for a list of paths (a name, or an array of names from the top down). Returns path -> folder id.
 * Level folders ("Cantrips", "1st level" ...) keep their natural order; other folders sort alphabetically.
 */
const LEVEL_RE = /^(Cantrips|\d+(st|nd|rd|th) level|Level \d+)$/;
export async function makeFolders(paths, type, ctx = {}, { parentId = null, existing = new Map() } = {}) {
  const byPath = new Map(existing);
  const all = [...new Set(paths.filter(Boolean).map(p => [].concat(p).join("/")))];
  const levelSort = n => (n === "Cantrips" ? 0 : (parseInt(n, 10) || 99));
  for (let depth = 1; depth <= Math.max(0, ...all.map(p => p.split("/").length)); depth++) {
    const want = [...new Set(all.filter(p => p.split("/").length >= depth).map(p => p.split("/").slice(0, depth).join("/")))].filter(p => !byPath.has(p)).sort();
    if (!want.length) continue;
    const created = await Folder.createDocuments(want.map(p => {
      const parts = p.split("/"), name = parts.at(-1);
      const parent = depth === 1 ? parentId : byPath.get(parts.slice(0, -1).join("/"));
      const isLevel = LEVEL_RE.test(name);
      const levelKids = all.some(q => q.startsWith(p + "/") && LEVEL_RE.test(q.split("/")[depth] ?? ""));
      return { name, type, folder: parent, sorting: levelKids ? "m" : "a", sort: isLevel ? levelSort(name.replace(/^Level /, "")) * 1000 : 0 };
    }), ctx);
    want.forEach((p, i) => byPath.set(p, created[i].id));
  }
  return byPath;
}

const PACKS = [
  { name: "frpg1e-weapons", label: "Weapons (PHB/UA)", file: "weapons.json" },
  { name: "frpg1e-armor", label: "Armor (PHB/DMG/UA)", file: "armor.json" },
  { name: "frpg1e-equipment", label: "Equipment (PHB)", file: "equipment.json", folder: d => d.system.category },
  { name: "frpg1e-spells", label: "Spells (PHB)", file: "spells.json", folder: spellFolder },
  { name: "frpg1e-spells-ua", label: "Spells & Cantrips (UA)", file: "spells-ua.json", folder: spellFolder },
  { name: "frpg1e-psionics", label: "Psionic Disciplines (PHB)", file: "psionics.json" },
  { name: "frpg1e-magic", label: "Magic Items (DMG/UA)", file: "magic-items.json", folder: magicFolder },
  { name: "frpg1e-gems", label: "Gems (DMG)", file: "gems.json", folder: gemFolder },
  { name: "frpg1e-monsters-mm", label: "MM Creatures", file: "monsters-mm.json", type: "Actor", folder: d => d.folder },
  { name: "frpg1e-monsters-mm2", label: "MMII Creatures", file: "monsters-mm2.json", type: "Actor", folder: d => d.folder },
  { name: "frpg1e-monsters-ff", label: "FF Creatures", file: "monsters-ff.json", type: "Actor", folder: d => d.folder },
  { name: "frpg1e-artifact-tables", label: "Artifact & Relic Tables (DMG)", file: "artifacts.json", type: "RollTable", build: artifactRollTables },
  { name: "frpg1e-proficiencies", label: "Nonweapon Proficiencies (DSG/WSG)", file: "proficiencies.json", folder: d => ({ craftsman: "Craftsman (DSG)", adventuring: "Adventuring (DSG)", wilderness: "Wilderness (WSG)" })[d.system.group] }
];

/** DMG p.162-164 Artifacts and Relics Powers/Effects Tables I-VI as Foundry roll tables (one result per lettered entry). */
function artifactRollTables(data) {
  return Object.entries(data.tables).map(([k, t]) => ({
    name: t.title, description: t.note ? `<p>${t.note}</p><p>DMG p.162-164.</p>` : "<p>DMG p.162-164.</p>",
    formula: `1d${t.entries.length}`, replacement: true, displayRoll: true,
    results: t.entries.map((e, i) => ({ type: "text", name: `${k}.${e.l}`, description: e.t, text: `${e.l}. ${e.t}`, range: [i + 1, i + 1], weight: 1 }))
  }));
}

export async function offerImport() {
  if (game.settings.get(ID, "compendiaVersion") === DATA_VERSION) return;
  const ok = await foundry.applications.api.DialogV2.confirm({
    window: { title: "1e FRPG: Book Compendia" },
    content: `<p>Create world compendia with the weapons, armor, equipment, spells, psionic disciplines, magic items, gems, artifact and relic tables, nonweapon proficiencies and the MM, MMII and FF monsters?</p>
      <p class="hint">You can do this later from <em>Game Settings → Configure Settings → 1e FRPG</em>.</p>`,
    rejectClose: false
  });
  if (ok) await importCompendia();
  else await game.settings.set(ID, "compendiaVersion", DATA_VERSION);
}

export async function importCompendia({ confirm = false } = {}) {
  if (!game.user.isGM) return;
  if (confirm) {
    const ok = await foundry.applications.api.DialogV2.confirm({
      window: { title: "Import Book Compendia" },
      content: "<p>Rebuild the 1e FRPG book compendia? Existing copies in this world are replaced.</p>",
      rejectClose: false
    });
    if (!ok) return;
  }
  const CC = foundry.documents.collections.CompendiumCollection;
  const artIndex = await getArtIndex({ refresh: true });
  let artMatched = 0;
  for (const def of PACKS) {
    const data = await (await fetch(`systems/${ID}/data/${def.file}`)).json();
    const key = `world.${def.name}`;
    const existing = game.packs.get(key);
    if (existing) await existing.deleteCompendium();
    const type = def.type ?? "Item";
    const pack = await CC.createCompendium({ name: def.name, label: def.label, type });
    let docs = def.build ? def.build(data) : data;
    if (def.folder) {
      const byPath = await makeFolders(data.map(def.folder), type, { pack: pack.collection });
      docs = data.map(d => { const f = def.folder(d); return { ...d, folder: f ? byPath.get([].concat(f).join("/")) ?? null : null }; });
    }
    if (type === "Actor") artMatched += applyArtToData(docs, artIndex);
    const cls = type === "Actor" ? Actor : type === "RollTable" ? RollTable : Item;
    for (let i = 0; i < docs.length; i += 100) await cls.createDocuments(docs.slice(i, i + 100), { pack: pack.collection });
    ui.notifications.info(`${def.label}: ${docs.length} entries.`);
  }
  if (artIndex) ui.notifications.info(`Monster art: ${artMatched} monsters given their "Token ..." image.`);
  await game.settings.set(ID, "compendiaVersion", DATA_VERSION);
}
