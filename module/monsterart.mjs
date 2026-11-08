/**
 * Monster art: image files named "Token <monster name>.webp" in a folder chosen in the system settings become the
 * monster's portrait and token image. Applied when the book compendia are built (so the art survives a rebuild)
 * and on demand from the settings ("Apply Monster Art"), which also updates monsters already in the world.
 *
 * Matching ignores case, accents, punctuation and spaces, so "Token Bat, Giant.webp" and "Token Bat Giant.webp"
 * both match "Bat, Giant". A name's parenthetical part is optional: "Token Aarakocra.webp" matches
 * "Aarakocra (Bird-Man)".
 */
const ID = "frpg1e";
const IMG_EXT = /\.(webp|png|jpe?g|gif|svg|avif)$/i;
const DEFAULT_IMGS = new Set(["icons/svg/skull.svg", "icons/svg/mystery-man.svg", ""]);

export const artKey = s => String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");
/** Keys to try for a monster name: the full name, then the name without its parenthetical parts. */
export function nameKeys(name) {
  const keys = [artKey(name)];
  const bare = artKey(String(name).replace(/\([^)]*\)/g, ""));
  if (bare && !keys.includes(bare)) keys.push(bare);
  return keys;
}
/** File path -> match key, or null when the file is not a "Token ..." image. */
export function fileKey(path) {
  const base = decodeURIComponent(String(path).split("/").pop());
  if (!IMG_EXT.test(base)) return null;
  const m = base.replace(IMG_EXT, "").match(/^token[\s_-]+(.+)$/i);
  return m ? artKey(m[1]) : null;
}
/** Build key -> path from a list of file paths. */
export function artIndex(files) {
  const map = new Map();
  for (const f of files) { const k = fileKey(f); if (k && !map.has(k)) map.set(k, f); }
  return map;
}
export function artFor(name, index) {
  for (const k of nameKeys(name)) if (index.has(k)) return index.get(k);
  return null;
}
/** Token footprint by size: S and M one square, L two by two (a choice; the books give no grid footprint). */
export const tokenSize = size => (size === "L" ? 2 : 1);

/** The update for one monster's data (plain object, used when building compendia). */
export function artUpdate(name, size, index) {
  const path = index ? artFor(name, index) : null;
  const n = tokenSize(size);
  const up = { "prototypeToken.width": n, "prototypeToken.height": n };
  if (path) Object.assign(up, { img: path, "prototypeToken.texture.src": path });
  return { up, path };
}

export const DEFAULT_ART_FOLDER = "frpg1e_monster_art";
/** The folder setting, or "frpg1e_monster_art" when it is blank. */
export const artFolder = () => game.settings.get(ID, "monsterArtFolder")?.trim() || DEFAULT_ART_FOLDER;
let CACHE = null, LOADED = false;
/** The art index, read once per session (Apply Monster Art re-reads it). */
export async function getArtIndex({ refresh = false } = {}) {
  if (!LOADED || refresh) { CACHE = await loadArtIndex(); LOADED = true; }
  return CACHE;
}
/** Create the art folder in the Foundry data area if it is missing (kept outside the system folder so updates never touch it). */
export async function ensureArtFolder() {
  if (!game.user.isGM) return;
  // the folder was called "Monster Art" before 0.27.0: a world that saved that name moves to the new one
  if (game.settings.get(ID, "monsterArtFolder")?.trim() === "Monster Art") await game.settings.set(ID, "monsterArtFolder", DEFAULT_ART_FOLDER);
  const folder = artFolder();
  const FP = foundry.applications?.apps?.FilePicker?.implementation ?? globalThis.FilePicker;
  try { await FP.browse("data", folder); return; } catch (e) { /* missing: create it */ }
  try { await FP.createDirectory("data", folder, {}); ui.notifications.info(`Monster art: created the folder "${folder}" in your Foundry data. Put the "Token ..." images there.`); }
  catch (err) { console.warn(`frpg1e | could not create the monster art folder "${folder}"`, err); }
}

