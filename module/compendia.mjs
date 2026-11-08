/**
 * Builds world compendia from the JSON data shipped with the system.
 * (Foundry V11+ packs are LevelDB databases; building them in-world avoids
 * shipping a compiled database and keeps the data easy to inspect.)
 */
import { getArtIndex, applyArtToData } from "./monsterart.mjs";
const ID = "frpg1e";
const DATA_VERSION = "30";
const LIST_LABEL = { cleric: "Cleric", druid: "Druid", magicuser: "Magic-User", illusionist: "Illusionist" };
const ORD = ["Cantrips:", "1st", "2nd", "3rd", "4th", "5th", "6th", "7th", "8th", "9th"];

const MAGIC_FOLDER = { potion: "Potions & Oils", scroll: "Scrolls", ring: "Rings", rod: "Rods", staff: "Staves", wand: "Wands",
  misc: "Miscellaneous Magic", artifact: "Artifacts & Relics", ammunition: "Magic Ammunition", reference: "Reference Tables" };
const spellFolder = d => (d.system.level === 0 ? `${LIST_LABEL[d.system.list]} cantrips` : `${LIST_LABEL[d.system.list]} ${ORD[d.system.level]} level`);
const magicFolder = d => (d.type === "armor" ? "Magic Armor & Shields" : d.type === "weapon" ? (/^(Sword|Sun Blade)/.test(d.name) ? "Magic Swords" : "Magic Weapons") : MAGIC_FOLDER[d.system.category] ?? "Miscellaneous Magic");
const gemFolder = d => ({ ornamental: "Ornamental stones (10 gp)", "semi-precious": "Semi-precious stones (50 gp)", fancy: "Fancy stones (100-500 gp)", gem: "Gem stones (1,000+ gp)" })[d.system.class] ?? "Gems";

const PACKS = [
  { name: "frpg1e-weapons", label: "1e FRPG Weapons (UA)", file: "weapons.json" },
  { name: "frpg1e-armor", label: "1e FRPG Armor (PHB/DMG/UA)", file: "armor.json" },
  { name: "frpg1e-equipment", label: "1e FRPG Equipment (PHB)", file: "equipment.json", folder: d => d.system.category },
  { name: "frpg1e-spells", label: "1e FRPG Spells (PHB)", file: "spells.json", folder: spellFolder },
  { name: "frpg1e-spells-ua", label: "1e FRPG Spells & Cantrips (UA)", file: "spells-ua.json", folder: spellFolder },
  { name: "frpg1e-psionics", label: "1e FRPG Psionic Disciplines (PHB)", file: "psionics.json" },
  { name: "frpg1e-magic", label: "1e FRPG Magic Items (DMG/UA)", file: "magic-items.json", folder: magicFolder },
  { name: "frpg1e-gems", label: "1e FRPG Gems (DMG)", file: "gems.json", folder: gemFolder },
  { name: "frpg1e-monsters-mm", label: "1e FRPG MM", file: "monsters-mm.json", type: "Actor", folder: d => d.folder },
  { name: "frpg1e-monsters-mm2", label: "1e FRPG MMII", file: "monsters-mm2.json", type: "Actor", folder: d => d.folder },
  { name: "frpg1e-monsters-ff", label: "1e FRPG FF", file: "monsters-ff.json", type: "Actor", folder: d => d.folder },
  { name: "frpg1e-proficiencies", label: "1e FRPG Nonweapon Proficiencies (DSG/WSG)", file: "proficiencies.json", folder: d => ({ craftsman: "Craftsman (DSG)", adventuring: "Adventuring (DSG)", wilderness: "Wilderness (WSG)" })[d.system.group] }
];

export async function offerImport() {
  if (game.settings.get(ID, "compendiaVersion") === DATA_VERSION) return;
  const ok = await foundry.applications.api.DialogV2.confirm({
    window: { title: "1e FRPG: Book Compendia" },
    content: `<p>Create world compendia with the weapons, armor, equipment, spells, psionic disciplines, magic items, gems, nonweapon proficiencies and the MM, MMII and FF monsters?</p>
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
    let docs = data;
    if (def.folder) {
      const names = [...new Set(data.map(def.folder).filter(Boolean))].sort();
      const folders = await Folder.createDocuments(names.map(name => ({ name, type, sorting: "a" })), { pack: pack.collection });
      const byName = new Map(folders.map(f => [f.name, f.id]));
      docs = data.map(d => ({ ...d, folder: byName.get(def.folder(d)) ?? null }));
    }
    if (type === "Actor") artMatched += applyArtToData(docs, artIndex);
    const cls = type === "Actor" ? Actor : Item;
    for (let i = 0; i < docs.length; i += 100) await cls.createDocuments(docs.slice(i, i + 100), { pack: pack.collection });
    ui.notifications.info(`${def.label}: ${docs.length} entries.`);
  }
  if (artIndex) ui.notifications.info(`Monster art: ${artMatched} monsters given their "Token ..." image.`);
  await game.settings.set(ID, "compendiaVersion", DATA_VERSION);
}
