/**
 * Artifacts and relics (DMG p.155-164): each artifact lists a number of powers and effects from the six
 * ARTIFACTS AND RELICS POWERS/EFFECTS TABLES, which the DM selects and records (DMG p.155). This module rolls
 * them (or lets the DM pick), records them on the item (flags.frpg1e.artifact) and posts them to the GM only.
 *
 * State on the item: { key, ethos, variant, picks: { "g_s_n": "A" } }  (group, slot, nth power of that slot).
 * Keys use underscores: Foundry reads dots in update keys as paths.
 */
const SYSTEM_ID = "frpg1e";
let DATA = null;

export async function artifactData() {
  if (!DATA) DATA = await (await fetch(`systems/${SYSTEM_ID}/data/artifacts.json`)).json();
  return DATA;
}
export const TABLE_KEYS = ["I", "II", "III", "IV", "V", "VI"];

const state = item => {
  const st = foundry.utils.deepClone(item.getFlag(SYSTEM_ID, "artifact") ?? {});
  if (st.picks) for (const [k, v] of Object.entries(st.picks)) if (typeof v !== "string" || !/^\d+_\d+_\d+$/.test(k)) delete st.picks[k];
  return st;
};
const keyOf = (item, data) => {
  const st = item.getFlag(SYSTEM_ID, "artifact") ?? {};
  if (st.key && data.items[st.key]) return st.key;
  return data.items[item.name] ? item.name : "";
};

/** Every slot of the chosen variant: [{ id, g, table, groupLabel }] */
function slotsOf(def, variant) {
  const v = def.variants[variant] ?? def.variants[0];
  const out = [];
  (v?.groups ?? []).forEach((grp, g) => grp.slots.forEach(([table, n], s) => {
    for (let k = 0; k < n; k++) out.push({ id: `${g}_${s}_${k}`, g, table });
  }));
  return out;
}

const rollDie = async formula => (await new Roll(formula).evaluate()).total;

/** Random letter from a table, avoiding letters already used for that table on this item (DMG gives no repeat rule; no duplicates is this system's choice). */
async function randomLetter(data, table, used) {
  const entries = data.tables[table].entries;
  const free = entries.filter(e => !used.has(`${table}:${e.l}`));
  const pool = free.length ? free : entries;
  const i = (await rollDie(`1d${pool.length}`)) - 1;
  return pool[i].l;
}

/** Sheet context for an artifact item (GM only). */
export async function artifactContext(item) {
  if (item.type !== "magic") return null;
  const data = await artifactData();
  const key = keyOf(item, data);
  const isArtifact = key || item.system.category === "artifact";
  if (!isArtifact) return null;
  const choices = Object.keys(data.items).sort().map(k => ({ value: k, label: k }));
  if (!key) return { key: "", choices, unmatched: true };
  const def = data.items[key];
  const st = state(item);
  const ctx = { key, choices, note: def.note ?? "", touch: def.touch ?? "", ethosOn: !!def.ethos, ethos: st.ethos ?? "", ethosLocked: !!st.ethos };
  if (def.horn) {
    ctx.horn = true; ctx.hornChance = def.horn.chance;
    ctx.blasts = def.horn.blasts.map(([p, e], i) => ({ n: i + 1, power: p, effect: e, label: `${i + 1} blast${i ? "s" : ""}: Table ${p} power or Table ${e} effect` }));
    return ctx;
  }
  const variant = Number(st.variant ?? 0);
  ctx.variants = def.variants.length > 1 ? def.variants.map((v, i) => ({ value: i, label: v.label, selected: i === variant })) : null;
  const v = def.variants[variant] ?? def.variants[0];
  const picks = st.picks ?? {};
  let total = 0, chosen = 0;
  ctx.groups = v.groups.map((grp, g) => ({
    label: grp.label, note: grp.note ?? "",
    rows: grp.slots.flatMap(([table, n], s) => Array.from({ length: n }, (_, k) => {
      const id = `${g}_${s}_${k}`; const l = picks[id] ?? ""; total++; if (l) chosen++;
      const t = data.tables[table];
      return { id, table, tableTitle: t.title, letter: l, text: l ? (t.entries.find(e => e.l === l)?.t ?? "") : "" };
    }))
  }));
  ctx.total = total; ctx.chosen = chosen; ctx.complete = total > 0 && chosen === total;
  ctx.locked = chosen > 0;   // rolled once for all slots; then fixed
  return ctx;
}

