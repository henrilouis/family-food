import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { Amount, Ingredient } from "../bundle/bundle.ts";
import { measureOf, parseMeasure } from "./amount.ts";
import type { Match } from "./basket/quantities.ts";
import { ingredientName, KINDS, sameIngredient, type Kind } from "./ingredient.ts";
import { weekLines } from "./week-lines.ts";
import { NoteError, readNote, tableRows, type Note } from "./vault.ts";
import { UserError } from "./user-error.ts";

const PRODUCTS_NOTE = "Products.md";

/** A row of Products.md: the AH product remembered for a recipe ingredient. */
export type PinnedProduct = {
  /** The ingredient in English, as the Recipes write it: "red split lentils". */
  ingredient: string;
  /** The webshop id; null when there is none (an Always in House item, or nothing sensible at AH). */
  product: number | null;
  title: string | null;
  /** The pack, with its pieces when it holds several: "1 kg ≈ 8 onions". */
  pack: string;
  kind: Kind;
};

/** A line of `food basket lines`: an ingredient line the Week Menu buys, as the fill-basket skill matches it. */
export type BasketLine = {
  recipe: string;
  /** The line as written in the Recipe, italics included. */
  line: string;
  /** The name its Pinned Product is found by: "onion" for "*1 large* onion (about 150 g), finely chopped", "tinned tomatoes" for "*1 tin (400 g)* tomatoes". */
  ingredient: string;
  times: number;
  optional: boolean;
  pinned: PinnedProduct | null;
  /** The line's Match for `food basket fill`, from its Pinned Product; null when it has none, or the line is optional. */
  match: MatchFromPin | null;
};

/**
 * The name a line's Pinned Product is found by: the ingredient without amount, preparation or remarks in brackets,
 * and "tinned" in front when the line is bought in tins ("*2 tins (400 g)* tomatoes" → "tinned tomatoes"), so that
 * tinned and fresh tomatoes can each have their own Pinned Product.
 */
function pinName(ingredient: Ingredient): string {
  const name = ingredientName(ingredient.text).replace(/\s*\([^)]*\)?/g, "").trim();
  const tinned = /^tins?\b/i.test(ingredient.amount?.unit ?? "") && !/^tinned\b/i.test(name);
  return tinned ? `tinned ${name}` : name;
}

/** A Match taken from a Pinned Product; its `packFraction` is null when it couldn't be worked out. */
type MatchFromPin = Omit<Match, "packFraction"> & { packFraction?: number | null };

/** Every ingredient line of the Recipes and Sides the Week Menu of `weekStart` buys, with its Pinned Product. */
export async function listBasketLines(vault: string, weekStart: string): Promise<{ weekStart: string; lines: BasketLine[] }> {
  const { lines } = await weekLines(vault, weekStart);
  const pins = await readPinnedProducts(vault);
  return {
    weekStart,
    lines: lines.map(({ recipe, ingredient, times, optional }) => {
      const name = pinName(ingredient);
      const line = ingredient.amount ? `*${ingredient.amount.text}* ${ingredient.text}` : ingredient.text;
      const pinned = pins.find((pin) => sameIngredient(pin.ingredient, name)) ?? null;
      return { recipe, line, ingredient: name, times, optional, pinned, match: pinned && !optional ? matchFromPin(recipe, line, ingredient, pinned) : null };
    }),
  };
}

/** The line's Match from its Pinned Product; `packFraction` is null when the amount and the Pack don't compare. */
function matchFromPin(recipe: string, line: string, ingredient: Ingredient, pin: PinnedProduct): MatchFromPin {
  const match: MatchFromPin = { recipe, line, product: pin.product };
  if (pin.title) match.title = pin.title;
  match.kind = pin.kind;
  if (pin.product !== null && pin.kind !== "Always in House") match.packFraction = packFraction(ingredient.amount, pin.pack);
  return match;
}

/**
 * The share of one pack an amount is: by weight or volume ("300g" of "400 g", "1 tbsp" as 15 ml), tins by the size in
 * brackets ("2 tins (400 g)"), and pieces ("1 large" of "1 kg ≈ 8 onions", "2" of "6 stuks"). Null when they don't compare.
 */
function packFraction(amount: Amount | null, pack: string): number | null {
  if (!amount) return null;
  const [size, pieces] = pack.split(/[≈~]/);
  const packSize = parseMeasure(size?.trim());
  const piecesPerPack = Number(pieces?.trim().match(/^\d+(?:[.,]\d+)?/)?.[0].replace(",", "."));
  const need = measureOf(amount);
  if (!need || !packSize) return null;
  let share: number;
  if (need.dimension === packSize.dimension) share = need.value / packSize.value;
  else if (need.dimension === "count" && piecesPerPack > 0) share = need.value / piecesPerPack;
  else return null;
  return Number(share.toFixed(3));
}

