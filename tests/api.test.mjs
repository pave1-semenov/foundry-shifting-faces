import test from "node:test";
import assert from "node:assert/strict";
import { ID, configFor, pairIdForPath } from "../src/pairing.js";
globalThis.foundry = { applications: { api: { ApplicationV2: class {}, HandlebarsApplicationMixin: cls => cls } } };
globalThis.Hooks = { on: () => {} };
const { getPairs, switchPair } = await import("../src/api.js");
const { registerTokenHUD } = await import("../src/token-hud.js");

test("pair IDs survive ordering, portrait changes, and persisted token-path edits", () => {
  const stored = { tokens: ["a001.webp", "b002.webp"] };
  const actor = { getFlag: () => stored };
  const original = configFor(actor).pairs;
  stored.tokens.reverse();
  assert.equal(configFor(actor).pairs.find(pair => pair.token === "a001.webp").id, original[0].id);
  stored.pairs = [{ id: original[0].id, token: "renamed001.webp", name: "Warrior-swordsman" }];
  stored.tokens = ["renamed001.webp"];
  stored.mappings = [{ token: "renamed001.webp", portrait: "custom.webp" }];
  assert.equal(configFor(actor).pairs[0].id, original[0].id);
  assert.equal(configFor(actor).pairs[0].name, "Warrior-swordsman");
  assert.equal(pairIdForPath("grey%20wolf001.webp"), pairIdForPath("grey wolf001.webp"));
});

test("macros switch tokens or UUIDs and actors with unambiguous targets", async () => {
  const config = { enabled: true, tokens: ["a001.webp", "b002.webp"], portraits: ["portrait001.webp", "portrait002.webp"] };
  const actor = { documentName: "Actor", id: "actor", uuid: "Actor.actor", img: "default.webp", getFlag: () => config };
  const writes = [];
  const token = { documentName: "Token", actorId: actor.id, actor, isOwner: true, uuid: "Scene.scene.Token.one",
    update: async change => { writes.push(change); } };
  globalThis.game = { actors: new Map([[actor.id, actor]]) };
  globalThis.canvas = { tokens: { controlled: [], placeables: [{ document: token }] } };
  globalThis.fromUuid = async uuid => uuid === actor.uuid ? actor : uuid === token.uuid ? token : null;
  let synchronized = 0;
  registerTokenHUD(async () => { synchronized++; });
  const pairs = await getPairs(actor.uuid);
  assert.equal(pairs.length, 2);
  assert.equal(pairs[1].portrait, "portrait002.webp");
  assert.equal(pairs[1].mode, "auto");
  assert.deepEqual(await switchPair(token.uuid, pairs[1].id), { pairId: pairs[1].id, tokenUuid: token.uuid, tokenImage: "b002.webp" });
  await switchPair(actor, pairs[0].id);
  assert.deepEqual(writes, [{ "texture.src": "b002.webp" }, { "texture.src": "a001.webp" }]);
  assert.equal(synchronized, 2);

  canvas.tokens.placeables.push({ document: { ...token, uuid: "Scene.scene.Token.two" } });
  await assert.rejects(switchPair(actor, pairs[0].id), /exactly one/);
  canvas.tokens.controlled = [{ document: token }];
  await switchPair(actor, pairs[0].id);
  await assert.rejects(switchPair(token, "missing-pair"), /not found/);
  await assert.rejects(switchPair({ ...token, isOwner: false }, pairs[0].id), /permission/);
  config.enabled = false;
  await assert.rejects(switchPair(token, pairs[0].id), /disabled/);
  assert.equal(writes.length, 3, "failed calls never change artwork");
});
