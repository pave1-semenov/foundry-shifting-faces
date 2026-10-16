import test from "node:test";
import assert from "node:assert/strict";
import { configFor } from "../src/pairing.js";
import { syncScenescape } from "../src/scenescape.js";

test("pairings default on and preserve explicit opt outs and pairing heights", () => {
  assert.equal(configFor({ getFlag: () => undefined }).enabled, true);
  const config = configFor({ getFlag: () => ({ enabled: false, tokens: ["a.webp"], pairs: [{ token: "a.webp", height: 9 }] }) });
  assert.equal(config.enabled, false);
  assert.equal(config.pairs[0].height, 9);
});

test("Scenescape height resizes around feet and is gated by integration and pairings", async () => {
  let enabled = true;
  globalThis.game = { modules: new Map([["multi-token-edit", { active: true }]]), settings: { get: () => enabled } };
  const writes = [];
  const token = { texture: { src: "a.webp" }, getFlag: () => 6, parent: { getFlag: () => ({}), grid: { sizeX: 100, sizeY: 100 } }, width: 1, height: 2, x: 100, y: 200, update: async (...args) => writes.push(args) };
  const config = { enabled: true, pairs: [{ token: "a.webp", height: 12 }] };
  await syncScenescape(token, config);
  assert.equal(writes[0][0]["flags.multi-token-edit.size"], 12);
  assert.equal(writes[0][0].height, 4);
  assert.equal(writes[0][0].y, 0);
  assert.equal(writes[0][0].x, 50);
  assert.equal(writes[0][1].scenescape, true);
  enabled = false;
  await syncScenescape(token, config);
  enabled = true;
  await syncScenescape(token, { ...config, enabled: false });
  await syncScenescape(token, { ...config, pairs: [{ token: "a.webp", height: null }] });
  assert.equal(writes.length, 1);
});


test("Scenescape classification preserves explicit checkbox values and infers older height pairings", () => {
  const config = configFor({ getFlag: () => ({ tokens: ["old.webp", "unchecked.webp", "marked.webp"], pairs: [
    { token: "old.webp", height: 6 }, { token: "unchecked.webp", height: 6, scenescape: false }, { token: "marked.webp", scenescape: true }
  ] }) });
  assert.deepEqual(config.pairs.map(pair => pair.scenescape), [true, false, true]);
});
