import { ingredientName, KINDS, sameIngredient, type Kind } from "../ingredient.ts";
import { readJsonFile } from "../json-file.ts";
import { UserError } from "../user-error.ts";
import { lineText, weekLines } from "../week-lines.ts";
import { basketRecord, type BasketRecord } from "./section.ts";
import { staplesThisWeek } from "./staples.ts";

/** The Match for one ingredient line of a Recipe on the Week Menu, as the fill-basket skill hands it over. */
export type Match = {
  /** The Recipe or Side, by note name ("Dahl"). */
  recipe: string;
  /** The ingredient line as written in the Recipe, with or without the italics ("300g red split lentils"). */
  line: string;
  /** The AH product's webshop id; none when nothing sensible turned up (the line becomes a free-text note). */
  product?: number | null;
  /** How much of one pack the line needs as written, for one dinner: "1 large onion" from a 1 kg bag ≈ 0.15. */
  packFraction?: number;
  kind?: Kind;
  /** The AH product's title, for the shopping list when AH can't be read ("AH Rode linzen 500 g"). */
  title?: string;
};

/** What `food basket fill` reads: the skill's Matches, and the Cupboard Ingredients at home (webshop ids). */
export type BasketInput = { lines: Match[]; haveAtHome?: number[] };

/** The skill's list doesn't fit the Week Menu. */
export class BasketInputError extends UserError {}

/** Where a product goes in the shopping list: Fresh or Cupboard Ingredients for a Recipe, Staples when only a Staple needs it. */
export type ShoppingGroup = "Fresh" | "Cupboard Ingredients" | "Staples";

export type PlannedProduct = {
  id: number;
  quantity: number;
  covers: string[];
  /** From the skill's list or Staples.md; null when neither gives one. */
  title: string | null;
  group: ShoppingGroup;
};

/** What the Week Menu needs from AH, before looking at Mijn lijst. */
export type BasketPlan = {
  weekStart: string;
  /** The Week Menu note. */
  file: string;
  /** Whole packs per product, and the ingredients and Staples each covers. */
  products: PlannedProduct[];
  /** Ingredients and Staples with no AH product, as free-text notes for Mijn lijst: "lime leaves (25)", "Tea (Staple ×1)". */
  notes: string[];
  /** Optional lines, not bought: "Tacos: 8 tortilla wraps (optional)". */
  optional: string[];
  /** The Cupboard Ingredients left out because they are at home, by ingredient name. */
  haveAtHome: string[];
  /** What an earlier run recorded in the Week Menu's `## Basket` section; empty when there is none. */
  recorded: BasketRecord;
};

/**
 * Works out what the Locked Week Menu starting on `weekStart` needs from AH: each ingredient line as written,
 * ×2 on a Double cook day, nothing for a Double 2nd day, the Free Day or optional lines; plus the Staples;
 * summed per product, then rounded to whole packs; without Always in House items and what is at home.
 */
