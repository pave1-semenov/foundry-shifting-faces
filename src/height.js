/** Parse user input into Scenescape feet. Unitless input is centimeters. */
export function heightInFeet(value) {
  const text = String(value ?? "").trim();
  if (!text) return null;
  const match = text.match(/^([+]?(?:\d+(?:[.,]\d*)?|[.,]\d+))\s*(feet|foot|ft|'|meters?|metres?|m|centimeters?|centimetres?|cm)?$/i);
  if (!match) return NaN;
  const amount = Number(match[1].replace(",", "."));
  const unit = (match[2] ?? "cm").toLowerCase();
  const feet = /^(feet|foot|ft|')$/.test(unit) ? amount : /^(m|meters?|metres?)$/.test(unit) ? amount / 0.3048 : amount / 30.48;
  return Number.isFinite(feet) && feet > 0 ? feet : NaN;
}

/** Stored values are already feet; keep their units explicit when editing. */
export function heightForInput(feet) {
  return Number.isFinite(feet) && feet > 0 ? feet + " ft" : "";
}