/** Replace the whole state (setFlag merges, which would keep removed picks): clear it, then write it. */
async function save(item, st) {
  await item.update({ [`flags.${SYSTEM_ID}.-=artifact`]: null }, { render: false });
  await item.update({ [`flags.${SYSTEM_ID}.artifact`]: st });
}

export async function setKey(item, key) {
  const st = state(item);
  if (st.ethos || (st.picks && Object.keys(st.picks).length)) return ui.notifications.warn("This artifact's powers have already been rolled.");
  st.key = key; st.picks = {}; st.variant = 0; st.ethos = ""; await save(item, st);
}
export async function setVariant(item, variant) {
  const st = state(item);
  if (st.picks && Object.keys(st.picks).length) return ui.notifications.warn("This artifact's powers have already been rolled.");
  st.variant = Number(variant) || 0; st.picks = {}; await save(item, st);
}
export async function setPick(item, id, letter) {
  const st = state(item); st.picks ??= {};
  if (letter) st.picks[id] = letter; else delete st.picks[id];
  await save(item, st);
}
export async function setEthos(item, ethos) { const st = state(item); st.ethos = ethos; await save(item, st); }

export async function rollEthos(item) {
  const data = await artifactData(); const def = data.items[keyOf(item, data)];
  if (!def?.ethos) return;
  if (state(item).ethos) return ui.notifications.warn("This artifact's ethos has already been rolled.");
  const r = await new Roll(def.ethos.die).evaluate();
  const row = def.ethos.rows.find(([lo, hi]) => r.total >= lo && r.total <= hi);
  await setEthos(item, row[2]);
  return { roll: r.total, ethos: row[2] };
}

/** Roll every empty slot (or all slots when reroll is true). */
export async function rollPowers(item, { reroll = false, only = null } = {}) {
  const data = await artifactData(); const key = keyOf(item, data); const def = data.items[key];
  if (!def || def.horn) return;
  const st = state(item); st.key = key; st.picks ??= {};
  if (Object.keys(st.picks).length) return ui.notifications.warn("This artifact's powers have already been rolled.");
  const slots = slotsOf(def, Number(st.variant ?? 0));
  if (reroll && !only) st.picks = {};
  const used = new Set(slots.filter(s => st.picks[s.id] && s.id !== only).map(s => `${s.table}:${st.picks[s.id]}`));
  for (const s of slots) {
    if (only ? s.id !== only : (st.picks[s.id] && !reroll)) continue;
    const l = await randomLetter(data, s.table, used);
    st.picks[s.id] = l; used.add(`${s.table}:${l}`);
  }
  if (def.ethos && !st.ethos) {
    const r = await new Roll(def.ethos.die).evaluate();
    st.ethos = def.ethos.rows.find(([lo, hi]) => r.total >= lo && r.total <= hi)[2];
  }
  await save(item, st);
}

const esc = s => foundry.utils.escapeHTML ? foundry.utils.escapeHTML(String(s)) : String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

