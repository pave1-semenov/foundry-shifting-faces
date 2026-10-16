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

/** Legacy numeric values are feet; new values retain the original text and unit. */
export function heightForInput(feet) {
  if (typeof feet === "string") return feet;
  return Number.isFinite(feet) && feet > 0 ? feet + " ft" : "";
}

/** Only the value sent to Scenescape is converted and rounded. */
export function scenescapeHeight(value) {
  const feet = typeof value === "number" ? value : heightInFeet(value);
  return Number.isFinite(feet) && feet > 0 ? Math.round((feet + Number.EPSILON) * 10) / 10 : null;
}
