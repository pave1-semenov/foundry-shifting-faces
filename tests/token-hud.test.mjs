import test from "node:test";
import assert from "node:assert/strict";
import { ID } from "../src/pairing.js";

globalThis.foundry = { applications: { api: { ApplicationV2: class {}, HandlebarsApplicationMixin: cls => cls } } };
const { tokenImages, randomAlternative, selectImage, registerTokenHUD, isVideo } = await import("../src/token-hud.js");

test("image choices combine core wildcards, saved pairings and current image without wildcard literals", async () => {
  const actor = {
    prototypeToken: { randomImg: true, texture: { src: "tokens/*.webp" } },
    getTokenImages: async () => ["tokens/warrior002.webp", "tokens/warrior001.webp"],
    getFlag: () => ({ tokens: ["tokens/warrior002.webp", "tokens/warrior010.webp"], mappings: [{ token: "manual.webp", portrait: "portrait.webp" }] })
  };
  globalThis.game = { actors: new Map([["actor", actor]]) };
  const token = { actorId: "actor", _source: { texture: { src: "current.webp" } }, texture: { src: "old.webp" } };
  const paths = await tokenImages(token);
  assert.equal(paths.length, 5);
  assert.equal(paths.includes("current.webp"), true);
  assert.equal(paths.includes("old.webp"), false);
  assert.equal(paths.includes("tokens/*.webp"), false);
  assert.ok(paths.indexOf("tokens/warrior002.webp") < paths.indexOf("tokens/warrior010.webp"));
});

test("saved choices still work when core wildcard enumeration fails", async () => {
  globalThis.game = { actors: new Map([["actor", {
    prototypeToken: { randomImg: true },
    getTokenImages: async () => { throw new Error("Unavailable"); },
    getFlag: () => ({ tokens: ["saved.webp"] })
  }]]) };
  const warn = console.warn;
  console.warn = () => {};
  try { assert.deepEqual(await tokenImages({ actorId: "actor", texture: { src: "current.webp" } }), ["current.webp", "saved.webp"]); }
  finally { console.warn = warn; }
});

test("random selection changes the image, handles encoded paths and empty choices", () => {
  assert.equal(randomAlternative(["a.webp", "b.webp"], "a.webp", () => 0), "b.webp");
  assert.equal(randomAlternative(["grey%20wolf.webp", "b.webp"], "grey wolf.webp", () => 0), "b.webp");
  assert.equal(randomAlternative(["a.webp"], "a.webp"), null);
  assert.equal(randomAlternative([], "a.webp"), null);
});

test("selection checks ownership and updates only texture before synchronizing the portrait", async () => {
  const operations = [];
  globalThis.Hooks = { on: () => {} };
  registerTokenHUD(async token => { operations.push(["portrait", token]); });
  globalThis.game = { actors: new Map([["actor", { getFlag: () => ({ enabled: true }) }]]) };
  const token = { actorId: "actor", isOwner: true, update: async data => { operations.push(["texture", data]); } };
  await selectImage(token, "b.webp", ["a.webp", "b.webp"]);
  assert.deepEqual(operations, [["texture", { "texture.src": "b.webp" }], ["portrait", token]]);
  await assert.rejects(selectImage({ ...token, isOwner: false }, "b.webp", ["b.webp"]), /permission/);
  await assert.rejects(selectImage(token, "unknown.webp", ["b.webp"]), /available/);
  await assert.rejects(selectImage(token, "*.webp", ["*.webp"]), /available/);
  assert.equal(isVideo("art/movie.webm?version=1"), true);
  assert.equal(isVideo("art/image.webp"), false);
});

test("disabled pairings hide HUD entry and block stale gallery selections without writes", async () => {
  const config = { enabled: false, tokens: ["a.webp", "b.webp"] };
  const actor = { getFlag: () => config };
  globalThis.game = { actors: new Map([["actor", actor]]) };
  let writes = 0;
  const token = { actorId: "actor", actor, isOwner: true, update: async () => { writes++; } };
  const hooks = new Map();
  globalThis.Hooks = { on: (name, fn) => hooks.set(name, fn) };
  registerTokenHUD(async () => { writes++; });
  let removed = false;
  const existing = { remove: () => { removed = true; } };
  const column = { querySelector: () => existing };
  const root = { querySelector: () => column, isConnected: true };
  await hooks.get("renderTokenHUD")({ object: { document: token } }, root);
  assert.equal(removed, true);
  await assert.rejects(selectImage(token, "b.webp", ["a.webp", "b.webp"]), /disabled/);
  const { openGallery, TokenImageGallery } = await import("../src/token-hud.js");
  assert.equal(openGallery(token), undefined);
  const gallery = new TokenImageGallery(token);
  assert.deepEqual((await gallery._prepareContext()).choices, []);
  assert.equal(writes, 0);
});
test("Use this image and Random image both close after successful selection", async () => {
  globalThis.game = { actors: new Map([["actor", { getFlag: () => ({ enabled: true }) }]]) };
  globalThis.Hooks = { on: () => {} };
  registerTokenHUD(async () => {});
  const { TokenImageGallery } = await import("../src/token-hud.js");
  const token = { actorId: "actor", isOwner: true, texture: { src: "a.webp" }, update: async () => {} };
  const gallery = new TokenImageGallery(token);
  gallery.images = ["a.webp", "b.webp"];
  gallery.element = { querySelectorAll: () => [] };
  let closed = 0, rendered = 0;
  gallery.close = async () => { closed++; };
  gallery.render = async () => { rendered++; };
  await TokenImageGallery.select.call(gallery, {}, { dataset: { index: "1" } });
  assert.equal(closed, 1);
  assert.equal(rendered, 0);
  await TokenImageGallery.random.call(gallery);
  assert.equal(closed, 2);
  assert.equal(rendered, 0);
});

