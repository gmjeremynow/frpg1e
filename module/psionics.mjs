import { isPC } from "./actor-types.mjs";
/**
 * Psionics (PHB Appendix I; DMG p.76-78 psionic combat tables).
 */
import {
  PSI_ATTACK_MODES, PSI_DEFENSE_MODES, PSI_ATTACK_COUNT, PSI_DEFENSE_COUNT, PSI_DISCIPLINE_COUNT,
  psionicPotentialBonus, psionicStrengthBonus, PSI_VS_PSI, PSI_DEFENSELESS, PSI_LETTERS, PSI_BLAST_SAVE,
  PSI_BLAST_ADJ, psiBlastResult, PSI_BLAST_EFFECTS, psiBand, psiDefenselessCol, PSI_RECOVERY, PSI_BANDS
} from "./tables.mjs";

const ID = "frpg1e";
const { DialogV2 } = foundry.applications.api;
const { renderTemplate } = foundry.applications.handlebars;

async function card(actor, title, body, { rolls = [], flags = {} } = {}) {
  const content = `<div class="frpg1e-card psi-card"><div class="card-title">${title}</div>${body}</div>`;
  const msg = { speaker: ChatMessage.getSpeaker({ actor }), content, rolls, flags: { [ID]: flags } };
  ChatMessage.applyMode(msg);
  return ChatMessage.create(msg);
}
const d100 = r => (r === 0 ? 100 : r);

/* ------------------------------------------------------------------ */
/*  Generation                                                          */
/* ------------------------------------------------------------------ */
/** PHB p.110: unmodified int, wis or cha of 16+ may have psionic ability; 100+ on d% (with bonuses) has it. */
export async function rollPotential(actor) {
  const a = actor.system.abilities;
  const [i, w, c] = [a.int.value, a.wis.value, a.cha.value];
  if (i < 16 && w < 16 && c < 16) {
    return ui.notifications.info("Psionic ability requires an unmodified intelligence, wisdom or charisma of 16 or more.");
  }
  const roll = await new Roll("1d100").evaluate();
  const bonus = psionicPotentialBonus(i, w, c);
  const total = roll.total + bonus;
  const has = total >= 100;
  if (has && actor.isOwner) await actor.update({ "system.psionics.has": true });
  return card(actor, "Psionic Potential",
    `<div class="roll-line"><span class="adnd-big">${roll.total}</span><span class="mod">+${bonus}</span><span class="eq">=</span><span class="adnd-big">${total}</span><span class="vs">needs 100</span></div>
     <div class="result ${has ? "hit" : "miss"}">${has ? "PSIONIC" : "NOT PSIONIC"}</div>
     <div class="hint">Bonus: +2½ per point of intelligence over 16, +1½ wisdom, +½ charisma, fractions dropped.</div>`,
    { rolls: [roll] });
}

/** PHB p.110: d% + bonus = psionic strength; ability = 2 × strength; attack and defense strength each equal strength. */
export async function rollStrength(actor) {
  const a = actor.system.abilities;
  const bonus = psionicStrengthBonus(a.int.value, a.wis.value, a.cha.value);
  const r = await new Roll("1d100").evaluate();
  const strength = r.total + bonus;
  const am = await new Roll("1d100").evaluate();
  const dm = await new Roll("1d100").evaluate();
  const dd = await new Roll("1d100").evaluate();
  const atk = PSI_ATTACK_COUNT.find(([max]) => am.total <= max)[1];
  const def = PSI_DEFENSE_COUNT.find(([max]) => dm.total <= max)[1];
  const dis = PSI_DISCIPLINE_COUNT.find(([max]) => dd.total <= max);
  if (actor.isOwner) await actor.update({
    "system.psionics.has": true, "system.psionics.strength": strength,
    "system.psionics.attack": strength, "system.psionics.defense": strength
  });
  return card(actor, "Psionic Ability",
    `<div class="roll-line"><span class="adnd-big">${r.total}</span><span class="mod">+${bonus}</span><span class="eq">=</span><span class="adnd-big">${strength}</span><span class="vs">strength</span></div>
     <ul class="init-list">
       <li>Psionic ability <strong>${strength * 2}</strong>: attack ${strength}, defense ${strength}</li>
       <li>Attack modes (${am.total}): <strong>${atk}</strong>, chosen by the player</li>
       <li>Defense modes (${dm.total}): <strong>${def}</strong>, always including Mind Blank</li>
       <li>Disciplines (${dd.total}): <strong>${dis[1]} minor, ${dis[2]} major</strong>, determined randomly</li>
     </ul>
     <div class="hint">Only one minor discipline is gained at once, with one more (all minor first) every 2 levels (PHB p.111).</div>`,
    { rolls: [r, am, dm, dd] });
}