/** List the image files in the chosen folder and its subfolders (one level). */
export async function loadArtIndex() {
  const folder = artFolder();
  const FP = foundry.applications?.apps?.FilePicker?.implementation ?? globalThis.FilePicker;
  const files = [];
  try {
    const res = await FP.browse("data", folder);
    files.push(...res.files);
    for (const dir of res.dirs ?? []) {
      try { files.push(...(await FP.browse("data", dir)).files); } catch (e) { /* unreadable subfolder */ }
    }
  } catch (err) {
    ui.notifications.warn(`Monster art: could not read the folder "${folder}" (${err.message}).`);
    return null;
  }
  return artIndex(files);
}

/** Apply art to monster data objects before they are created in a compendium. Returns the number matched. */
export function applyArtToData(docs, index) {
  let n = 0;
  for (const d of docs) {
    const path = index ? artFor(d.name, index) : null;
    const size = tokenSize(d.system?.size);
    d.prototypeToken = { displayBars: globalThis.CONST?.TOKEN_DISPLAY_MODES?.HOVER ?? 30, ...(d.prototypeToken ?? {}), width: size, height: size };
    if (path) { d.img = path; d.prototypeToken.texture = { ...(d.prototypeToken.texture ?? {}), src: path }; n++; }
  }
  return n;
}

/** Settings button: update the monster compendia and the world's monsters. */
export async function applyMonsterArt({ confirm = true } = {}) {
  if (!game.user.isGM) return;
  const index = await getArtIndex({ refresh: true });
  if (!index || !index.size) {
    const f = await fixMonsterTokens();
    ui.notifications.warn(`Monster art: no images named "Token ..." found in "${artFolder()}". Token sizes and bars fixed on ${f.actors} monsters and ${f.tokens} placed tokens.`);
    return;
  }
  if (confirm) {
    const ok = await foundry.applications.api.DialogV2.confirm({
      window: { title: "Apply Monster Art" },
      content: `<p>${index.size} "Token ..." images found. Set them as portrait and token image on the matching monsters in the book compendia and in this world?</p>
        <p class="hint">World monsters that already have their own picture are left alone.</p>`,
      rejectClose: false
    });
    if (!ok) return;
  }
  const used = new Set();
  let packCount = 0, worldCount = 0;
  for (const pack of game.packs.filter(p => p.metadata.packageType === "world" && p.metadata.name.startsWith("frpg1e-monsters-"))) {
    const docs = await pack.getDocuments();
    const updates = [];
    for (const a of docs) {
      const path = artFor(a.name, index);
      const up = { _id: a.id };
      if (tokenSize(a.system.size) === 2 && a.prototypeToken.width < 2) Object.assign(up, { "prototypeToken.width": 2, "prototypeToken.height": 2 });
      if (path) { used.add(path); Object.assign(up, { img: path, "prototypeToken.texture.src": path }); }
      if (Object.keys(up).length > 1) updates.push(up);
    }
    if (pack.locked) await pack.configure({ locked: false });
    for (let i = 0; i < updates.length; i += 100) await Actor.updateDocuments(updates.slice(i, i + 100), { pack: pack.collection });
    packCount += updates.length;
  }
  const worldUpdates = [];
  for (const a of game.actors.filter(a => a.type === "monster")) {
    const path = artFor(a.name, index);
    const up = { _id: a.id };
    if (!a.prototypeToken?.displayBars) up["prototypeToken.displayBars"] = (CONST.TOKEN_DISPLAY_MODES?.HOVER ?? 30);
    if (!path) { if (Object.keys(up).length > 1) worldUpdates.push(up); continue; }
    used.add(path);
    if (DEFAULT_IMGS.has(a.img ?? "")) up.img = path;
    if (DEFAULT_IMGS.has(a.prototypeToken?.texture?.src ?? "")) up["prototypeToken.texture.src"] = path;
    if (Object.keys(up).length > 1) worldUpdates.push(up);
  }
  if (worldUpdates.length) await Actor.updateDocuments(worldUpdates);
  worldCount = worldUpdates.length;
  // tokens already placed on scenes keep their own image: update those still showing the default
  let tokenCount = 0;
  for (const scene of game.scenes) {
    const ups = [];
    for (const t of scene.tokens) {
      if (t.actor?.type !== "monster") continue;
      const up = { _id: t.id };
      if (!t.displayBars) up.displayBars = (CONST.TOKEN_DISPLAY_MODES?.HOVER ?? 30);
      const path = DEFAULT_IMGS.has(t.texture?.src ?? "") ? (artFor(t.actor.name, index) ?? artFor(t.name, index)) : null;
      if (path) { used.add(path); up["texture.src"] = path; }
      if (Object.keys(up).length > 1) ups.push(up);
    }
    if (ups.length) { await scene.updateEmbeddedDocuments("Token", ups); tokenCount += ups.length; }
  }
  await fixMonsterTokens();
  const unused = [...index.values()].filter(p => !used.has(p));
  ui.notifications.info(`Monster art: ${index.size} images in "${artFolder()}". Updated ${packCount} compendium monsters, ${worldCount} world monsters and ${tokenCount} placed tokens; ${unused.length} images matched no monster.`);
  if (unused.length) {
    const list = unused.map(p => `<li>${foundry.utils.escapeHTML?.(decodeURIComponent(p.split("/").pop())) ?? decodeURIComponent(p.split("/").pop())}</li>`).join("");
    await ChatMessage.create({
      content: `<div class="frpg1e-card"><div class="card-title">Monster art: images with no matching monster</div><p class="card-sub">Rename them to "Token " + the name as it appears in the compendium.</p><ul>${list}</ul></div>`,
      whisper: [game.user.id]
    });
  }
}

