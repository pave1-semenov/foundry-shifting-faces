import test from "node:test";
import assert from "node:assert/strict";
import { heightInFeet, heightForInput } from "../src/height.js";

test("heights accept explicit units and default to centimeters", () => {
  for (const input of ["182.88", "182.88 cm", "1.8288 m", "1,8288 M", "6 feet", "6 ft", "6 foot", "6'"]) {
    assert.ok(Math.abs(heightInFeet(input) - 6) < 1e-12, input);
  }
  assert.equal(heightInFeet(""), null);
  assert.equal(heightInFeet(null), null);
  for (const input of ["0", "-180", "Infinity", "6 yards", "180 cm junk", "1 m 80 cm"]) assert.ok(Number.isNaN(heightInFeet(input)), input);
});

test("stored feet reopen with explicit units and survive repeated saves without conversion drift", () => {
  for (const feet of [6, heightInFeet("180"), 0.1, 100]) {
    assert.equal(heightInFeet(heightForInput(feet)), feet);
  }
  assert.equal(heightForInput(null), "");
});


test("entered units persist and Scenescape alone receives rounded feet", async () => {
  const { scenescapeHeight } = await import("../src/height.js");
  for (const input of ["180 cm", "1.8 m", "180", "5.9055 feet", "1,8 m"]) {
    assert.equal(heightForInput(input), input);
    assert.equal(scenescapeHeight(input), 5.9);
  }
  assert.equal(scenescapeHeight(6.123456), 6.1);
  assert.equal(scenescapeHeight(null), null);
});