/* ------------------------------------------------------------------ */
/*  Psionic combat                                                      */
/* ------------------------------------------------------------------ */
function isPsionic(actor) { return !!actor?.system?.psionics?.has && actor.system.psionics.strength > 0; }

export async function psionicAttack(actor, modeKey) {
  const ps = actor.system.psionics;
  const mode = PSI_ATTACK_MODES[modeKey];
  if (!mode) return;
  if (ps.attack < mode.cost) return ui.notifications.warn(`${mode.label} costs ${mode.cost} attack points; ${actor.name} has ${ps.attack}.`);
  const target = Array.from(game.user.targets)[0]?.actor;
  if (!target) return ui.notifications.warn("Target one creature first.");
  if (!(await confirmOneActivity(actor, `Attack with ${mode.label}`))) return;
  const tps = target.system.psionics;
  const psionicTarget = isPsionic(target);
  if (!psionicTarget && modeKey !== "A") return ui.notifications.warn("Only a psionic blast can affect a non-psionic creature.");
  if (!psionicTarget && ps.attack < 100) return ui.notifications.warn("A psionic blast upon a non-psionic needs 100 or more current attack points (DMG IV.C).");

  const defOptions = psionicTarget && tps.defense > 0
    ? Object.entries(PSI_DEFENSE_MODES).filter(([k, d]) => tps.defenses[k] && tps.defense >= d.cost).map(([k, d]) => ({ key: k, label: `${k}. ${d.label} (${d.cost})` }))
    : [];
  const intWis = isPC(target) ? target.system.abilities.int.value + target.system.abilities.wis.value : (target.system.intWis ?? "");
  const content = await renderTemplate(`systems/${ID}/templates/apps/psionic-dialog.hbs`, {
    mode, ranges: mode.range, psionicTarget, defOptions, defenseless: psionicTarget && !defOptions.length,
    intWis, adjustments: PSI_BLAST_ADJ.map(([label, v], i) => ({ i, label, v: v > 0 ? `+${v}` : `${v}`, checked: label === "Mind bar" && !!tps?.mindBar })), targetName: target.name
  });
  const res = await DialogV2.wait({
    window: { title: `${mode.label} vs. ${target.name}` }, classes: ["frpg1e-dialog"], content, rejectClose: false,
    buttons: [{
      action: "go", label: "Attack", default: true,
      callback: (ev, button) => {
        const el = button.form.elements;
        const adj = PSI_BLAST_ADJ.reduce((t, [, v], i) => t + (el[`adj${i}`]?.checked ? v : 0), 0);
        const iw = el.intWis?.value;
        return { range: el.range?.value ?? "short", def: el.def?.value ?? "", intWis: iw === undefined || iw === "" ? null : Number(iw), adj };
      }
    }]
  });
  if (!res) return;
  if (!psionicTarget && res.intWis === null) return ui.notifications.warn("Enter the target's intelligence + wisdom total.");
  const rangeIdx = { short: 0, medium: 1, long: 2 }[res.range];
  const total = ps.attack + ps.defense;
  const rolls = [];
  let body = "", flags = { type: "psionic", attacker: actor.uuid, target: target.uuid, attackCost: mode.cost, defenseCost: 0, defenseLoss: 0, attackLoss: 0 };

  if (!psionicTarget) {
    // DMG IV.C: saving throw by intelligence + wisdom and range
    const row = PSI_BLAST_SAVE.find(r => res.intWis <= r[0]);
    const need = row[1 + rangeIdx];
    const save = await new Roll(`1d20 + ${res.adj}`).evaluate();
    rolls.push(save);
    const saved = save.total >= need;
    body += `<div class="roll-line"><span class="die">${save.dice[0].total}</span>${res.adj ? `<span class="mod">${res.adj > 0 ? "+" : ""}${res.adj}</span>` : ""}<span class="eq">=</span><span class="adnd-big">${save.total}</span><span class="vs">save needs ${need} (int+wis ${res.intWis}, ${res.range})</span></div>`;
    if (saved) body += `<div class="result hit">${target.name} SAVES</div>`;
    else {
      const eff = await new Roll("1d100").evaluate();
      rolls.push(eff);
      const outcome = psiBlastResult(res.intWis, d100(eff.total));
      body += `<div class="result miss">${outcome.toUpperCase()}</div><div class="hint">d% ${d100(eff.total)}. ${PSI_BLAST_EFFECTS[outcome]}</div>`;
    }
  } else if (!res.def) {
    // DMG IV.B: attack upon a defenseless psionic
    const band = psiBand(ps.attack);
    const col = psiDefenselessCol(tps.strength * 2);
    const v = PSI_DEFENSELESS[modeKey][band][col];
    body += `<div class="hint">${target.name} is defenseless. Attack strength ${ps.attack}, defender's psionic strength total ${tps.strength * 2}.</div>`;
    if (modeKey === "E") {
      const r = await new Roll("1d100").evaluate(); rolls.push(r);
      const killed = d100(r.total) <= v;
      body += `<div class="roll-line"><span class="adnd-big">${d100(r.total)}</span><span class="vs">vs ${v}%</span></div><div class="result ${killed ? "miss" : "hit"}">${killed ? "KILLED" : "No effect"}</div>`;
    } else if (typeof v === "number") {
      flags.attackLoss = v;
      body += `<div class="result miss">−${v} attack points</div><div class="hint">Points lost beyond 0 are taken as hit points.</div>`;
    } else body += `<div class="result miss">${v}</div><div class="hint">${PSI_LETTERS[v]}</div>`;
  } else {
    // DMG IV.A: psionic vs. psionic
    let band = psiBand(total);
    const lowest = band === 0;
    if (rangeIdx === 2) band = Math.max(0, band - 1);   // long range: attacker one strength category lower
    const defIdx = Object.keys(PSI_DEFENSE_MODES).indexOf(res.def);
    const v = PSI_VS_PSI[modeKey][band][defIdx];
    flags.defenseCost = PSI_DEFENSE_MODES[res.def].cost;
    body += `<div class="hint">${mode.label} vs. ${PSI_DEFENSE_MODES[res.def].label}; attacker total strength ${total}${rangeIdx === 2 ? " (one category lower at long range)" : ""}.</div>`;
    if (modeKey === "E") body += `<div class="hint">DMG IV.D footnote to Psychic Crush: "User may use only defense mode G, Thought Shield."</div>`;
    if (modeKey === "E") {
      if (v === null) body += `<div class="result hit">No chance of instant death</div>`;
      else {
        const r = await new Roll("1d100").evaluate(); rolls.push(r);
        const killed = d100(r.total) <= v;
        body += `<div class="roll-line"><span class="adnd-big">${d100(r.total)}</span><span class="vs">vs ${v}%</span></div><div class="result ${killed ? "miss" : "hit"}">${killed ? "KILLED" : "No effect"}</div>`;
      }
    } else {
      // DMG IV.D: medium range reduces damage 20%; long 20%, or 50% (fractions dropped) if already in the 01-25 band
      let loss = v;
      if (rangeIdx === 1) loss = Math.ceil(v * 0.8);
      if (rangeIdx === 2) loss = lowest ? Math.floor(v * 0.5) : Math.ceil(v * 0.8);
      flags.defenseLoss = loss;
      body += `<div class="result ${loss ? "miss" : "hit"}">−${loss} defense points${loss !== v ? ` <small>(table ${v})</small>` : ""}</div>`;
    }
  }
  body += `<div class="hint">Costs: ${actor.name} −${mode.cost} attack${flags.defenseCost ? `; ${target.name} −${flags.defenseCost} defense` : ""}. All attacks and defenses in a segment are simultaneous.</div>
    <div class="card-buttons"><button type="button" data-card-action="psi-apply">Apply points</button></div>`;
  return card(actor, `${mode.label}: ${actor.name} → ${target.name}`, body, { rolls, flags });
}

