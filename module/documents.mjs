import * as Rolls from "./rolls.mjs";
import { SYSTEM_ID } from "./rolls.mjs";
import { applyPsionicCard } from "./psionics.mjs";
import { giveTreasure } from "./treasure.mjs";
import { artForNewMonster, tokenSize } from "./monsterart.mjs";

/* ================================================================== */
/*  Actor                                                               */
/* ================================================================== */
export class ADnDActor extends Actor {
  prepareDerivedData() {
    super.prepareDerivedData();
    if (this.type === "character" || this.type === "npc") this.system.prepareArmor?.(this.items.contents);
  }

  /** @override token bars and defaults for new actors */
  async _preCreate(data, options, user) {
    const allowed = await super._preCreate(data, options, user);
    if (allowed === false) return false;
    const update = {};
    // token bars shown when anyone hovers over the token, unless the data says otherwise
    if (data.prototypeToken?.displayBars === undefined) update["prototypeToken.displayBars"] = (CONST.TOKEN_DISPLAY_MODES?.HOVER ?? 30);
    if (!data.img || data.img === "icons/svg/mystery-man.svg") {
      update.img = this.type === "monster" ? "icons/svg/skull.svg" : "icons/svg/mystery-man.svg";
    }
    if (this.type === "character") {
      Object.assign(update, {
        "prototypeToken.actorLink": true,
        "prototypeToken.disposition": CONST.TOKEN_DISPOSITIONS.FRIENDLY,
        "prototypeToken.bar1.attribute": "hp"
      });
      if (!data.system?.classes?.length) update["system.classes"] = [{ key: "fighter", level: 1, xp: 0 }];
    } else if (this.type === "npc") {
      // NPCs start as 0-level and unlinked, so one actor can stand for several guards or townsfolk
      Object.assign(update, {
        "prototypeToken.actorLink": data.prototypeToken?.actorLink ?? false,
        "prototypeToken.disposition": data.prototypeToken?.disposition ?? CONST.TOKEN_DISPOSITIONS.NEUTRAL,
        "prototypeToken.bar1.attribute": "hp"
      });
    } else {
      Object.assign(update, {
        "prototypeToken.disposition": CONST.TOKEN_DISPOSITIONS.HOSTILE,
        "prototypeToken.bar1.attribute": "hp"
      });
      // token footprint: L monsters 2x2
      if (tokenSize(data.system?.size) === 2 && (data.prototypeToken?.width ?? 1) < 2) Object.assign(update, { "prototypeToken.width": 2, "prototypeToken.height": 2 });
      // monster art: a "Token <name>" image in the art folder replaces the default skull
      const imgNow = update.img ?? data.img ?? "";
      if (game.user?.isGM && ["icons/svg/skull.svg", "icons/svg/mystery-man.svg", ""].includes(imgNow)) {
        const path = await artForNewMonster(data.name);
        if (path) {
          update.img = path;
          const tex = data.prototypeToken?.texture?.src ?? "";
          if (["icons/svg/skull.svg", "icons/svg/mystery-man.svg", ""].includes(tex)) update["prototypeToken.texture.src"] = path;
        }
      }
    }
    this.updateSource(update);
  }

  /** Changing a monster's size on the sheet resizes its prototype token (L 2x2, S and M 1x1). */
  async _preUpdate(changes, options, user) {
    const allowed = await super._preUpdate(changes, options, user);
    if (allowed === false) return false;
    const size = changes.system?.size;
    if (this.type === "monster" && size && size !== this.system.size && changes.prototypeToken?.width === undefined) {
      const n = tokenSize(size);
      foundry.utils.setProperty(changes, "prototypeToken.width", n);
      foundry.utils.setProperty(changes, "prototypeToken.height", n);
    }
  }

  rollAttack(opts) { return Rolls.rollAttack(this, opts); }
  rollSave(key, opts) { return Rolls.rollSave(this, key, opts); }
}

/* ================================================================== */
/*  Item                                                                */
/* ================================================================== */
const ITEM_ICONS = {
  weapon: "icons/svg/sword.svg", armor: "icons/svg/shield.svg", spell: "icons/svg/book.svg", gear: "icons/svg/item-bag.svg", psionic: "icons/svg/daze.svg", magic: "icons/svg/aura.svg", treasure: "icons/svg/jewel.svg", proficiency: "icons/svg/book.svg"
};
export class ADnDItem extends Item {
  async _preCreate(data, options, user) {
    const allowed = await super._preCreate(data, options, user);
    if (allowed === false) return false;
    if (!data.img || data.img === "icons/svg/item-bag.svg") this.updateSource({ img: ITEM_ICONS[this.type] ?? "icons/svg/item-bag.svg" });
  }
}

