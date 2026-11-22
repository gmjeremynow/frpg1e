/**
 * Copy every spell from the Item compendia (the system's and any class module's) into the world's Items
 * directory, foldered Spells › class › Level N (cantrips in "Cantrips"). A GM button in the Items sidebar.
 * Re-running replaces the whole Spells folder (its subfolders and the spells in them).
 */
import { SPELL_LISTS } from "./tables.mjs";
import { makeFolders } from "./compendia.mjs";

const ROOT = "Spells";

export async function buildSpellFolders() {
  if (!game.user.isGM) return;
  const old = game.folders.find(f => f.type === "Item" && f.name === ROOT && !f.folder);
  const ok = await foundry.applications.api.DialogV2.confirm({
    window: { title: "Spells in the Items directory" }, classes: ["frpg1e-dialog"],
    content: `<p>Copy every spell from the Item compendia (the system's and your class modules') into the Items directory, foldered <strong>Spells › class › level</strong>?</p>
      ${old ? `<p><strong>The existing “${ROOT}” folder, its subfolders and every item in them will be replaced.</strong> Spells you edited there will be lost.</p>` : ""}
      <p class="hint">These are world copies: a later compendium rebuild does not change them; run this again to refresh them.</p>`
  });
  if (!ok) return;
  ui.notifications.info("Gathering spells from the compendia…");

  // system packs first, so their copy wins when a module repeats a spell on the same list and level
  const packs = game.packs.filter(p => p.documentName === "Item")
    .sort((a, b) => (a.metadata.name.startsWith("frpg1e-spells") ? 0 : 1) - (b.metadata.name.startsWith("frpg1e-spells") ? 0 : 1));
  const seen = new Set(), docs = [];
  for (const pack of packs) {
    const index = await pack.getIndex({ fields: ["type", "system.list", "system.level"] });
    const ids = index.filter(e => e.type === "spell").map(e => e._id);
    if (!ids.length) continue;
    const found = await pack.getDocuments({ _id__in: ids });
    for (const d of found) {
      const key = `${d.system.list}|${d.system.level}|${d.name.toLowerCase()}`;
      if (seen.has(key)) continue;
      seen.add(key);
      docs.push(d);
    }
  }
  if (!docs.length) return ui.notifications.warn("No spells found in the Item compendia.");

  if (old) await old.delete({ deleteSubfolders: true, deleteContents: true });
  const label = list => SPELL_LISTS[list] ?? (list ? list.charAt(0).toUpperCase() + list.slice(1) : "Other");
  const pathOf = d => [ROOT, label(d.system.list), d.system.level === 0 ? "Cantrips" : `Level ${d.system.level}`];
  const byPath = await makeFolders(docs.map(pathOf), "Item");
  const data = docs.map(d => {
    const o = game.items.fromCompendium(d);
    o.folder = byPath.get(pathOf(d).join("/")) ?? null;
    return o;
  });
  for (let i = 0; i < data.length; i += 100) await Item.createDocuments(data.slice(i, i + 100));
  const lists = new Set(docs.map(d => label(d.system.list)));
  ui.notifications.info(`${data.length} spells copied into Items › ${ROOT} (${[...lists].sort().join(", ")}).`);
}

/** Add the button to the Items sidebar (GM only). */
export function registerSpellFolderButton() {
  Hooks.on("renderItemDirectory", (app, html) => {
    if (!game.user.isGM) return;
    const root = html instanceof HTMLElement ? html : html?.[0];
    if (!root || root.querySelector(".frpg1e-spell-folders")) return;
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "frpg1e-spell-folders";
    btn.innerHTML = `<i class="fa-solid fa-book"></i> Spells by class and level`;
    btn.title = "Copy every compendium spell into Items, foldered Spells › class › level";
    btn.addEventListener("click", ev => { ev.preventDefault(); buildSpellFolders(); });
    const where = root.querySelector(".header-actions") ?? root.querySelector(".directory-header") ?? root;
    where.append(btn);
  });
}
