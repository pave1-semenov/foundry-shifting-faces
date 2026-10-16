import { ID, normalize } from "./pairing.js";

export async function syncTokenScale(token, config, restore = false) {
  if (!config.enabled && !restore) return;
  const previous = token.getFlag(ID, "tokenScale");
  const texture = token._source?.texture ?? token.texture ?? {};
  const current = { scaleX: texture.scaleX ?? 1, scaleY: texture.scaleY ?? 1 };
  const matches = previous && current.scaleX === previous.applied.scaleX && current.scaleY === previous.applied.scaleY;
  const original = matches ? previous.original : current;
  const path = texture.src;
  const scale = config.enabled ? config.pairs.find(pair => normalize(pair.token) === normalize(path))?.scale : null;
  if (Number.isFinite(scale) && scale > 0) {
    const applied = { scaleX: original.scaleX * scale, scaleY: original.scaleY * scale };
    if (matches && current.scaleX === applied.scaleX && current.scaleY === applied.scaleY) return;
    await token.update({ "texture.scaleX": applied.scaleX, "texture.scaleY": applied.scaleY,
      ["flags." + ID + ".tokenScale"]: { original, applied } }, { [ID]: true });
  } else if (previous) {
    const update = { ["flags." + ID + ".-=tokenScale"]: null };
    if (matches) Object.assign(update, { "texture.scaleX": original.scaleX, "texture.scaleY": original.scaleY });
    await token.update(update, { [ID]: true });
  }
}
