import test from "node:test";
import assert from "node:assert/strict";
import { ID } from "../src/pairing.js";
import { canConfigureActor, registerSettings } from "../src/settings.js";

test("player configuration is a disabled world setting with file permission guidance", () => {
  let registration;
  globalThis.game = { settings: { register: (...args) => { registration = args; } } };
  registerSettings();
  assert.equal(registration[0], ID);
  assert.equal(registration[1], "allowPlayerConfig");
  const options = registration[2];
  assert.equal(options.scope, "world");
  assert.equal(options.default, false);
  assert.equal(options.type, Boolean);
  assert.equal(options.config, true);
  assert.match(options.hint, /Use File Browser/);
  assert.match(options.hint, /Upload Files/);
});

test("configuration requires GM or enabled player access and source actor ownership", () => {
  let allowed = false;
  const actor = { isOwner: true };
  globalThis.game = { user: { isGM: false }, settings: { get: () => allowed }, actors: new Map([["actor", actor]]) };
  assert.equal(canConfigureActor(actor), false);
  allowed = true;
  assert.equal(canConfigureActor(actor), true);
  assert.equal(canConfigureActor({ isOwner: false }), false);
  const synthetic = { isToken: true, isOwner: true, token: { actorId: "actor" } };
  assert.equal(canConfigureActor(synthetic), true);
  actor.isOwner = false;
  assert.equal(canConfigureActor(synthetic), false);
  game.user.isGM = true;
  allowed = false;
  assert.equal(canConfigureActor(actor), true);
  assert.equal(canConfigureActor(null), false);
});