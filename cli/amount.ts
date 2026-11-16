import type { Amount } from "../bundle/bundle.ts";

const FRACTIONS: Record<string, number> = { "½": 1 / 2, "¼": 1 / 4, "¾": 3 / 4, "⅓": 1 / 3, "⅔": 2 / 3, "⅛": 1 / 8 };
const FRACTION_CHARS = Object.keys(FRACTIONS).join("");
const QUANTITY = new RegExp(
  `^(?:(\\d+)\\s+(\\d+)/(\\d+)|(\\d+)/(\\d+)|(\\d+(?:[.,]\\d+)?)\\s?([${FRACTION_CHARS}])?|([${FRACTION_CHARS}]))(.*)$`,
  "s",
);

/** Reads an italic amount such as "300g", "2½ tsp", "1/2 tsp" or "1 stick (5 cm)"; null if it has no leading number. */
export function parseAmount(text: string): Amount | null {
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
