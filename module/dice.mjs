import { isPC } from "./actor-types.mjs";
/**
 * Dice printed in spell and magic item descriptions (system.rolls).
 *
 * Formulas: NdS, NdSminK (each die counts as at least K: "all 1's count as 2's"),
 * @L (caster or user level), @X (a number the user enters), numbers,
 * + - * / ( ) and floor, ceil, round, min, max. A count in parentheses before
 * "d" is worked out first, e.g. (@L)d6 or (2+@L)d8.
 */
const SYSTEM_ID = "frpg1e";
export const FIND_FN = "Determine type (when found)";
const KIND_LABELS = { dmg: "Damage", heal: "Healing", dur: "Duration", num: "Number", other: "Roll", table: "Table" };

/** Evaluate dice-free arithmetic. Throws on anything else. */
export function arith(expr) {
  const e = String(expr).replace(/\s+/g, "");
  if (!/^(?:[\d.+\-*/(),]|floor|ceil|round|min|max)*$/.test(e)) throw new Error(`Bad formula: ${expr}`);
  // eslint-disable-next-line no-new-func
  return Function("floor", "ceil", "round", "min", "max", `"use strict"; return (${e});`)(Math.floor, Math.ceil, Math.round, Math.min, Math.max);
}

export function usesVar(rolls, v) {
  const re = new RegExp(`@${v}\\b`);
  return rolls.some(r => [r.formula, r.each, r.table?.formula, ...(r.choices ?? []).map(c => c.formula), ...(r.table?.rows ?? []).map(x => x.formula)]
    .some(f => re.test(f ?? "")));
}

/**
 * Roll a formula. Returns { total, rolls, text } where text is the formula with
 * variables filled in (e.g. "6d6") and rolls are the Foundry Roll objects (one per dice term).
 */
export async function rollFormula(formula, vars = {}) {
  let f = String(formula ?? "").replace(/\s+/g, "");
  for (const [k, v] of Object.entries(vars)) f = f.replace(new RegExp(`@${k}\\b`, "g"), String(Number(v) || 0));
  if (/@\w/.test(f)) throw new Error(`Missing value in formula: ${formula}`);
  // counts in parentheses: (6)d6, (2+7)d8
  f = f.replace(/\(([^()d]*)\)d(\d+)/g, (m, n, s) => `${Math.max(0, Math.floor(arith(n)))}d${s}`);
  const text = f;
  const rolls = [];
  const parts = [];
  let expr = "", last = 0;
  for (const m of f.matchAll(/(\d+)d(\d+)(?:min(\d+))?/g)) {
    expr += f.slice(last, m.index);
    last = m.index + m[0].length;
    const n = Number(m[1]), s = Number(m[2]), floor = m[3] ? Number(m[3]) : null;
    if (n <= 0) { expr += "0"; continue; }
    const roll = await new Roll(`${n}d${s}`).evaluate();
    rolls.push(roll);
    const results = (roll.dice?.[0]?.results ?? []).map(r => r.result);
    const sum = floor !== null && results.length ? results.reduce((a, r) => a + Math.max(r, floor), 0) : roll.total;
    parts.push(results.length ? `[${results.join(", ")}]` : String(roll.total));
    expr += `(${sum})`;
  }
  expr += f.slice(last);
  const total = Math.floor(arith(expr));
  return { total, rolls, text, dice: parts.join(" ") };
}

function rowFor(rows, total) {
  return (rows ?? []).find(r => total >= r.lo && total <= r.hi) ?? null;
}

/** Default level for @L: the caster's level in a class that uses this spell list, else the highest level. */
export function defaultLevel(actor, list = null) {
  if (!actor) return 1;
  if (isPC(actor)) {
    const classes = actor.system.classInfo ?? [];
    const full = classes.find(c => c.key === list);
    const user = classes.find(c => (c.def?.spells ?? []).some(sp => sp.list === list));
    const best = full ?? user ?? [...classes].sort((a, b) => b.level - a.level)[0];
    return best?.level ?? 1;
  }
  return Math.max(1, parseInt(actor.system.hd ?? "1", 10) || 1);
}

/** Functions an item offers: [{ fn, charges }], in catalogue order, with "when found" last. */
export function itemFunctions(rolls) {
  const out = [];
  for (const r of rolls) {
    if (!r.fn) continue;
    const have = out.find(o => o.fn === r.fn);
    if (have) have.charges = Math.max(have.charges, r.charges ?? 0);
    else out.push({ fn: r.fn, charges: r.charges ?? 0 });
  }
  return [...out.filter(o => o.fn !== FIND_FN), ...out.filter(o => o.fn === FIND_FN)];
}

const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

/**
 * Ask for the level, @X, item function and choices. Returns null if cancelled.
 * opts: { title, level (default) or null when not needed, x (prompt) or null, functions, choiceRolls }
 */
