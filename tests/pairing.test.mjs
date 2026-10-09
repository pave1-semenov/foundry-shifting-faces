import test from "node:test";
import assert from "node:assert/strict";
import { DEFAULTS, resolvePortrait, imageIndex, discover, ID, configFor } from "../src/pairing.js";

const config = { ...DEFAULTS, enabled: true, portraits: ["portraits/wolf-portrait001.jpg", "portraits/bear-portrait002.webp"] };
test("disabled and unmatched actors use the default portrait", () => {
  assert.equal(resolvePortrait(DEFAULTS, "tokens/wolf001.webp", "default.jpg"), "default.jpg");
  assert.equal(resolvePortrait(config, "tokens/unknown.webp", "default.jpg"), "default.jpg");
});
test("automatic index matching supports different prefixes, directories and extensions", () => {
  const indexed = { ...config, portraits: ["portraits/warrior-portratit001.jpg", "portraits/mage002.png"] };
  assert.equal(resolvePortrait(indexed, "tokens/warrior001.webp", "default.jpg"), "portraits/warrior-portratit001.jpg");
  assert.equal(resolvePortrait(indexed, "tokens/unrelated002.webp", "default.jpg"), "portraits/mage002.png");
  assert.equal(resolvePortrait(indexed, "tokens/warrior%30%30%31.webp?version=99", "default.jpg"), "portraits/warrior-portratit001.jpg");
});
test("indices ignore padding and preserve long numeric values", () => {
  assert.equal(imageIndex("warrior001.webp"), "1");
  assert.equal(imageIndex("warrior000.webp"), "0");
  assert.equal(imageIndex("warrior9007199254740993.webp"), "9007199254740993");
  assert.equal(resolvePortrait({ ...config, portraits: ["portrait1.jpg"] }, "warrior001.webp", "default.jpg"), "portrait1.jpg");
  assert.equal(imageIndex("folder001/warrior.webp"), null);
  assert.equal(imageIndex("warrior001-token.webp"), null);
});
test("missing indices and ambiguous matches fall back", () => {
  assert.equal(resolvePortrait({ ...config, portraits: ["a/portrait001.jpg", "b/different1.png"] }, "warrior001.webp", "default.jpg"), "default.jpg");
  assert.equal(resolvePortrait({ ...config, portraits: ["wolf.jpg"] }, "wolf.webp", "default.jpg"), "default.jpg");
  assert.equal(resolvePortrait(config, "warrior003.webp", "default.jpg"), "default.jpg");
  assert.equal(resolvePortrait({ ...config, portraits: ["portrait9007199254740992.jpg"] }, "warrior9007199254740993.webp", "default.jpg"), "default.jpg");
});
test("explicit mappings and explicit default beat automatic matches", () => {
  assert.equal(resolvePortrait({ ...config, mappings: [{ token: "tokens/wolf001.webp", portrait: "custom.jpg" }] }, "tokens/wolf001.webp", "default.jpg"), "custom.jpg");
  assert.equal(resolvePortrait({ ...config, mappings: [{ token: "tokens/wolf001.webp", portrait: "" }] }, "tokens/wolf001.webp", "default.jpg"), "default.jpg");
});
test("discovery uses User Data, filters files and removes duplicates", async () => {
  globalThis.foundry = { applications: { apps: { FilePicker: { implementation: {
    browse: async (...args) => {
      assert.deepEqual(args, ["data", "art/*", { wildcard: true }]);
      return { files: ["a.jpg", "a.jpg", "video.webm", "readme.txt"] };
    }
  } } } } };
  assert.deepEqual(await discover("art/*"), ["a.jpg", "video.webm"]);
});

test("legacy global matching and portrait switches do not affect current behavior", () => {
  const actor = { getFlag: () => ({ ...config, autoMatch: false, syncPortrait: true }) };
  const current = configFor(actor);
  assert.equal("autoMatch" in current, false);
  assert.equal("syncPortrait" in current, false);
  assert.equal(resolvePortrait(current, "tokens/wolf001.webp", "default.jpg"), "portraits/wolf-portrait001.jpg");
});

