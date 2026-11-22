# 1e FRPG (Table Edition) for Foundry VTT V14

A private-table game system (v0.48.0) that runs 1e FRPG straight off the book tables: the PHB, DMG, UA, MM, MMII and FF, with the DSG and WSG for proficiencies and ability checks.

## Install

**From a manifest URL (any Foundry server):** in Foundry's setup screen, go to Game Systems → Install System and paste:

```
https://github.com/gmjeremynow/frpg1e/releases/latest/download/system.json
```

**By hand (Molten or any self-hosted Foundry):**

1. Your server must be on Foundry **V14**. Back up your user data before upgrading.
2. Unzip `frpg1e.zip` so the folder lands at `Data/systems/frpg1e/` (Molten: use the file manager or SFTP and upload into `Data/systems`).
3. Restart Foundry, create a world, and pick **1e FRPG (Table Edition)**.

On first launch the GM is offered the book compendia. You can rebuild them any time from *Configure Settings → 1e FRPG → Import Book Compendia*, and updating from an earlier version offers the rebuild again.

## Features

**Characters**
- Attacks from the DMG matrices, with UA weapon vs. armor type; saving throws; all six ability tables; thief skills; spell progression and spell failure; turning undead; hit points by class with multi-class division.
- Every PHB and UA class, including bards, cavaliers, barbarians and thief-acrobats, with class ability boxes (lay on hands, tracking, monk abilities, assassination and more).
- PHB races and UA sub-races, with level limits, multi-class options and ability ranges checked on the sheet.
- Weapon specialization, attacks per round, back stab, brawling (UA System II), psionics, ability checks and DSG/WSG proficiencies.
- Encumbrance (PHB or WSG rules) with item locations, containers, mounts and vehicles, and a weight source for every item.
- NPCs on a compact sheet, with DMG loyalty and morale.
- Two sheet styles: Parchment, or Goldenrod after the classic printed record sheets.

**Compendia**
- PHB and UA weapons, armor, equipment and ammunition.
- 414 PHB spells, 224 UA spells and cantrips, and 40 psionic disciplines.
- 588 DMG and UA magic items, 53 gems and 43 nonweapon proficiencies.
- MM, MMII and FF monsters as actors, with full descriptions.
- Spell, item and monster descriptions are rewritten in plain words, keeping every number, range, die and table entry.

**At the table**
- Spells and items roll the dice their descriptions give, with *Apply*, *½* and *Apply healing* buttons on the chat card.
- Magic weapons and armor work as real weapons and armor; charges, ammunition and "when found" rolls are tracked.
- A treasure roller for treasure types, gems, jewelry and magic items, and artifact powers rolled from the DMG tables.
- Initiative, surprise and morale buttons on every sheet, and optional natural 20 critical hits and natural 1 fumbles.
- Monster art matched to monsters by file name.

**For add-on modules**
- Setting modules can add races, classes, spell lists and proficiency groups through `game.frpg1e.api`. The Greyhawk, Krynn and class modules use it.

## More detail

- [REFERENCE.md](REFERENCE.md): what each rule automates and where it comes from, the rulings made where the books are silent or disagree, and the known gaps.
- [CHANGELOG.md](CHANGELOG.md): what each version added or changed.