/** Apply the point costs and losses recorded on a psionic combat card. */
export async function applyPsionicCard(message) {
  const f = message.flags?.[ID];
  if (!f || f.type !== "psionic") return;
  const atk = await fromUuid(f.attacker);
  const tgt = await fromUuid(f.target);
  if (atk?.isOwner) await atk.update({ "system.psionics.attack": Math.max(0, atk.system.psionics.attack - f.attackCost) });
  if (tgt?.isOwner) {
    const p = tgt.system.psionics;
    const upd = {};
    if (f.defenseCost || f.defenseLoss) upd["system.psionics.defense"] = Math.max(0, p.defense - f.defenseCost - f.defenseLoss);
    if (f.attackLoss) {
      const left = p.attack - f.attackLoss;
      upd["system.psionics.attack"] = Math.max(0, left);
      // DMG IV.B: damage beyond 0 attack points is taken as hit points
      if (left < 0) upd["system.hp.value"] = tgt.system.hp.value + left;
    }
    if (Object.keys(upd).length) await tgt.update(upd);
  } else if (tgt) ui.notifications.warn(`Only the GM or ${tgt.name}'s owner can apply losses to it.`);
}

/** PHB p.116: strength recovered per hour by the least favorable activity in that hour. */
export async function psionicRecovery(actor) {
  const content = `<div class="frpg1e-form"><div class="row"><span class="lbl">Activity</span><select name="act">${Object.entries(PSI_RECOVERY).map(([k, [l, n]]) => `<option value="${k}" ${k === "resting" ? "selected" : ""}>${l} (${n}/hour)</option>`).join("")}</select></div>
    <div class="row"><span class="lbl">Hours</span><input type="number" name="hours" value="1" min="1" class="w4"></div></div>`;
  const res = await DialogV2.wait({
    window: { title: "Psionic Recovery" }, classes: ["frpg1e-dialog"], content, rejectClose: false,
    buttons: [{ action: "ok", label: "Recover", default: true, callback: (ev, b) => ({ act: b.form.elements.act.value, hours: Number(b.form.elements.hours.value) || 0 }) }]
  });
  if (!res) return;
  const [label, rate] = PSI_RECOVERY[res.act];
  const pts = rate * res.hours;
  const ps = actor.system.psionics;
  return card(actor, "Psionic Recovery",
    `<div class="roll-line"><span class="adnd-big">${pts}</span><span class="vs">strength points (${label}, ${res.hours} h)</span></div>
     <div class="hint">Attack and defense points count as ½ strength point each, so this restores up to ${pts * 2} attack and defense points in total (each to a maximum of ${ps.strength}). Divide them on the sheet.</div>`);
}