/* ================================================================== */
/*  Chat messages: wire up card buttons                                 */
/* ================================================================== */
export class ADnDChatMessage extends ChatMessage {
  async renderHTML(options = {}) {
    const html = await super.renderHTML(options);
    // Target numbers reveal armor classes; only the GM sees them unless the setting allows it.
    if (!game.user.isGM && !game.settings.get(SYSTEM_ID, "revealTargetAC")) {
      html.querySelectorAll(".gm-only").forEach(el => el.remove());
    }
    html.querySelectorAll("[data-card-action]").forEach(btn => {
      btn.addEventListener("click", ev => this.#onCardAction(ev));
    });
    return html;
  }

  async #onCardAction(event) {
    event.preventDefault();
    const btn = event.currentTarget;
    btn.disabled = true;
    try {
      switch (btn.dataset.cardAction) {
        case "damage-sm": await Rolls.rollDamage(this, "sm"); break;
        case "damage-l": await Rolls.rollDamage(this, "l"); break;
        case "apply": await Rolls.applyDamage(this, 1); break;
        case "apply-half": await Rolls.applyDamage(this, 0.5); break;
        case "heal": await Rolls.applyDamage(this, -1); break;
        case "apply-amt": await Rolls.applyDamage(this, Number(btn.dataset.factor) || 1, { amount: Number(btn.dataset.amount) || 0 }); break;
        case "heal-amt": await Rolls.applyDamage(this, -1, { amount: Number(btn.dataset.amount) || 0, mode: btn.dataset.mode ?? "" }); break;
        case "add-hp": await Rolls.addHPFromCard(this); break;
        case "psi-apply": await applyPsionicCard(this); break;
        case "treasure-give": await giveTreasure(this); break;
      }
    } finally {
      btn.disabled = false;
    }
  }
}

/* ================================================================== */
/*  Combat: side initiative (DMG p.62)                                  */
/* ================================================================== */
/**
 * One d6 per side each round; the higher roll has the initiative and ties
 * act simultaneously. Player-owned and friendly tokens form the party side,
 * everything else the opposing side.
 */
export class ADnDCombat extends Combat {
  static sideOf(combatant) {
    if (combatant.hasPlayerOwner) return "party";
    const d = combatant.token?.disposition;
    return d === CONST.TOKEN_DISPOSITIONS.FRIENDLY ? "party" : "foes";
  }

  async rollInitiative(ids, { updateTurn = true } = {}) {
    ids = typeof ids === "string" ? [ids] : ids;
    const sides = new Map();
    for (const id of ids) {
      const c = this.combatants.get(id);
      if (!c?.isOwner) continue;
      const side = ADnDCombat.sideOf(c);
      if (!sides.has(side)) sides.set(side, []);
      sides.get(side).push(c);
    }
    const updates = [];
    const rolled = [];
    for (const [side, list] of sides) {
      // Re-use this round's roll if someone on the side already has one
      const existing = this.combatants.find(c => ADnDCombat.sideOf(c) === side && c.initiative !== null && !list.includes(c));
      let score = existing?.initiative;
      if (score === undefined || score === null) {
        const roll = await new Roll("1d6").evaluate();
        score = roll.total;
        rolled.push({ side, roll });
      }
      for (const c of list) updates.push({ _id: c.id, initiative: score });
    }
    if (!updates.length) return this;
    const current = this.combatant?.id;
    await this.updateEmbeddedDocuments("Combatant", updates);
    if (updateTurn && current) {
      const turn = this.turns.findIndex(t => t.id === current);
      if (turn >= 0) await this.update({ turn });
    }
    if (rolled.length) {
      const all = new Map(rolled.map(r => [r.side, r.roll.total]));
      for (const s of ["party", "foes"]) if (!all.has(s)) {
        const c = this.combatants.find(x => ADnDCombat.sideOf(x) === s && x.initiative !== null);
        if (c) all.set(s, c.initiative);
      }
      let verdict = "";
      if (all.has("party") && all.has("foes")) {
        const p = all.get("party"), f = all.get("foes");
        verdict = p === f ? "Tied: actions are simultaneous." : p > f ? "The party has the initiative." : "The monsters have the initiative.";
      }
      const lines = rolled.map(r => `<li><strong>${r.side === "party" ? "Party" : "Monsters"}</strong> rolled <span class="adnd-big">${r.roll.total}</span></li>`).join("");
      const msg = {
        speaker: { alias: `Initiative, round ${this.round || 1}` },
        content: `<div class="frpg1e-card"><header class="card-title">Initiative</header><ul class="init-list">${lines}</ul>${verdict ? `<p class="verdict">${verdict}</p>` : ""}</div>`,
        rolls: rolled.map(r => r.roll)
      };
      ChatMessage.applyMode(msg);
      await ChatMessage.create(msg);
    }
    return this;
  }
}

/** Reroll each round (DMG p.61 step 3). The active GM clears initiative when the round advances. */
export function registerInitiativeReset() {
  Hooks.on("updateCombat", (combat, changed) => {
    if (!("round" in changed) || !game.settings.get(SYSTEM_ID, "rerollInitiative")) return;
    if (game.users.activeGM?.id !== game.user.id) return;
    if (changed.round <= 1) return;
    const updates = combat.combatants.filter(c => c.initiative !== null).map(c => ({ _id: c.id, initiative: null }));
    if (updates.length) combat.updateEmbeddedDocuments("Combatant", updates);
  });
}
