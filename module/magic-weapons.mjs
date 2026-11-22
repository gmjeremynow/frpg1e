/**
 * Magic items that are also weapons (staves, some rods, tridents, the titans' tools, some artifacts...).
 * When such an item is put on an actor, a linked weapon entry is added for each weapon form, built from the
 * base weapon (data/weapons.json) with the item's magic bonus, so it attacks like any other weapon.
 * The weapon entries carry flags.frpg1e.linkedMagic = the magic item's id and go when the magic item goes.
 * Items with random versions (data "choose") ask the GM which version, or roll it.
 */
const SYSTEM_ID = "frpg1e";
let MAP = null, BASES = null;

async function data() {
  if (!MAP) MAP = await (await fetch(`systems/${SYSTEM_ID}/data/magic-weapons.json`)).json();
  if (!BASES) BASES = Object.fromEntries((await (await fetch(`systems/${SYSTEM_ID}/data/weapons.json`)).json()).map(w => [w.name, w]));
  return { map: MAP, bases: BASES };
}

export async function weaponDef(item) {
  if (item?.type !== "magic") return null;
  return (await data()).map[item.name] ?? null;
}

/** "1d6+2" -> "3-8" (dice of one kind plus a flat bonus). */
function rangeText(formula, bonus = 0) {
  const m = String(formula).replace(/\s/g, "").match(/^(\d*)d(\d+)([+-]\d+)?$/i);
  if (!m) return "";
  const n = Number(m[1] || 1), d = Number(m[2]), k = Number(m[3] || 0) + bonus;
  return `${n + k}-${n * d + k}`;
}

export const linkedWeapons = (actor, magicId) => actor.items.filter(i => i.type === "weapon" && i.getFlag(SYSTEM_ID, "linkedMagic") === magicId);

function buildWeapon(magic, form, bases) {
  const base = foundry.utils.deepClone(bases[form.base]);
  const s = base.system;
  if (form.sm) s.damage.sm = form.sm;
  if (form.l) s.damage.l = form.l;
  s.damage.smRange = rangeText(s.damage.sm, form.dmg);
  s.damage.lRange = rangeText(s.damage.l, form.dmg);
  if (form.attackType) s.attackType = form.attackType;
  if (form.missile) { s.missile = { ...s.missile, ...form.missile }; if (s.attackType === "melee") s.attackType = "both"; }
  s.magic = { hit: form.hit ?? 0, dmg: form.dmg ?? 0, vs: [] };
  s.weight = 0; s.weightText = "on the magic item";
  s.quantity = form.quantity ?? 1;
  s.equipped = true;
  s.description = `<p>Weapon form of <strong>${magic.name}</strong> (counted on the Magic Items list; its weight and charges are there).</p>${form.note ? `<p>${form.note}</p>` : ""}`;
  return {
    name: `${magic.name} (${form.label})`, type: "weapon", img: magic.img || base.img,
    system: s, flags: { [SYSTEM_ID]: { linkedMagic: magic.id, baseWeapon: form.base } }
  };
}

/** Ask which version a random-version item is (or roll it). Returns the option, or null if cancelled. */
async function chooseVersion(magic, choose) {
  const opts = choose.options.map((o, i) => `<option value="${i}">${o.lo === o.hi ? o.lo : `${o.lo}-${o.hi}`}: ${o.label}</option>`).join("");
  const res = await foundry.applications.api.DialogV2.wait({
    window: { title: `${magic.name}: which version?` }, classes: ["frpg1e-dialog"], rejectClose: false,
    content: `<p>${choose.note ?? ""} Choose the version found, or roll ${choose.die}.</p>
      <div class="form-group"><label>Version</label><select name="version">${opts}</select></div>`,
    buttons: [
      { action: "roll", label: `Roll ${choose.die}`, icon: "fa-solid fa-dice", default: true, callback: () => "roll" },
      { action: "pick", label: "Use this version", callback: (e, b) => Number(b.form.elements.version.value) }
    ]
  });
  if (res === null || res === undefined) return null;
  if (res === "roll") {
    const r = await new Roll(choose.die).evaluate();
    const o = choose.options.find(x => r.total >= x.lo && r.total <= x.hi);
    await ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor: magic.parent }), whisper: ChatMessage.getWhisperRecipients("GM").map(u => u.id),
      content: `<div class="frpg1e-card"><div class="card-title">${magic.name}</div><p>${choose.die}: <strong>${r.total}</strong>, ${o.label}</p></div>` });
    return o;
  }
  return choose.options[res];
}

/** Add the weapon entries for a magic item on an actor (skips forms already there). */
export async function addWeapons(magic, { ask = true } = {}) {
  const actor = magic.parent;
  if (!actor || magic.type !== "magic" || !actor.isOwner) return 0;
  const { map, bases } = await data();
  const def = map[magic.name];
  if (!def) return 0;
  let forms = def.forms ?? [];
  if (def.choose) {
    const saved = magic.getFlag(SYSTEM_ID, "weaponVersion");
    let opt = def.choose.options.find(o => o.label === saved);
    if (!opt) {
      if (!ask) return 0;
      opt = await chooseVersion(magic, def.choose);
      if (!opt) return 0;
      await magic.setFlag(SYSTEM_ID, "weaponVersion", opt.label);
    }
    forms = opt.forms;
  }
  const have = new Set(linkedWeapons(actor, magic.id).map(w => w.name));
  const docs = forms.map(f => buildWeapon(magic, f, bases)).filter(d => !have.has(d.name));
  if (docs.length) await actor.createEmbeddedDocuments("Item", docs);
  return docs.length;
}

export function registerMagicWeaponHooks() {
  Hooks.on("createItem", (item, options, userId) => {
    if (userId !== game.user.id || item.type !== "magic" || item.parent?.documentName !== "Actor") return;
    addWeapons(item).catch(e => console.warn("frpg1e | magic item weapon", e));
  });
  Hooks.on("deleteItem", (item, options, userId) => {
    if (userId !== game.user.id || item.type !== "magic" || item.parent?.documentName !== "Actor") return;
    const ids = linkedWeapons(item.parent, item.id).map(w => w.id);
    if (ids.length) item.parent.deleteEmbeddedDocuments("Item", ids).catch(e => console.warn("frpg1e | magic item weapon", e));
  });
}

/** One-time: add weapon entries for such items already on actors (random-version items are left for the sheet button). */
export async function migrateMagicWeapons() {
  let n = 0;
  for (const actor of game.actors) for (const it of actor.items.filter(i => i.type === "magic")) {
    if (linkedWeapons(actor, it.id).length) continue;
    n += await addWeapons(it, { ask: false });
  }
  return n;
}
