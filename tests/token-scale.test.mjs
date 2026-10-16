import test from "node:test";
import assert from "node:assert/strict";
import { syncTokenScale } from "../src/token-scale.js";
import { configFor } from "../src/pairing.js";

test("pair scales persist through config normalization", () => {
  assert.equal(configFor({ getFlag: () => ({ tokens: ["a.webp"], pairs: [{ token: "a.webp", scale: 1.5 }] }) }).pairs[0].scale, 1.5);
});

test("scale switches preserve mirroring, avoid compounding, and restore blank or disabled overrides", async () => {
  let backup;
  let writes = 0;
  const texture = { src: "a.webp", scaleX: -1, scaleY: 1.5 };
  const token = { _source: { texture }, getFlag: () => backup, update: async data => {
    writes++;
    if ("texture.scaleX" in data) texture.scaleX = data["texture.scaleX"];
    if ("texture.scaleY" in data) texture.scaleY = data["texture.scaleY"];
    if ("flags.shifting-faces.tokenScale" in data) backup = data["flags.shifting-faces.tokenScale"];
    if ("flags.shifting-faces.-=tokenScale" in data) backup = undefined;
  } };
  const config = { enabled: true, pairs: [{ token: "a.webp", scale: 2 }, { token: "b.webp", scale: 0.5 }] };
  await syncTokenScale(token, config);
  assert.equal(texture.scaleX, -2);
  assert.equal(texture.scaleY, 3);
  await syncTokenScale(token, config);
  assert.equal(writes, 1);
  texture.src = "b.webp";
  await syncTokenScale(token, config);
  assert.equal(texture.scaleX, -0.5);
  assert.equal(texture.scaleY, 0.75);
  texture.src = "c.webp";
  await syncTokenScale(token, config);
  assert.equal(texture.scaleX, -1);
  assert.equal(texture.scaleY, 1.5);
  assert.equal(backup, undefined);
  texture.src = "a.webp";
  await syncTokenScale(token, config);
  await syncTokenScale(token, { ...config, enabled: false }, true);
  assert.equal(texture.scaleX, -1);
  await syncTokenScale(token, config);
  texture.scaleX = -4;
  await syncTokenScale(token, { ...config, enabled: false }, true);
  assert.equal(texture.scaleX, -4);
  assert.equal(backup, undefined);
});
