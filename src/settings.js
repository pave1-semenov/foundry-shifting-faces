import { ID, sourceActor } from "./pairing.js";

export function canConfigureActor(actor) {
  const source = actor?.isToken ? sourceActor(actor.token) : actor;
  return !!source && (!!game.user?.isGM ||
    (game.settings?.get(ID, "allowPlayerConfig") === true && !!source.isOwner));
}

export function registerSettings() {
  game.settings.register(ID, "allowPlayerConfig", {
    name: "Allow player configuration",
    hint: "Allow players to configure Shifting Faces for actors they own. Players will also require the Use File Browser and Upload Files user permissions in Foundry's permission settings.",
    scope: "world", config: true, type: Boolean, default: false
  });
}