/** For a monster being created with the default picture (e.g. dragged in from a compendium): its art, if any. */
export async function artForNewMonster(name) {
  try {
    const index = await getArtIndex();
    return index ? artFor(name, index) : null;
  } catch (e) { return null; }
}

/**
 * Token defaults for monsters already in the world: L monsters get a 2x2 token (prototype and placed tokens),
 * and bars shown on hover where they are still set to none. Used by Apply Monster Art and once after an update.
 */
export async function fixMonsterTokens() {
  if (!game.user.isGM) return { actors: 0, tokens: 0 };
  const HOVER = CONST.TOKEN_DISPLAY_MODES?.HOVER ?? 30;
  const ups = [];
  for (const a of game.actors.filter(a => a.type === "monster")) {
    const n = tokenSize(a.system.size);
    const up = { _id: a.id };
    if (n === 2 && (a.prototypeToken.width < 2 || a.prototypeToken.height < 2)) Object.assign(up, { "prototypeToken.width": 2, "prototypeToken.height": 2 });
    if (!a.prototypeToken.displayBars) up["prototypeToken.displayBars"] = HOVER;
    if (Object.keys(up).length > 1) ups.push(up);
  }
  if (ups.length) await Actor.updateDocuments(ups);
  let tokens = 0;
  for (const scene of game.scenes) {
    const tu = [];
    for (const t of scene.tokens) {
      if (t.actor?.type !== "monster") continue;
      const up = { _id: t.id };
      if (tokenSize(t.actor.system.size) === 2 && (t.width < 2 || t.height < 2)) Object.assign(up, { width: 2, height: 2 });
      if (!t.displayBars) up.displayBars = HOVER;
      if (Object.keys(up).length > 1) tu.push(up);
    }
    if (tu.length) { await scene.updateEmbeddedDocuments("Token", tu); tokens += tu.length; }
  }
  return { actors: ups.length, tokens };
}