export { PSI_ATTACK_MODES, PSI_DEFENSE_MODES };

/* ------------------------------------------------------------------ */
/*  Disciplines                                                         */
/* ------------------------------------------------------------------ */
/* PHB p.111: "the employment of these powers costs psionic strength points, the equivalent
 * of 1 point each of attack and defense points." A cost of 5 removes 5 attack and 5 defense points.
 * Both pools must hold the full cost (table ruling); nothing is moved between pools. */

/** "3/turn" -> {amount: 3, per: "turn"}; "10" -> {amount: 10, per: "once"}; "Special" -> {amount: null}. */
export function parseCost(text) {
  const m = String(text ?? "").trim().match(/^(\d+)\s*(?:\/\s*(round|turn|day|use))?$/i);
  if (!m) return { amount: null, per: null };
  return { amount: Number(m[1]), per: (m[2] ?? "once").toLowerCase() };
}

/** PHB p.111: level of mastery equals the level of experience unless otherwise specified. */
export function masteryLevel(actor, item) {
  if (item.system.mastery) return item.system.mastery;
  if (isPC(actor)) return actor.system.totalMastery ?? 1;
  const hd = parseInt(String(actor.system.hd ?? "1"), 10);
  return Math.max(1, Number.isFinite(hd) ? hd : 1);
}

