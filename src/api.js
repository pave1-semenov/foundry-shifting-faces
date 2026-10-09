import { configFor, sourceActor, resolvePortrait, defaultPortraitForActor } from "./pairing.js";
import { selectImage } from "./token-hud.js";

function documentOf(target) { return target?.document ?? target; }
function actorOf(target) {
  const document = documentOf(target);
  if (document?.documentName === "Actor") return document.isToken ? sourceActor(document.token) : document;
  if (document?.documentName === "Token") return sourceActor(document);
  throw new Error("Pass an Actor, TokenDocument, Token, or their UUID.");
}
async function resolveTarget(target) {
  const document = typeof target === "string" ? await fromUuid(target) : documentOf(target);
  if (!document) throw new Error("The actor or token could not be found.");
  return document;
}
export async function getPairs(target) {
  const actor = actorOf(await resolveTarget(target));
  const config = configFor(actor);
  return config.pairs.map(pair => {
    const mapping = config.mappings.find(row => row.token === pair.token);
    return { id: pair.id, token: pair.token,
      portrait: resolvePortrait({ ...config, enabled: true }, pair.token, defaultPortraitForActor(actor)),
      mode: mapping ? mapping.portrait ? "explicit" : "default" : "auto" };
  });
}

export async function switchPair(target, pairId) {
  const document = await resolveTarget(target);
  const actor = actorOf(document);
  if (!configFor(actor).enabled) throw new Error("Portrait pairings are disabled for this actor.");
  const pair = configFor(actor).pairs.find(pair => pair.id === pairId);
  if (!pair) throw new Error("Pair ID not found for this actor. Save the pairing before using its ID.");

  let token = document.documentName === "Token" ? document : document.isToken ? document.token : null;
  if (!token) {
    const controlled = (globalThis.canvas?.tokens?.controlled ?? []).map(documentOf).filter(token => token.actorId === actor.id);
    const active = (globalThis.canvas?.tokens?.placeables ?? []).map(documentOf).filter(token => token.actorId === actor.id);
    const candidates = controlled.length ? controlled : active;
    if (candidates.length !== 1) throw new Error("Select exactly one token for this actor, or pass a specific token UUID.");
    token = candidates[0];
  }
  await selectImage(token, pair.token, [pair.token]);
  return { pairId: pair.id, tokenUuid: token.uuid, tokenImage: pair.token };
}