test("portraits update separately for unlinked tokens and share the last selection for linked tokens", async () => {
  const hooks = new Map();
  globalThis.Hooks = { once: (name, fn) => hooks.set(name, fn), on: (name, fn) => hooks.set(name, fn) };
  let popout;
  globalThis.foundry = { applications: {
    api: { ApplicationV2: class {}, HandlebarsApplicationMixin: cls => cls },
    apps: { ImagePopout: class {
      constructor(options) { popout = options; }
      render(value) { assert.equal(value, true); }
    } }
  } };
  function portrait(img) {
    const flags = {};
    return { img, isOwner: true,
      getFlag: (scope, key) => key === "config" ? config : flags[key],
      setFlag: async (scope, key, value) => { flags[key] = value; },
      unsetFlag: async (scope, key) => { delete flags[key]; },
      update: async function (data, options) { assert.equal(options[ID], true); this.img = data.img; }
    };
  }
  const actor = Object.assign(portrait("default.jpg"), { id: "actor", uuid: "Actor.actor", name: "Warrior" });
  const module = {};
  globalThis.game = { actors: new Map([["actor", actor]]), modules: new Map([[ID, module]]), scenes: [] };
  globalThis.canvas = { tokens: { controlled: [] }, scene: { id: "scene" } };
  const { syncToken, applyActor } = await import("../src/module.js");
  game.settings = { register: () => {} };
  hooks.get("init")();
  function token(id, src, linked = false) {
    const own = portrait("original.jpg");
    return { ...own, name: "Warrior", uuid: id, parent: { id: "scene" }, isOwner: true, actorId: actor.id, actorLink: linked,
      update: async function (data) { if (data.name) this.name = data.name; },
      texture: { src: "tokens/previous999.webp" }, _source: { texture: { src } }, actor: linked ? actor : portrait("original.jpg")
    };
  }
  const wolf = token("wolf", "tokens/wolf001.webp");
  const bear = token("bear", "tokens/bear002.webp");
  const linkedWolf = token("linked-wolf", "tokens/wolf001.webp", true);
  const linkedBear = token("linked-bear", "tokens/bear002.webp", true);
  config.tokens = ["tokens/wolf001.webp", "tokens/bear002.webp"];
  config.pairs = [
    { id: "wolf", token: "tokens/wolf001.webp", name: "Warrior-swordsman" },
    { id: "bear", token: "tokens/bear002.webp", name: "Warrior-archer" }
  ];
  await Promise.all([syncToken(wolf), syncToken(bear)]);
  assert.equal(wolf.name, "Warrior-swordsman");
  assert.equal(bear.name, "Warrior-archer");
  assert.equal(wolf.actor.img, "portraits/wolf-portrait001.jpg");
  assert.equal(bear.actor.img, "portraits/bear-portrait002.webp");
  assert.equal(actor.img, "default.jpg");

  await Promise.all([syncToken(linkedWolf), syncToken(linkedBear)]);
  assert.equal(linkedWolf.name, "Warrior", "linked token names are unchanged");
  assert.equal(actor.img, "portraits/bear-portrait002.webp");
  assert.equal(linkedWolf.actor.img, linkedBear.actor.img);
  assert.equal(actor.getFlag(ID, "portrait").original, "default.jpg");
  const unmatched = token("unmatched", "unknown.webp", true);
  assert.equal(module.api.getPortrait(unmatched), "default.jpg", "default stays original instead of the last linked portrait");
  await syncToken(unmatched);
  assert.equal(actor.img, "default.jpg");
  await syncToken(linkedBear);
  game.scenes = [{ tokens: [wolf, bear, linkedWolf, linkedBear] }];
  await applyActor(actor);
  assert.equal(actor.img, "portraits/bear-portrait002.webp", "Save preserves the shared selection when no linked token is controlled");
  canvas.tokens.controlled = [{ document: linkedWolf }];
  await applyActor(actor);
  assert.equal(actor.img, "portraits/wolf-portrait001.jpg", "Save prefers the controlled linked token");
  assert.equal(wolf.getFlag(ID, "portrait").original, "original.jpg");

  // Token changes while disabled must not restore or change any portrait.
  config.enabled = false;
  await Promise.all([syncToken(wolf), syncToken(linkedWolf)]);
  assert.equal(wolf.actor.img, "portraits/wolf-portrait001.jpg");
  assert.equal(actor.img, "portraits/wolf-portrait001.jpg");
  config.enabled = true;
  bear.actor.img = "manual.jpg";
  config.enabled = false;
  await Promise.all([syncToken(wolf, { restore: true }), syncToken(bear, { restore: true }), syncToken(linkedWolf, { restore: true })]);
  assert.equal(wolf.actor.img, "original.jpg");
  assert.equal(bear.actor.img, "manual.jpg");
  assert.equal(actor.img, "default.jpg");
  assert.equal(actor.getFlag(ID, "portrait"), undefined);
  config.enabled = true;
  await syncToken(linkedBear);
  actor.img = "manual-shared.jpg";
  config.enabled = false;
  await syncToken(linkedBear, { restore: true });
  assert.equal(actor.img, "manual-shared.jpg", "manual shared portrait is preserved when disabled");
  config.enabled = true;

  const { ShiftingFacesConfig } = await import("../src/config.js");
  ShiftingFacesConfig.preview.call({ actor }, {}, {
    querySelector: () => ({ getAttribute: () => "portrait.jpg" }),
    dataset: { kind: "Portrait" }
  });
  assert.deepEqual(popout, { src: "portrait.jpg", window: { title: "Warrior — Portrait" } });
});
test("unnamed pairs restore original token names across switches and preserve manual edits", async () => {
  const { syncToken } = await import("../src/module.js");
  const names = { enabled: true, tokens: ["sword.webp", "bow.webp", "plain.webp"], pairs: [
    { token: "sword.webp", name: "Warrior-swordsman" },
    { token: "bow.webp", name: "Warrior-archer" }
  ] };
  const actor = { id: "names", name: "Warrior", img: "default.webp", getFlag: () => names };
  globalThis.game = { actors: new Map([[actor.id, actor]]) };
  const flags = { portrait: { original: "default.webp", applied: "default.webp" } };
  const token = { uuid: "name-test", name: "Warrior 3", actorId: actor.id, actorLink: false,
    actor: { img: "default.webp", update: async function (data) { this.img = data.img; } }, parent: {}, isOwner: true,
    _source: { texture: { src: "sword.webp" } },
    getFlag: (scope, key) => flags[key],
    setFlag: async (scope, key, value) => { flags[key] = value; },
    unsetFlag: async (scope, key) => { delete flags[key]; },
    update: async data => { if ("name" in data) token.name = data.name; }
  };
  await syncToken(token);
  assert.equal(token.name, "Warrior-swordsman");
  token._source.texture.src = "bow.webp";
  await syncToken(token);
  assert.equal(token.name, "Warrior-archer");
  token._source.texture.src = "plain.webp";
  await syncToken(token);
  assert.equal(token.name, "Warrior 3");
  assert.equal(flags.tokenName, undefined);
  token._source.texture.src = "sword.webp";
  await syncToken(token);
  token.name = "Captain";
  token._source.texture.src = "plain.webp";
  await syncToken(token);
  assert.equal(token.name, "Captain");
  // Recover a token named by the earlier implementation, which stored no backup.
  token.name = "Warrior-archer";
  await syncToken(token);
  assert.equal(token.name, "Warrior");
  token._source.texture.src = "sword.webp";
  await syncToken(token);
  names.enabled = false;
  await syncToken(token, { restore: true });
  assert.equal(token.name, "Warrior");
  assert.equal(flags.tokenName, undefined);
});