/** Replace "N unit/level of mastery" with the figure for this mastery level. */
export function durationText(text, mastery) {
  return String(text ?? "").replace(/(\d+)\s+(round|turn|day|week|hour|segment)s?\s*\/\s*level of mastery/i,
    (all, n, unit) => `${Number(n) * mastery} ${unit}${Number(n) * mastery === 1 ? "" : "s"} (${all})`);
}

/** Disciplines that stay switched on: ongoing round/turn costs, or a duration the user ends (mind bar). */
function isSustained(item, cost) {
  return cost.per === "round" || cost.per === "turn" || /as set by individual/i.test(item.system.duration);
}

/** Module-managed Active Effects shown on the token while a discipline is active.
 *  They do not depend on Foundry's default status list; each is tagged with the discipline's id
 *  so it can always be found and removed. */
export const DISCIPLINE_EFFECTS = {
  invisibility: { status: "frpg1e-psi-invisible", name: "Invisible (psionic)", img: `systems/${ID}/icons/invisible.svg` },
  levitation: { status: "frpg1e-psi-levitating", name: "Levitating (psionic)", img: `systems/${ID}/icons/levitation.svg` },
  etherealness: { status: "frpg1e-psi-ethereal", name: "Ethereal (psionic)", img: `systems/${ID}/icons/ethereal.svg` }
};
const effectsFor = (actor, itemId) => (actor.effects?.contents ?? actor.effects ?? []).filter(e => e.flags?.[ID]?.discipline === itemId);
async function setEffect(actor, item, active) {
  const def = DISCIPLINE_EFFECTS[item.name.toLowerCase()];
  const existing = effectsFor(actor, item.id);
  if (!active || !def) {
    if (existing.length) await actor.deleteEmbeddedDocuments("ActiveEffect", existing.map(e => e.id));
    return;
  }
  if (existing.length) return;
  await actor.createEmbeddedDocuments("ActiveEffect", [{
    name: def.name, img: def.img, statuses: [def.status], origin: item.uuid,
    description: `${item.name}: active psionic discipline.`, flags: { [ID]: { discipline: item.id } }
  }]);
}
/** Remove a discipline's marker whatever happened to the item (deleted, edited off). */
export async function clearDisciplineEffects(actor, itemId) {
  const existing = effectsFor(actor, itemId);
  if (existing.length) await actor.deleteEmbeddedDocuments("ActiveEffect", existing.map(e => e.id));
}

export function activeDisciplines(actor, except = null) {
  return actor.items.filter(i => i.type === "psionic" && i.system.active && i.id !== except?.id);
}

/** DMG psionic combat note c: one psionic activity besides defense at a time. Returns true to go ahead. */
async function confirmOneActivity(actor, what, except = null) {
  const others = activeDisciplines(actor, except);
  if (!others.length) return true;
  return DialogV2.confirm({
    window: { title: "One psionic activity at a time" },
    content: `<p>${actor.name} is using <strong>${others.map(i => i.name).join(", ")}</strong>.</p>
      <p class="hint">DMG psionic combat note c: "It is never possible to attack and use a psionic discipline or to use two psionic disciplines simultaneously."</p>
      <p>${what} anyway?</p>`,
    rejectClose: false
  });
}

async function payBoth(actor, amount) {
  const p = actor.system.psionics;
  if (p.attack < amount || p.defense < amount) return false;
  await actor.update({ "system.psionics.attack": p.attack - amount, "system.psionics.defense": p.defense - amount });
  return true;
}