export async function planBasket(vault: string, weekStart: string, input: BasketInput): Promise<BasketPlan> {
  const { note, lines } = await weekLines(vault, weekStart);
  const problems: string[] = [];
  const used = new Set<Match>();
  type Sum = { total: number; fresh: boolean; recipe: boolean; covers: string[]; title: string | null };
  const products = new Map<number, Sum>();
  const product = (id: number) =>
    products.get(id) ?? products.set(id, { total: 0, fresh: true, recipe: false, covers: [], title: null }).get(id)!;
  const notes: { name: string; amounts: Map<string, number> }[] = [];
  const optional = new Set<string>();
  const haveAtHome = new Set<string>();

  for (const { recipe: recipeName, ingredient, times: count, optional: isOptional } of lines) {
    const line = lineText(ingredient);
    const name = ingredientName(ingredient.text);
    const match = input.lines.find((m) => sameRecipe(m.recipe, recipeName) && sameLine(m.line, line));
    if (match) used.add(match);
    if (isOptional) {
      optional.add(`${recipeName}: ${line}`);
      continue;
    }
    if (!match) {
      problems.push(`${recipeName}: no match for "${line}"`);
      continue;
    }
    if (match.kind !== undefined && !KINDS.includes(match.kind)) {
      problems.push(`${recipeName}: "${line}" has kind "${match.kind}"; expected one of ${KINDS.join(", ")}`);
      continue;
    }
    if (match.kind === "Always in House") continue;
    if (!match.product) {
      let note = notes.find((n) => sameIngredient(n.name, name));
      if (!note) notes.push((note = { name, amounts: new Map<string, number>() }));
      if (ingredient.amount) {
        const unit = ingredient.amount.unit;
        note.amounts.set(unit, (note.amounts.get(unit) ?? 0) + ingredient.amount.quantity * count);
      }
      continue;
    }
    if (!match.kind) problems.push(`${recipeName}: "${line}" has a product but no kind`);
    if (!(typeof match.packFraction === "number" && match.packFraction > 0)) {
      problems.push(`${recipeName}: "${line}" has a product but no packFraction above 0`);
      continue;
    }
    if (input.haveAtHome?.includes(match.product)) {
      haveAtHome.add(name);
      continue;
    }
    const sum = product(match.product);
    sum.total += match.packFraction * count;
    sum.fresh &&= match.kind === "Fresh";
    sum.recipe = true;
    sum.title ??= match.title ?? null;
    if (!sum.covers.some((covered) => sameIngredient(covered, name))) sum.covers.push(name);
  }
  for (const match of input.lines) {
    if (!used.has(match)) problems.push(`${match.recipe}: "${match.line}" is not an ingredient line of a Recipe bought this week`);
  }
  if (problems.length) throw new BasketInputError(`The matches don't fit the Week Menu of ${weekStart}:\n${problems.map((p) => `- ${p}`).join("\n")}`);

  const staples = await staplesThisWeek(vault, note);
  for (const staple of staples) {
    if (staple.product === null) continue;
    const sum = product(staple.product);
    sum.total += staple.quantity;
    sum.title ??= staple.title;
    sum.covers.push(`${staple.name} (Staple)`);
  }

  return {
    weekStart,
    file: note.file,
    products: [...products].map(([id, { total, fresh, recipe, covers, title }]) => ({
      id,
      quantity: wholePacks(total, fresh),
      covers,
      title,
      group: !recipe ? "Staples" : fresh ? "Fresh" : "Cupboard Ingredients",
    })),
    notes: [
      ...notes.map(({ name, amounts }) =>
        amounts.size ? `${name} (${[...amounts].map(([unit, q]) => [quantityText(q), unit].filter(Boolean).join(" ")).join(" + ")})` : name,
      ),
      ...staples.filter((staple) => staple.product === null).map((staple) => `${staple.name} (Staple ×${staple.quantity})`),
    ],
    optional: [...optional],
    haveAtHome: [...haveAtHome],
    recorded: basketRecord(note),
  };
}

/** A product's title without AH: from an earlier run's record, the skill's list or Staples.md. */
export function productTitle(plan: BasketPlan, product: PlannedProduct): string {
  return plan.recorded.products.find((p) => p.id === product.id)?.title ?? product.title ?? `product ${product.id}`;
}

/** Rounds up to whole packs, but a Fresh item rounds down when the total is no more than 10% over a whole pack. */
function wholePacks(total: number, fresh: boolean): number {
  const epsilon = 1e-9;
  const whole = Math.floor(total + epsilon);
  if (fresh && whole >= 1 && total - whole <= 0.1 + epsilon) return whole;
  return Math.ceil(total - epsilon);
}

const sameRecipe = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

/** Ingredient lines compare without italics, case or spacing: "*300 g* Red split lentils" is "300g red split lentils". */
function sameLine(a: string, b: string): boolean {
  const normal = (s: string) => s.replace(/^\s*[-*]\s+/, "").replace(/[*_]/g, "").replace(/\s+/g, "").toLowerCase();
  return normal(a) === normal(b);
}

/** A summed quantity for people: 2, 2.5, 0.33. */
function quantityText(q: number): string {
  return String(Number(q.toFixed(2)));
}

/** Reads the skill's list from a JSON file. */
export async function readBasketInput(file: string): Promise<BasketInput> {
  const input = (await readJsonFile(file, "a JSON list of Matches")) as BasketInput;
  if (!Array.isArray(input?.lines)) throw new BasketInputError(`${file}: expected {"lines": [...], "haveAtHome": [...]}`);
  return input;
}
