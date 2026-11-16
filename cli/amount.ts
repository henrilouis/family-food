// Two kinds of amount: a Recipe's italic amount as written ("2½ tsp", "1 tin (400 g)"), which the display bundle
// carries and doubles, and a Measure in g, ml or pieces, which compares a Recipe's amount with an AH pack size.
import type { Amount } from "../bundle/bundle.ts";

const FRACTIONS: Record<string, number> = { "½": 1 / 2, "¼": 1 / 4, "¾": 3 / 4, "⅓": 1 / 3, "⅔": 2 / 3, "⅛": 1 / 8 };
const FRACTION_CHARS = Object.keys(FRACTIONS).join("");
const QUANTITY = new RegExp(
  `^(?:(\\d+)\\s+(\\d+)/(\\d+)|(\\d+)/(\\d+)|(\\d+(?:[.,]\\d+)?)\\s?([${FRACTION_CHARS}])?|([${FRACTION_CHARS}]))(.*)$`,
  "s",
);

/** Reads a Recipe's italic amount such as "300g", "2½ tsp", "1/2 tsp" or "1 stick (5 cm)"; null if it has no leading number. */
export function parseRecipeAmount(text: string): Amount | null {
  const m = text.trim().match(QUANTITY);
  if (!m) return null;
  const [, whole, num, den, fnum, fden, decimal, decimalFraction, fraction, rest] = m;
  let quantity: number;
  if (whole) quantity = Number(whole) + Number(num) / Number(den);
  else if (fnum) quantity = Number(fnum) / Number(fden);
  else if (decimal) quantity = Number(decimal.replace(",", ".")) + (decimalFraction ? FRACTIONS[decimalFraction] : 0);
  else quantity = FRACTIONS[fraction];
  return { text: text.trim(), quantity, unit: rest.trim() };
}

export type Dimension = "mass" | "volume" | "count";
/** An amount in g, ml or pieces. */
export type Measure = { value: number; dimension: Dimension };

const units: Record<string, [Dimension, number]> = {
  g: ["mass", 1],
  gr: ["mass", 1],
  gram: ["mass", 1],
  kg: ["mass", 1000],
  kilo: ["mass", 1000],
  ml: ["volume", 1],
  cl: ["volume", 10],
  dl: ["volume", 100],
  l: ["volume", 1000],
  liter: ["volume", 1000],
  st: ["count", 1],
  stuk: ["count", 1],
  stuks: ["count", 1],
  piece: ["count", 1],
  pieces: ["count", 1],
  "": ["count", 1],
};

/** Reads a measure or an AH pack size, such as "400 g", "ca. 1 kg", "1,5 l", "6 stuks", "per stuk" or "3" (pieces). */
export function parseMeasure(text: string | undefined): Measure | null {
  if (!text) return null;
  const size = text.trim().toLowerCase().replace(/^ca\.?\s*/, "").replace(/^per\s+/, "1 ").replace(/\.$/, "");
  const match = size.match(/^(\d+(?:[.,]\d+)?)\s*([a-z]*)$/);
  if (!match) return null;
  const unit = units[match[2]];
  const value = Number(match[1].replace(",", ".")) * (unit?.[1] ?? 0);
  return unit && value > 0 ? { value, dimension: unit[0] } : null;
}

const SPOONS: Record<string, number> = { tsp: 5, tbsp: 15 };
const PIECES = ["", "large", "medium", "small", "whole"];

/** A Recipe amount as a Measure: "300g", "1 tbsp" (15 ml), "2 tins (400 g)", "1 large" (a piece); null when it has none. */
export function measureOf({ quantity, unit }: Amount): Measure | null {
  const u = unit.trim().toLowerCase();
  const tin = u.match(/^tins?\s*\((.+)\)$/);
  if (tin) {
    const size = parseMeasure(tin[1]);
    return size && { ...size, value: size.value * quantity };
  }
  if (u in SPOONS) return { dimension: "volume", value: quantity * SPOONS[u] };
  if (PIECES.includes(u)) return { dimension: "count", value: quantity };
  const one = parseMeasure(`1 ${u}`);
  return one && { ...one, value: one.value * quantity };
}