function extras(actor, item, mastery) {
  const n = item.name.toLowerCase();
  if (n === "mind bar") {
    const lines = [`Chance of success: <strong>${Math.min(100, 10 * mastery)}%</strong> (10% per level of mastery).`];
    if (mastery >= 11) lines.push(`Chance to locate the source of an attack on the mind: <strong>${Math.min(100, 10 * (mastery - 10))}%</strong>.`);
    return lines;
  }
  if (n === "body weaponry") {
        if (!isPC(actor)) return [];
    const R = actor.system.classInfo.some(c => ["magicuser", "illusionist"].includes(c.key)) ? ["PHB: body weaponry excludes magic-users."] : [];
    return [...R, "Armor class and weapon from the mastery table apply only while no armor is worn and no weapon is used (shown on the sheet once active)."];
  }
  if (n === "invisibility") return [`Invisible to creatures of up to <strong>${(mastery * (mastery + 1)) / 2}</strong> levels or hit dice (cumulative).`];
  if (n === "etherealness") return [`Can take up to <strong>${50 * mastery}</strong> gp weight of touched material along.`];
  return [];
}

/** Use (or stop) a discipline from the sheet. */
export async function useDiscipline(actor, item) {
  if (item.system.active) return stopDiscipline(actor, item);
  const p = actor.system.psionics;
  if (!p.has) return ui.notifications.warn(`${actor.name} has no psionic ability.`);
  let cost = parseCost(item.system.cost);
  const mastery = masteryLevel(actor, item);
  let mode = null;
  if (cost.amount === null && item.name.toLowerCase() === "telempathic projection") {
    // House ruling (0.16.2): sense as empathy for 3; send costs 1 per level/HD to contact
    // plus 1 per level/HD to send, as telepathic projection's suggestion (PHB p.117).
    const r = await DialogV2.wait({
      window: { title: `${item.name}: house ruling` }, classes: ["frpg1e-dialog"], rejectClose: false,
      content: `<div class="frpg1e-form"><p class="hint">House ruling. The PHB lists the cost and save as Special without explaining them.</p>
        <div class="row"><label><input type="radio" name="mode" value="sense" checked> Sense emotions (as empathy): 3 points, no save</label></div>
        <div class="row"><label><input type="radio" name="mode" value="send"> Send an emotion: 2 points per level/hit die of the targets, targets save vs. magic</label></div>
        <div class="row"><span class="lbl">Targets' total levels/hit dice</span><input type="number" name="hd" value="1" min="0" class="w4"></div></div>`,
      buttons: [{ action: "ok", label: "Use", default: true, callback: (ev, b) => {
        const m = b.form.elements.mode.value, hd = Math.max(0, Number(b.form.elements.hd.value) || 0);
        return m === "send" ? { mode: "send", n: 2 * hd, hd } : { mode: "sense", n: 3 };
      } }]
    });
    if (!r) return;
    mode = r; cost = { amount: r.n, per: "once" };
  }
  if (cost.amount === null) {
    const n = await DialogV2.wait({
      window: { title: `${item.name}: strength point cost` }, classes: ["frpg1e-dialog"], rejectClose: false,
      content: `<div class="frpg1e-form"><p class="hint">Cost: ${item.system.cost || "not listed"}. See the description for how it is figured.</p>
        <div class="row"><span class="lbl">Strength points</span><input type="number" name="cost" value="0" min="0" class="w4"></div>
        <p class="hint">Each strength point removes 1 attack and 1 defense point (PHB p.111).</p></div>`,
      buttons: [{ action: "ok", label: "Use", default: true, callback: (ev, b) => Number(b.form.elements.cost.value) || 0 }]
    });
    if (n === null || n === undefined) return;
    cost = { amount: n, per: "once" };
  }
  if (!(await confirmOneActivity(actor, `Use ${item.name}`, item))) return;
  if (!(await payBoth(actor, cost.amount))) {
    return ui.notifications.warn(`${item.name} costs ${cost.amount} attack and ${cost.amount} defense points; ${actor.name} has ${p.attack} and ${p.defense}.`);
  }
  const sustained = isSustained(item, cost);
  if (sustained) {
    await item.update({ "system.active": true, "system.activeSince": game.combat?.started ? game.combat.round : null });
    await setEffect(actor, item, true);
    if (item.name.toLowerCase() === "mind bar") await actor.update({ "system.psionics.mindBar": true });
  }
  const s = item.system;
  const per = { round: "per round", turn: "per turn", day: "per day", use: "per use", once: "" }[cost.per];
  const body = `
    <div class="roll-line"><span class="adnd-big">−${cost.amount}</span><span class="vs">attack and −${cost.amount} defense ${per}</span></div>
    <div class="stat-grid"><span>Mastery</span><span>${mastery}</span><span>Range</span><span>${s.range}</span>
      <span>Duration</span><span>${durationText(s.duration, mastery)}</span><span>Save</span><span>${s.save}</span>
      <span>Area</span><span>${s.aoe}</span><span>Kind</span><span>${s.kind}</span></div>
    ${mode ? `<div class="hint">House ruling: ${mode.mode === "send" ? `sending an emotion to ${mode.hd} level${mode.hd === 1 ? "" : "s"}/hit dice of creatures (${mode.hd} to contact + ${mode.hd} to send). Each target saves vs. magic to resist; the effect is the DM's call.` : "sensing emotions as empathy (3 points, no save)."}</div>` : ""}
    ${extras(actor, item, mastery).map(l => `<div class="hint">${l}</div>`).join("")}
    ${sustained ? `<div class="hint">Active. ${cost.per === "round" ? "The cost is charged again each new combat round." : cost.per === "turn" ? "The cost is charged again every 10 combat rounds." : "Stays up until stopped."} Outside combat, use <em>Pay</em> on the sheet. Click the discipline again to stop.</div>` : ""}
    <details class="desc"><summary>Description</summary>${s.description}</details>`;
  return card(actor, `${item.name}`, body, { flags: { type: "discipline" } });
}