/** Products.md's rows; none when the note doesn't exist. The webshop id is in an AH id column, or in brackets after the product. */
export async function readPinnedProducts(vault: string): Promise<PinnedProduct[]> {
  let note: Note;
  try {
    note = await readNote(path.join(vault, PRODUCTS_NOTE));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
  return (tableRows(note, "ingredient") ?? [])
    .filter((row) => row.ingredient)
    .map((row) => {
      const kind = KINDS.find((k) => k.toLowerCase() === row.kind?.toLowerCase());
      if (!kind) throw new NoteError(note.file, `the Pinned Product "${row.ingredient}" has kind "${row.kind}"; expected one of ${KINDS.join(", ")}`);
      const product = row["ah id"]?.match(/^\d+$/)?.[0] ?? row["ah product"]?.match(/\((\d+)\)\s*$/)?.[1];
      const title = (row["ah product"] ?? "").replace(/\s*\(\d+\)\s*$/, "");
      return { ingredient: row.ingredient, product: product ? Number(product) : null, title: title || null, pack: row.pack ?? "", kind };
    });
}

/** A pin `food products pin` can't write. */
export class PinInputError extends UserError {}

const NEW_PRODUCTS_NOTE = `# Products

Pinned Products: the Albert Heijn product remembered for a recipe ingredient, bought without asking again. Basket filling adds a row when an adult confirms a new Match; a correction replaces the row. Kind is Fresh, Cupboard Ingredient or Always in House.

| Ingredient | AH product | AH id | Pack | Kind |
|---|---|---|---|---|
`;

/**
 * Pins the products of confirmed Matches in Products.md: a pin replaces the row for the same ingredient (singular or plural),
 * otherwise it is added at the end. Keeps the table's columns and, when its columns are padded, re-pads them.
 * Returns what changed, one line per pin. Refuses (and writes nothing) when a pin isn't complete.
 */
export async function pinProducts(vault: string, pins: PinnedProduct[]): Promise<string[]> {
  const problems = pins.flatMap((pin) => {
    if (!pin?.ingredient?.trim()) return ["a pin needs an ingredient"];
    if (!KINDS.includes(pin.kind)) return [`${pin.ingredient}: kind "${pin.kind}"; expected one of ${KINDS.join(", ")}`];
    if (pin.product != null && !Number.isInteger(pin.product)) return [`${pin.ingredient}: product must be a webshop id`];
    if (pin.product != null && !pin.title?.trim()) return [`${pin.ingredient}: a product needs its title`];
    return [];
  });
  if (problems.length) throw new PinInputError(`Nothing pinned:\n${problems.map((p) => `- ${p}`).join("\n")}`);

  const file = path.join(vault, PRODUCTS_NOTE);
  const text = await readFile(file, "utf8").then((t) => t.replace(/\r\n/g, "\n"), (error) => {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return NEW_PRODUCTS_NOTE;
    throw error;
  });
  const lines = text.split("\n");
  const cells = (line: string) => line.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map((c) => c.trim());
  const headerAt = lines.findIndex((l) => l.trim().startsWith("|") && /\bingredient\b/i.test(l));
  if (headerAt < 0) throw new NoteError(file, "no table with an Ingredient column");
  let endAt = headerAt + 1;
  while (endAt < lines.length && lines[endAt].trim().startsWith("|")) endAt++;
  const header = cells(lines[headerAt]);
  const columns = header.map((h) => h.toLowerCase());
  const separator = lines[headerAt + 1] ?? "";
  const padded = cells(separator).some((c) => c.length > 3);
  const rows = lines.slice(headerAt + 2, endAt).map(cells);
  const column = (name: string) => columns.indexOf(name);
  const idColumn = column("ah id") >= 0;
  const describe = (row: string[]) => {
    const pin = rowPin(row);
    const product = pin.product === null ? "no AH product" : `${pin.title} (${pin.product})`;
    return `${pin.ingredient}: ${product}, ${pin.kind}`;
  };
  const rowPin = (row: string[]): PinnedProduct => {
    const at = (name: string) => row[column(name)] ?? "";
    const product = at("ah id").match(/^\d+$/)?.[0] ?? at("ah product").match(/\((\d+)\)\s*$/)?.[1];
    return {
      ingredient: at("ingredient"),
      product: product ? Number(product) : null,
      title: at("ah product").replace(/\s*\(\d+\)\s*$/, "") || null,
      pack: at("pack"),
      kind: at("kind") as Kind,
    };
  };

  const done: string[] = [];
  for (const pin of pins) {
    const product = pin.product ?? null;
    const values: Record<string, string> = {
      ingredient: pin.ingredient.trim(),
      "ah product": product === null ? "" : idColumn ? pin.title!.trim() : `${pin.title!.trim()} (${product})`,
      "ah id": product === null ? "" : String(product),
      pack: pin.pack?.trim() ?? "",
      kind: pin.kind,
    };
    const at = rows.findIndex((row) => sameIngredient(row[column("ingredient")] ?? "", pin.ingredient));
    const row = columns.map((name, i) => values[name] ?? (at >= 0 ? rows[at][i] ?? "" : ""));
    if (at >= 0) {
      done.push(`Replaced ${describe(rows[at])} → ${describe(row)}`);
      rows[at] = row;
    } else {
      done.push(`Pinned ${describe(row)}`);
      rows.push(row);
    }
  }

  const width = (s: string) => [...s].length;
  const widths = columns.map((_, i) => Math.max(3, ...[header, ...rows].map((row) => width(row[i] ?? ""))));
  const render = (row: string[]) =>
    `| ${columns.map((_, i) => (padded ? (row[i] ?? "").padEnd(widths[i] + (row[i] ?? "").length - width(row[i] ?? "")) : (row[i] ?? ""))).join(" | ")} |`;
  const rule = `|${columns.map((_, i) => "-".repeat(padded ? widths[i] + 2 : 3)).join("|")}|`;
  const table = [render(header), rule, ...rows.map(render)];
  const result = [...lines.slice(0, headerAt), ...table, ...lines.slice(endAt)].join("\n");
  await writeFile(file, result.endsWith("\n") ? result : `${result}\n`);
  return done;
}