export async function askRollOptions({ title, level = null, levelLabel = "Caster level", levelHint = "", x = null, functions = [], choiceRolls = [] }) {
  if (level === null && !x && functions.length < 2 && !choiceRolls.length) return { level, x: 0, fn: functions[0]?.fn ?? null, choice: {} };
  let html = `<div class="frpg1e-roll-options">`;
  if (functions.length > 1) {
    html += `<fieldset><legend>Function</legend>` + functions.map((o, i) =>
      `<label class="radio-line"><input type="radio" name="fn" value="${i}" ${i === 0 ? "checked" : ""}> ${esc(o.fn)}${o.charges ? ` <span class="hint">(${o.charges} charge${o.charges > 1 ? "s" : ""})</span>` : ""}</label>`).join("") + `</fieldset>`;
  }
  if (level !== null) html += `<div class="form-group"><label>${esc(levelLabel)}</label><input type="number" name="level" value="${level}" min="0" max="40"></div>${levelHint ? `<p class="hint">${esc(levelHint)}</p>` : ""}`;
  if (x) html += `<div class="form-group"><label>${esc(x)}</label><input type="number" name="x" value="1" min="0"></div>`;
  for (const { r, i } of choiceRolls) {
    html += `<div class="form-group" data-fn="${esc(r.fn)}"><label>${esc(r.label)}</label><select name="choice${i}">` +
      r.choices.map((c, j) => `<option value="${j}">${esc(c.label)} (${esc(c.formula)})</option>`).join("") + `</select></div>`;
  }
  html += `</div>`;
  const out = await foundry.applications.api.DialogV2.wait({
    window: { title }, classes: ["frpg1e-dialog"], rejectClose: false, content: html,
    buttons: [{
      action: "roll", label: "Roll", default: true,
      callback: (event, button) => {
        const el = button.form?.elements ?? {};
        const get = n => el[n]?.value;
        const choice = {};
        for (const { i } of choiceRolls) choice[i] = Number(get(`choice${i}`) ?? 0);
        const fi = Number(el.fn?.value ?? 0);
        return { level: level === null ? null : Number(get("level") ?? level), x: Number(get("x") ?? 0), fn: functions[fi]?.fn ?? null, choice };
      }
    }, { action: "cancel", label: "Cancel" }]
  });
  return out && out !== "cancel" ? out : null;
}

/**
 * Roll the given rolls. opts: { level, x, choice: {index: choiceIndex} }.
 * Returns { results, rolls } for the results template and the chat message.
 */
export async function runRolls(entries, { level = null, x = 0, choice = {} } = {}) {
  const vars = { L: level ?? 0, X: x ?? 0 };
  const results = [], all = [];
  for (const { r, i } of entries) {
    const res = { label: r.label, kind: r.kind, kindLabel: KIND_LABELS[r.kind] ?? "", note: r.note, save: r.save, buttons: [] };
    let formula = r.formula, rows = r.table?.rows ?? [];
    if (r.choices?.length) {
      const c = r.choices[choice[i] ?? 0] ?? r.choices[0];
      res.choice = c.label;
      formula = c.formula;
      if (c.rows?.length) rows = c.rows;
    }
    if (r.kind === "table" && !r.choices?.length) formula = r.table.formula;
    const count = r.each ? Math.max(0, Math.floor(arith(String(r.each).replace(/@L\b/g, vars.L).replace(/@X\b/g, vars.X)))) : 1;
    const values = [];
    for (let k = 0; k < count; k++) {
      const out = await rollFormula(formula, vars);
      all.push(...out.rolls);
      values.push(out.total);
      res.text = out.text;
      res.dice = out.dice;
    }
    res.total = values.reduce((a, b) => a + b, 0);
    if (count !== 1) { res.values = values; res.count = count; }
    if (rows.length) {
      const row = rowFor(rows, values[0]);
      res.row = row?.text ?? "(no entry for this roll)";
      if (row?.formula) {
        const sub = await rollFormula(row.formula, vars);
        all.push(...sub.rolls);
        res.sub = { total: sub.total, text: sub.text };
        if (row.kind === "dmg") res.buttons.push(...damageButtons(sub.total, ""));
      }
    }
    if (r.kind === "dmg") {
      res.buttons.push(...damageButtons(res.total, r.save));
      if (res.values) res.perValue = values.map(v => ({ v, action: "apply-amt", factor: 1 }));
    }
    if (r.kind === "heal") res.buttons.push({ action: "heal-amt", amount: res.total, mode: r.mode ?? "", label: r.mode === "temp" ? "Add hit points" : "Apply healing", primary: true });
    if (r.save === "half") res.saveText = "Save for half";
    if (r.save === "neg") res.saveText = "Save negates";
    results.push(res);
  }
  return { results, rolls: all };
}

function damageButtons(total, save) {
  const b = [{ action: "apply-amt", amount: total, factor: 1, label: `Apply ${total}`, primary: true }];
  b.push({ action: "apply-amt", amount: total, factor: 0.5, label: save === "half" ? `Saved: ${Math.floor(total / 2)}` : `½ (${Math.floor(total / 2)})` });
  return b;
}

export async function renderResults(results) {
  return foundry.applications.handlebars.renderTemplate(`systems/${SYSTEM_ID}/templates/chat/results.hbs`, { results });
}

/** Which catalogued rolls apply for the chosen function (rolls with no function always apply, except on "when found"). */
export function rollsForFunction(rolls, fn) {
  return rolls.map((r, i) => ({ r, i })).filter(({ r }) => fn === FIND_FN ? r.fn === FIND_FN : (!r.fn || r.fn === fn));
}
