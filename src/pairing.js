export const ID = "shifting-faces";
export const LEGACY_ID = "token-avatar-wildcard";

export function moduleFlag(document, key) {
  return document?.getFlag(ID, key) ?? document?.flags?.[LEGACY_ID]?.[key];
}

export async function migrateFlags(document) {
  const old = document.flags?.[LEGACY_ID];
  if (!old || !document.isOwner) return;
  const update = {};
  for (const key of ["config", "portrait"]) {
    if (!Object.hasOwn(old, key)) continue;
    if (document.getFlag(ID, key) === undefined) {
      update["flags." + ID + "." + key] = key === "config" ? configFor(document) : old[key];
    }
    update["flags." + LEGACY_ID + ".-=" + key] = null;
  }
  if (Object.keys(update).length) await document.update(update, { [ID]: true });
}
export const DEFAULTS = Object.freeze({
  enabled: false, tokenPattern: "", portraitPattern: "",
  mappings: [], portraits: [], tokens: [], pairs: []
});

export function configFor(actor) {
  const stored = moduleFlag(actor, "config") ?? {};
  // Read older saved flags without requiring actors to be configured again.
  const migrated = {
    ...stored,
    portraitPattern: stored.portraitPattern ?? stored.avatarPattern,
    portraits: stored.portraits ?? stored.avatars,
    mappings: (stored.mappings ?? []).map(row => ({
      token: row.token,
      portrait: row.portrait ?? row.avatar ?? ""
    }))
  };
  const config = Object.fromEntries(Object.entries(DEFAULTS).map(([key, value]) => [key, migrated[key] ?? value]));
  const paths = [...new Set([...config.tokens, ...config.mappings.map(row => row.token)])];
  config.pairs = paths.map(token => ({
    id: config.pairs.find(pair => normalize(pair.token) === normalize(token))?.id ?? pairIdForPath(token),
    token,
    name: config.pairs.find(pair => normalize(pair.token) === normalize(token))?.name ?? ""
  }));
  return config;
}

export function normalize(path = "") {
  try { return decodeURIComponent(path); } catch { return path; }
}

/** The trailing number before the extension is the artwork index.
 * Compare digits as strings to avoid precision loss on long indices. */
export function imageIndex(path = "") {
  const name = normalize(path.split(/[?#]/)[0]).split("/").pop().replace(/\.[^.]+$/, "");
  const digits = name.match(/(\d+)$/)?.[1];
  return digits === undefined ? null : digits.replace(/^0+(?=\d)/, "");
}
/** Explicit mappings win, including an empty string meaning the default actor portrait.
 * Ambiguous automatic matches deliberately fall back rather than choose random art. */
export function resolvePortrait(config, tokenPath, defaultPortrait) {
  if (!config.enabled) return defaultPortrait;
  const mapping = (config.mappings ?? []).find(row => normalize(row.token) === normalize(tokenPath));
  if (mapping) return mapping.portrait || defaultPortrait;
  const key = imageIndex(tokenPath);
  if (key === null) return defaultPortrait;
  const matches = (config.portraits ?? []).filter(path => imageIndex(path) === key);
  if (matches.length === 1) return matches[0];
  return defaultPortrait;
}

export function sourceActor(token) {
  return game.actors.get(token.actorId) ?? token.actor;
}

export function defaultPortraitForActor(actor) {
  const previous = moduleFlag(actor, "portrait");
  return previous && actor.img === previous.applied ? previous.original : actor?.img;
}

export function portraitForToken(token) {
  const actor = sourceActor(token);
  // Foundry's texture transition temporarily writes the previous image into
  // prepared token.texture. The persisted source already holds the selection.
  const tokenPath = token._source?.texture?.src ?? token.texture?.src;
  return resolvePortrait(configFor(actor), tokenPath, defaultPortraitForActor(actor));
}

export async function discover(pattern) {
  if (!pattern.trim()) return [];
  const Picker = foundry.applications.apps.FilePicker.implementation;
  const options = { wildcard: true };
  const result = await Picker.browse("data", pattern.trim(), options);
  return [...new Set(result.files ?? [])].filter(path => /\.(?:png|jpe?g|webp|gif|svg|avif|webm|mp4|ogg|m4v)(?:[?#].*)?$/i.test(path)).sort();
}


// Deterministic IDs give existing pairs stable identifiers before their next save.
export function pairIdForPath(path) {
  let hash = 14695981039346656037n;
  for (const byte of new TextEncoder().encode(normalize(path))) {
    hash = BigInt.asUintN(64, (hash ^ BigInt(byte)) * 1099511628211n);
  }
  return "pair-" + hash.toString(16).padStart(16, "0");
}