test("Save and apply closes only after successful save and application", async () => {
  const { ShiftingFacesConfig } = await import("../src/config.js");
  const events = [];
  globalThis.ui = { notifications: { info: () => {}, warn: () => events.push("warning"), error: () => events.push("error") } };
  const actor = { isOwner: true, setFlag: async () => { events.push("saved"); } };
  globalThis.game = { user: { isGM: true }, modules: new Map([[ID, { api: { applyActor: async () => { events.push("applied"); return true; } } }]]) };
  const app = { actor, rows: [], draft: {}, capture: () => {}, close: async () => { events.push("closed"); } };
  await ShiftingFacesConfig.save.call(app);
  assert.deepEqual(events, ["saved", "applied", "closed"]);
  events.length = 0;
  game.modules.get(ID).api.applyActor = async () => false;
  await ShiftingFacesConfig.save.call(app);
  assert.deepEqual(events, ["saved", "warning"]);
  events.length = 0;
  app.rows = [{ token: "*.webp", mode: "auto" }];
  await ShiftingFacesConfig.save.call(app);
  assert.deepEqual(events, ["warning"]);
});
test("existing avatar flags load as portrait configuration without losing explicit defaults", () => {
  const actor = { getFlag: () => ({
    enabled: true, avatarPattern: "art/portraits/*.webp", avatars: ["art/portraits/warrior001.webp"],
    mappings: [{ token: "token001.webp", avatar: "custom.webp" }, { token: "token002.webp", avatar: "" }]
  }) };
  const current = configFor(actor);
  assert.equal(current.portraitPattern, "art/portraits/*.webp");
  assert.deepEqual(current.portraits, ["art/portraits/warrior001.webp"]);
  assert.equal(resolvePortrait(current, "token001.webp", "default.webp"), "custom.webp");
  assert.equal(resolvePortrait(current, "token002.webp", "default.webp"), "default.webp");
  assert.equal("avatars" in current, false);
});
test("old module namespace migrates configuration and portrait backups atomically", async () => {
  const { LEGACY_ID, migrateFlags, moduleFlag, defaultPortraitForActor } = await import("../src/pairing.js");
  const old = {
    config: { enabled: true, avatarPattern: "portraits/*", avatars: ["portrait001.webp"], mappings: [{ token: "token001.webp", avatar: "custom.webp" }] },
    portrait: { original: "original.webp", applied: "custom.webp" }
  };
  let update;
  const actor = {
    flags: { [LEGACY_ID]: old }, img: "custom.webp", isOwner: true,
    getFlag: (scope, key) => actor.flags[scope]?.[key],
    update: async (data, options) => { update = data; assert.equal(options[ID], true); }
  };
  assert.equal(configFor(actor).enabled, true);
  assert.equal(moduleFlag(actor, "portrait").original, "original.webp");
  assert.equal(defaultPortraitForActor(actor), "original.webp");
  await migrateFlags(actor);
  assert.equal(update["flags." + ID + ".config"].portraitPattern, "portraits/*");
  assert.deepEqual(update["flags." + ID + ".config"].mappings, [{ token: "token001.webp", portrait: "custom.webp" }]);
  assert.deepEqual(update["flags." + ID + ".portrait"], old.portrait);
  assert.equal(update["flags." + LEGACY_ID + ".-=config"], null);
  assert.equal(update["flags." + LEGACY_ID + ".-=portrait"], null);
  actor.flags[ID] = { config: { enabled: false }, portrait: { original: "new.webp", applied: "current.webp" } };
  await migrateFlags(actor);
  assert.equal("flags." + ID + ".config" in update, false);
  assert.equal("flags." + ID + ".portrait" in update, false);
});
