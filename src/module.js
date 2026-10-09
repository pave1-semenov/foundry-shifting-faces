import { ID, configFor, sourceActor, portraitForToken, migrateFlags, moduleFlag, normalize } from "./pairing.js";
import { ShiftingFacesConfig } from "./config.js";
import { registerTokenHUD, openGallery } from "./token-hud.js";
import { getPairs, switchPair } from "./api.js";
import { registerSettings, canConfigureActor } from "./settings.js";

// Linked tokens serialize on their shared actor, unlinked tokens on their token.
const pending = new Map();
async function syncTokenName(token, actor, config, restore) {
  const previous = token.getFlag(ID, "tokenName");
  if (!config.enabled && !restore) return;
  const path = token._source?.texture?.src ?? token.texture?.src;
  const name = config.enabled && !token.actorLink
    ? config.pairs.find(pair => normalize(pair.token) === normalize(path))?.name?.trim()
    : "";
  // Tokens renamed before name backups were introduced can recover the prototype name.
  const legacyAssigned = !previous && config.pairs.some(pair => pair.name?.trim() && pair.name.trim() === token.name);
  const original = previous && token.name === previous.applied ? previous.original
    : legacyAssigned ? actor.prototypeToken?.name || actor.name || token.name : token.name;
  if (name) {
    if (token.name === name && previous) return;
    await token.setFlag(ID, "tokenName", { original, applied: name });
    if (token.name !== name) await token.update({ name }, { [ID]: true });
  } else {
    if ((previous && token.name === previous.applied) || (legacyAssigned && !token.actorLink)) {
      if (token.name !== original) await token.update({ name: original }, { [ID]: true });
    }
    if (previous) await token.unsetFlag(ID, "tokenName");
  }
}

export function syncToken(token, { restore = false } = {}) {
  const source = sourceActor(token);
  const key = token.actorLink ? source?.uuid ?? "Actor." + token.actorId : token.uuid;
  const task = (pending.get(key) ?? Promise.resolve()).then(async () => {
    if (!token.parent || !token.isOwner || !token.actor) return;
    const actor = sourceActor(token);
    const target = token.actorLink ? actor : token.actor;
    const flagOwner = token.actorLink ? actor : token;
    if (!target?.isOwner && token.actorLink) return;
    await migrateFlags(flagOwner);
    const previous = moduleFlag(flagOwner, "portrait");
    const config = configFor(actor);
    await syncTokenName(token, actor, config, restore);
    if (config.enabled) {
      const portrait = portraitForToken(token);
      if (!portrait || (target.img === portrait && previous)) return;
      const original = previous && target.img === previous.applied ? previous.original : target.img;
      await flagOwner.setFlag(ID, "portrait", { original, applied: portrait });
      // Re-read the synthetic actor after updating token flags.
      await (token.actorLink ? actor : token.actor).update({ img: portrait }, { [ID]: true });
    } else if (restore && previous) {
      if (target.img === previous.applied) await target.update({ img: previous.original }, { [ID]: true });
      await flagOwner.unsetFlag(ID, "portrait");
    }
  }).catch(error => {
    console.error(ID, "Portrait synchronization failed", error);
    return false;
  });
  pending.set(key, task);
  task.finally(() => { if (pending.get(key) === task) pending.delete(key); });
  return task;
}

export async function applyActor(actor) {
  const tokens = [...game.scenes].flatMap(scene => [...scene.tokens]).filter(token => token.actorId === actor.id);
  const unlinked = tokens.filter(token => !token.actorLink);
  // On Save, choose one representative for the shared portrait, preferring
  // the controlled linked token, then the existing shared portrait, then the current scene.
  const controlled = globalThis.canvas?.tokens?.controlled?.map(token => token.document) ?? [];
  const linked = controlled.find(token => token.actorId === actor.id && token.actorLink)
    ?? tokens.find(token => token.actorLink && portraitForToken(token) === actor.img)
    ?? tokens.find(token => token.actorLink && token.parent?.id === globalThis.canvas?.scene?.id)
    ?? tokens.find(token => token.actorLink);
  const results = await Promise.all([...unlinked, ...(linked ? [linked] : [])].map(token => syncToken(token, { restore: true })));
  return results.every(result => result !== false);
}

function responsible(userId) {
  const gm = game.users.activeGM;
  return gm ? gm.id === game.user.id : userId === game.user.id;
}

Hooks.once("init", () => {
  registerSettings();
  game.modules.get(ID).api = {
    open: actor => {
      const source = actor?.isToken ? sourceActor(actor.token) : actor;
      if (!canConfigureActor(source)) return ui.notifications.warn("Only GMs can configure Shifting Faces unless player configuration is enabled for an owned actor.");
      return new ShiftingFacesConfig(source).render(true);
    },
    getPortrait: portraitForToken,
    getAvatar: portraitForToken, // Compatibility for existing macros.
    applyActor,
    openTokenImages: openGallery,
    getPairs,
    switchPair
  };
});
Hooks.on("getHeaderControlsApplicationV2", (sheet, controls) => {
  const actor = sheet.document;
  if (actor?.documentName !== "Actor" || !canConfigureActor(actor)) return;
  controls.push({
    action: "portrait-pairings", icon: "fas fa-images", label: "Shifting Faces",
    onClick: () => game.modules.get(ID).api.open(actor)
  });
});
Hooks.on("getActorSheetHeaderButtons", (sheet, buttons) => {
  if (!canConfigureActor(sheet.actor)) return;
  buttons.unshift({ class: "portrait-pairings", icon: "fas fa-images", label: "Shifting Faces",
    onclick: () => game.modules.get(ID).api.open(sheet.actor) });
});
Hooks.once("ready", async () => {
  if (!responsible(game.user.id)) return;
  try {
    for (const actor of game.actors) await migrateFlags(actor);
    for (const scene of game.scenes) for (const token of scene.tokens) await migrateFlags(token);
    for (const actor of game.actors) if (configFor(actor).enabled) await applyActor(actor);
  } catch (error) {
    console.error(ID, "Saved pairing migration failed", error);
    ui.notifications.error("Shifting Faces could not migrate some saved settings. See the console for details.");
  }
});
Hooks.on("createToken", (token, options, userId) => {
  if (responsible(userId)) void syncToken(token);
});
Hooks.on("updateToken", (token, changes, options, userId) => {
  if (responsible(userId) && (foundry.utils.hasProperty(changes, "texture.src") || "actorLink" in changes || "actorId" in changes)) void syncToken(token);
});
Hooks.on("updateActor", (actor, changes, options, userId) => {
  if (actor.isToken || options[ID] || !configFor(actor).enabled || !responsible(userId) || !("img" in changes)) return;
  void applyActor(actor);
});

registerTokenHUD(token => responsible(game.user.id) ? syncToken(token) : undefined);