export async function stopDiscipline(actor, item, reason = "") {
  await item.update({ "system.active": false, "system.activeSince": null });
  await setEffect(actor, item, false);
  if (item.name.toLowerCase() === "mind bar") await actor.update({ "system.psionics.mindBar": false });
  return card(actor, `${item.name} ends`, reason ? `<div class="hint">${reason}</div>` : "");
}

/** Charge one more period of a sustained discipline; ends it if either pool is short. */
export async function maintainDiscipline(actor, item) {
  const cost = parseCost(item.system.cost);
  if (!item.system.active || !cost.amount || !["round", "turn"].includes(cost.per)) return;
  const p = actor.system.psionics;
  if (!(await payBoth(actor, cost.amount))) {
    return stopDiscipline(actor, item, `Not enough points to continue (needs ${cost.amount} attack and ${cost.amount} defense; has ${p.attack} and ${p.defense}).`);
  }
  ui.notifications.info(`${actor.name}: ${item.name} −${cost.amount} attack / −${cost.amount} defense.`);
}

/** Combat hook: charge per-round disciplines each new round, per-turn ones every 10 rounds. */
export async function onCombatRound(combat, changed) {
  if (!game.user.isGM || !("round" in changed)) return;
  const round = combat.round;
  const seen = new Set();
  for (const c of combat.combatants) {
    const actor = c.actor;
    if (!actor || seen.has(actor.uuid)) continue;
    seen.add(actor.uuid);
    for (const item of activeDisciplines(actor)) {
      const cost = parseCost(item.system.cost);
      let since = item.system.activeSince;
      if (since === null || since === undefined) { await item.update({ "system.activeSince": round }); since = round; continue; }
      if (round <= since) continue;
      if (cost.per === "round" || (cost.per === "turn" && (round - since) % 10 === 0)) await maintainDiscipline(actor, item);
    }
  }
}