test("wildcard tokens remain browsable and selectable with pairings disabled", async () => {
  const actor = { prototypeToken: { randomImg: true }, getFlag: () => ({ enabled: false }), getTokenImages: async () => ["a.webp", "b.webp"] };
  globalThis.game = { actors: new Map([["actor", actor]]) };
  globalThis.Hooks = { on: () => {} };
  registerTokenHUD(async () => {});
  let written;
  const token = { actorId: "actor", actor, isOwner: true, texture: { src: "a.webp" }, update: async data => { written = data; } };
  const { canBrowse, TokenImageGallery } = await import("../src/token-hud.js");
  assert.equal(canBrowse(token), true);
  const context = await new TokenImageGallery(token)._prepareContext();
  assert.equal(context.displayPairings, false);
  assert.equal(context.choices.length, 2);
  await selectImage(token, "b.webp", ["a.webp", "b.webp"]);
  assert.deepEqual(written, { "texture.src": "b.webp" });
});


test("Scenescape gallery defaults follow active scene markers and filtering combines with search and random", async () => {
  const actor = { getFlag: () => ({ tokens: ["full.webp", "round.webp"], pairs: [{ token: "full.webp", scenescape: true }, { token: "round.webp", scenescape: false }] }) };
  globalThis.game = { actors: new Map([["actor", actor]]), settings: { get: () => true }, modules: new Map([["multi-token-edit", { active: true }]]) };
  globalThis.canvas = { scene: { getFlag: () => ({ markers: [{}] }) } };
  const { TokenImageGallery } = await import("../src/token-hud.js");
  const gallery = new TokenImageGallery({ actorId: "actor", name: "Wolf", texture: { src: "round.webp" } });
  assert.equal(gallery.scenescapeFilter, "scenescape");
  const context = await gallery._prepareContext();
  assert.equal(context.choices.find(choice => choice.src === "full.webp").scenescape, true);
  const cards = context.choices.map(choice => ({ dataset: { index: String(choice.index), name: choice.name, tokenName: choice.tokenName, scenescape: String(choice.scenescape) } }));
  const empty = {};
  gallery.element = { querySelectorAll: () => cards, querySelector: () => empty };
  gallery.filter();
  assert.deepEqual(cards.map(card => card.hidden), [false, true]);
  let chosen;
  gallery.choose = async image => { chosen = image; };
  await TokenImageGallery.random.call(gallery);
  assert.equal(chosen, "full.webp");
  gallery.query = "missing";
  gallery.filter();
  assert.equal(empty.hidden, false);
  await TokenImageGallery.random.call(gallery);
  assert.equal(chosen, null);
  gallery.scenescapeFilter = "all";
  gallery.query = "";
  gallery.filter();
  assert.equal(cards.every(card => !card.hidden), true);
  canvas.scene.getFlag = () => ({ markers: [] });
  const regularGallery = new TokenImageGallery(gallery.token);
  assert.equal(regularGallery.scenescapeFilter, "regular");
  regularGallery.element = gallery.element;
  regularGallery.filter();
  assert.deepEqual(cards.map(card => card.hidden), [true, false]);
  let regularChoice;
  regularGallery.choose = async image => { regularChoice = image; };
  regularGallery.images = gallery.images;
  regularGallery.token.texture.src = "full.webp";
  await TokenImageGallery.random.call(regularGallery);
  assert.equal(regularChoice, "round.webp");
  game.settings.get = () => false;
  assert.equal(new TokenImageGallery(gallery.token).scenescapeFilter, "all");
  regularGallery.filter();
  assert.equal(cards.every(card => !card.hidden), true);
  delete globalThis.canvas;
});