/** Whisper the recorded powers to the GM. */
export async function postPowers(item) {
  const data = await artifactData(); const ctx = await artifactContext(item);
  if (!ctx?.groups) return;
  const variant = ctx.variants?.find(v => v.selected)?.label;
  let html = `<div class="frpg1e-card artifact-card"><h3>${esc(item.name)}${variant ? ` — ${esc(variant)}` : ""}</h3>`;
  if (ctx.ethosOn) html += `<p><strong>Ethos:</strong> ${esc(ctx.ethos || "not rolled")}</p>`;
  for (const g of ctx.groups) {
    html += `<h4>${esc(g.label)}</h4><ul>` + g.rows.map(r => `<li><strong>${r.table}${r.letter ? "." + r.letter : ""}</strong> ${r.letter ? esc(r.text) : "<em>not chosen</em>"}</li>`).join("") + `</ul>`;
    if (g.note) html += `<p class="hint">${esc(g.note)}</p>`;
  }
  html += `<p class="hint">DMG p.162-164. Players learn these only through experimentation, legends, legend lore, etc. (DMG p.155).</p></div>`;
  await ChatMessage.create({ content: html, speaker: ChatMessage.getSpeaker(), whisper: ChatMessage.getWhisperRecipients("GM").map(u => u.id) });
}

/** Horn of Change: each blowing gives a power or an effect (DM's chance, 75%/25% suggested), rolled on the right table. */
export async function blowHorn(item, blasts, chance = 75) {
  const data = await artifactData(); const def = data.items[keyOf(item, data)];
  if (!def?.horn) return;
  const [p, e] = def.horn.blasts[blasts - 1];
  const d = await rollDie("1d100");
  const table = d <= chance ? p : e;
  const t = data.tables[table];
  const i = (await rollDie(`1d${t.entries.length}`)) - 1;
  const entry = t.entries[i];
  const html = `<div class="frpg1e-card artifact-card"><h3>${esc(item.name)}: blown ${blasts} time${blasts > 1 ? "s" : ""}</h3>
    <p>d100 ${d} vs ${chance}%: ${d <= chance ? "power" : "effect"} from ${esc(t.title)}</p>
    <p><strong>${table}.${entry.l}</strong> ${esc(entry.t)}</p><p class="hint">Ignore results that do not make sense (DMG).</p></div>`;
  await ChatMessage.create({ content: html, speaker: ChatMessage.getSpeaker(), whisper: ChatMessage.getWhisperRecipients("GM").map(u => u.id) });
}

/** Wire the controls of the artifact box on an item sheet. */
export function bindArtifactControls(sheet, root) {
  const item = sheet.item;
  const box = root?.querySelector?.(".artifact-box");
  if (!box || !game.user.isGM) return;
  if (box.dataset.bound) return;
  box.dataset.bound = "1";
  // A copy in a locked compendium (or one the user cannot edit) cannot record anything: say so instead of failing silently.
  const locked = () => {
    if (item.pack && game.packs.get(item.pack)?.locked) return "This artifact is in a locked compendium. Drag it into the Items directory or onto a character first, then roll its powers there.";
    if (!item.isOwner) return "You cannot change this item.";
    return "";
  };
  const on = (sel, ev, fn, { readOnly = false } = {}) => box.querySelectorAll(sel).forEach(el => el.addEventListener(ev, async e => {
    e.preventDefault(); e.stopPropagation();
    const why = readOnly ? "" : locked();
    if (why) return ui.notifications.warn(why);
    try { await fn(el); }
    catch (err) { console.error("frpg1e | artifact powers", err); ui.notifications.error(`Artifact powers: ${err.message ?? err}`); }
  }));
  on("[data-art-key]", "change", el => setKey(item, el.value));
  on("[data-art-variant]", "change", el => setVariant(item, el.value));
  on("[data-art-roll-ethos]", "click", () => rollEthos(item));
  on("[data-art-roll-empty]", "click", () => rollPowers(item));
  on("[data-art-post]", "click", () => postPowers(item), { readOnly: true });
  on("[data-art-blow]", "click", el => blowHorn(item, Number(el.dataset.artBlow), Number(box.querySelector("[data-art-chance]")?.value) || 75), { readOnly: true });
}
