import { scenescapeHeight } from "./height.js";
import { ID, normalize } from "./pairing.js";

/** Scenescape's size flag is physical height in feet, independent of grid units. */
export async function syncScenescape(token, config) {
  if (!config.enabled || !game.modules?.get("multi-token-edit")?.active || !game.settings?.get(ID, "scenescapeIntegration")) return;
  const path = token._source?.texture?.src ?? token.texture?.src;
  const height = scenescapeHeight(config.pairs.find(pair => normalize(pair.token) === normalize(path))?.height);
  if (!Number.isFinite(height) || height <= 0) return;
  let previous = token.getFlag("multi-token-edit", "size");
  if (previous === height) return;
  const update = { "flags.multi-token-edit.size": height };
  // Preserve the feet position and aspect ratio when resizing an existing Scenescape token.
  if (token.parent?.getFlag?.("multi-token-edit", "scenescape")) {
    if (!Number.isFinite(previous) || previous <= 0) {
      const { Scenescape } = await import("/modules/multi-token-edit/scripts/scenescape/scenescape.js");
      previous = Scenescape._getActorSize(token.actor, token);
    }
    if (!Number.isFinite(previous) || previous <= 0) {
      await token.update(update, { [ID]: true });
      return;
    }
    const ratio = height / previous;
    const grid = token.parent.grid;
    update.width = token.width * ratio;
    update.height = token.height * ratio;
    update.x = token.x + (token.width - update.width) * grid.sizeX / 2;
    update.y = token.y + (token.height - update.height) * grid.sizeY;
    update["flags.multi-token-edit.width"] = update.width;
    update["flags.multi-token-edit.height"] = update.height;
  }
  await token.update(update, { scenescape: true, [ID]: true, animate: false });
}
