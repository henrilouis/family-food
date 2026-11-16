import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { AhGateway } from "./adapters/ah/gateway.ts";
import {
  findRecipeNote,
  NoteError,
  parseRecipe,
  parseWeekMenu,
  readNote,
  readWeekMenuNotes,
  tableRows,
  VaultError,
  weekStartOf,
  type Note,
} from "./vault.ts";

const STAPLES_NOTE = "Staples.md";
const BASKET_HEADING = "Basket";

/** An ingredient line that isn't bought: "Wraps if you want", "chilli flakes (optional)". */
const OPTIONAL = /\boptional\b|\bif you (?:want|like)\b/i;

/** A Pinned Product's kind: decides the rounding, and whether it is bought at all. */
export type Kind = "Fresh" | "Cupboard Ingredient" | "Always in House";
const KINDS: Kind[] = ["Fresh", "Cupboard Ingredient", "Always in House"];

/** One ingredient line of a Recipe on the Week Menu, as the fill-basket skill matched it. */
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
};

/** What `food basket fill` reads: the skill's matches, and the Cupboard Ingredients at home (webshop ids). */
export type BasketInput = { lines: Match[]; haveAtHome?: number[] };

/** The skill's list doesn't fit the Week Menu; printed without a stack trace. */
export class BasketInputError extends Error {}

/** What the Week Menu needs from AH, before looking at Mijn lijst. */
export type BasketPlan = {
  weekStart: string;
  /** The Week Menu note. */
  file: string;
  /** Whole packs per product, and the ingredients and Staples each covers. */
  products: { id: number; quantity: number; covers: string[] }[];
  /** Ingredients with no AH product, as free-text notes for Mijn lijst: "lime leaves (25)". */
  notes: string[];
  /** Optional lines, not bought: "Tacos: 8 tortilla wraps (optional)". */
  optional: string[];
  /** The Cupboard Ingredients left out because they are at home, by ingredient name. */
  haveAtHome: string[];
};

/**
 * Works out what the Locked Week Menu starting on `weekStart` needs from AH: each ingredient line as written,
 * ×2 on a Double cook day, nothing for a Double 2nd day, the Free Day or optional lines; plus the Staples;
 * summed per product, then rounded to whole packs; without Always in House items and what is at home.
 */
export async function planBasket(vault: string, weekStart: string, input: BasketInput): Promise<BasketPlan> {
  const note = (await readWeekMenuNotes(vault)).find((n) => weekStartOf(n) === weekStart);
  if (!note) throw new VaultError(`No Week Menu for the week of ${weekStart} in "Week menus"`);
  const menu = parseWeekMenu(note);

  const times = new Map<string, number>();
  for (const day of menu.days) {
    if (day.double === "second") continue;
    for (const name of [day.dinner, day.side]) {
      if (name) times.set(name, (times.get(name) ?? 0) + (day.double === "cook" ? 2 : 1));
    }
  }

  const problems: string[] = [];
  const used = new Set<Match>();
  const products = new Map<number, { total: number; fresh: boolean; covers: string[] }>();
  const product = (id: number) => products.get(id) ?? products.set(id, { total: 0, fresh: true, covers: [] }).get(id)!;
  const notes = new Map<string, { name: string; amounts: Map<string, number> }>();
  const optional = new Set<string>();
  const haveAtHome = new Set<string>();

  for (const [recipeName, count] of times) {
    const recipeNote = await findRecipeNote(vault, recipeName);
    if (!recipeNote) throw new VaultError(`No Recipe "${recipeName}" in Meals or Sides`);
    for (const ingredient of parseRecipe(recipeName, recipeNote).ingredients.flatMap((group) => group.items)) {
      const line = ingredient.amount ? `${ingredient.amount.text} ${ingredient.text}` : ingredient.text;
      const name = ingredientName(ingredient.text);
      const match = input.lines.find((m) => sameName(m.recipe, recipeName) && sameLine(m.line, line));
      if (match) used.add(match);
      if (OPTIONAL.test(line)) {
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
        const note = notes.get(name.toLowerCase()) ?? { name, amounts: new Map<string, number>() };
        if (ingredient.amount) {
          const unit = ingredient.amount.unit;
          note.amounts.set(unit, (note.amounts.get(unit) ?? 0) + ingredient.amount.quantity * count);
        }
        notes.set(name.toLowerCase(), note);
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
      addOnce(sum.covers, name);
    }
  }
  for (const match of input.lines) {
    if (!used.has(match)) problems.push(`${match.recipe}: "${match.line}" is not an ingredient line of a Recipe bought this week`);
  }
  if (problems.length) throw new BasketInputError(`The matches don't fit the Week Menu of ${weekStart}:\n${problems.map((p) => `- ${p}`).join("\n")}`);

  for (const staple of await staplesThisWeek(vault, note)) {
    const sum = product(staple.product);
    sum.total += staple.quantity;
    addOnce(sum.covers, `${staple.name} (Staple)`);
  }

  return {
    weekStart,
    file: note.file,
    products: [...products].map(([id, { total, fresh, covers }]) => ({ id, quantity: wholePacks(total, fresh), covers })),
    notes: [...notes.values()].map(({ name, amounts }) =>
      amounts.size ? `${name} (${[...amounts].map(([unit, q]) => [number(q), unit].filter(Boolean).join(" ")).join(" + ")})` : name,
    ),
    optional: [...optional],
    haveAtHome: [...haveAtHome],
  };
}

type Staple = { name: string; product: number; quantity: number; kind: "Weekly" | "Ask" };

/**
 * The Staples this week's Basket gets: the Weekly Staples, changed by the Week Menu's `## Staples this week`:
 * "- Skip: milk ×1" (one fewer; without ×n none at all), "- Extra: eggs ×1" (more; ×1 without ×n),
 * "- Ask Staples: peanut butter, oats ×2" (chosen Ask Staples; their usual quantity without ×n).
 */
export async function staplesThisWeek(vault: string, weekMenu: Note): Promise<Staple[]> {
  const staples = await readStaples(vault);
  const chosen = new Map(staples.filter((s) => s.kind === "Weekly").map((s) => [s, s.quantity]));
  for (const line of section(weekMenu.body, "Staples this week")) {
    if (!line.trim()) continue;
    const item = line.match(/^\s*[-*]\s+(skip|extra|ask staples?)\s*:\s*(.+)$/i);
    if (!item) {
      throw new NoteError(weekMenu.file, `can't read "${line.trim()}" under Staples this week (expected "- Skip: …", "- Extra: …" or "- Ask Staples: …")`);
    }
    const change = item[1].toLowerCase();
    for (const part of item[2].split(",")) {
      const m = part.trim().match(/^(.+?)(?:\s*[×x]\s*(\d+))?$/);
      const name = m?.[1].trim() ?? "";
      const staple = staples.find((s) => sameName(s.name, name));
      if (!staple) throw new NoteError(weekMenu.file, `"${name}" under Staples this week is not in ${STAPLES_NOTE}`);
      const count = m?.[2] === undefined ? undefined : Number(m[2]);
      const now = chosen.get(staple) ?? 0;
      if (change === "skip") chosen.set(staple, count === undefined ? 0 : Math.max(0, now - count));
      else if (change === "extra") chosen.set(staple, now + (count ?? 1));
      else chosen.set(staple, count ?? staple.quantity);
    }
  }
  return [...chosen].filter(([, quantity]) => quantity > 0).map(([staple, quantity]) => ({ ...staple, quantity }));
}

/** The Staples note's table: Staple | AH product (name, webshop id in brackets) | Quantity (packs) | Kind (Weekly or Ask). */
async function readStaples(vault: string): Promise<Staple[]> {
  let note: Note;
  try {
    note = await readNote(path.join(vault, STAPLES_NOTE));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
  return (tableRows(note, "staple") ?? []).map((row) => {
    const product = row["ah product"]?.match(/\((\d+)\)\s*$/);
    const quantity = Number(row.quantity);
    const kind = row.kind?.toLowerCase();
    if (!product) throw new NoteError(note.file, `the Staple "${row.staple}" has no AH product id in brackets`);
    if (!row.quantity || !Number.isFinite(quantity) || quantity < 0) throw new NoteError(note.file, `the Staple "${row.staple}" has no quantity`);
    if (kind !== "weekly" && kind !== "ask") throw new NoteError(note.file, `the Staple "${row.staple}" is neither Weekly nor Ask`);
    return { name: row.staple, product: Number(product[1]), quantity, kind: kind === "weekly" ? "Weekly" : "Ask" };
  });
}

/** The lines under a note's `## <heading>`, up to the next `## ` heading. */
function section(body: string, heading: string): string[] {
  const lines = body.split("\n");
  const start = lines.findIndex((l) => sameName(l.trim(), `## ${heading}`));
  if (start < 0) return [];
  const end = lines.findIndex((l, i) => i > start && /^##\s/.test(l));
  return lines.slice(start + 1, end < 0 ? undefined : end);
}

/** Rounds up to whole packs, but a Fresh item rounds down when the total is no more than 10% over a whole pack. */
function wholePacks(total: number, fresh: boolean): number {
  const epsilon = 1e-9;
  const whole = Math.floor(total + epsilon);
  if (fresh && whole >= 1 && total - whole <= 0.1 + epsilon) return whole;
  return Math.ceil(total - epsilon);
}

/** An ingredient line's ingredient without its preparation: "onion, finely chopped" → "onion". */
function ingredientName(text: string): string {
  return text.split(",")[0].trim();
}

function addOnce(list: string[], item: string): void {
  if (!list.some((i) => sameName(i, item))) list.push(item);
}

function sameName(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

/** Ingredient lines compare without italics, case or spacing: "*300 g* Red split lentils" is "300g red split lentils". */
function sameLine(a: string, b: string): boolean {
  const normal = (s: string) => s.replace(/^\s*[-*]\s+/, "").replace(/[*_]/g, "").replace(/\s+/g, "").toLowerCase();
  return normal(a) === normal(b);
}

/** A quantity for people: 2, 2.5, 0.33. */
function number(q: number): string {
  return String(Number(q.toFixed(2)));
}

/** What `food basket fill` did. */
export type BasketResult = {
  plan: BasketPlan;
  /** The plan's products, with what Mijn lijst had before (`before`, 0 when new) and AH's title and pack price. */
  products: { id: number; title: string; quantity: number; before: number; price: number | null; covers: string[] }[];
  /** Mijn lijst's estimated total after adding, from the prices AH gives. */
  total: number;
};

/** Adds the plan to Mijn lijst: products merge into lines already there, unmatched items go in as free-text notes. Never removes anything. */
export async function fillBasket(plan: BasketPlan, gateway: AhGateway): Promise<BasketResult> {
  const before = await gateway.readBasket();
  const after = await gateway.addToBasket({
    products: plan.products.map(({ id, quantity }) => ({ id, quantity })),
    notes: plan.notes.map((description) => ({ description, quantity: 1 })),
  });
  return {
    plan,
    products: plan.products.map(({ id, quantity, covers }) => {
      const inList = after.products.find((p) => p.id === id);
      return {
        id,
        quantity,
        covers,
        title: inList?.title ?? `product ${id}`,
        price: inList?.price ?? null,
        before: before.products.find((p) => p.id === id)?.quantity ?? 0,
      };
    }),
    total: after.products.reduce((sum, p) => sum + (p.price ?? 0) * p.quantity, 0),
  };
}

/**
 * Records what was added in the Week Menu's `## Basket` section, replacing an earlier one:
 * "- <AH title> (id <webshop id>) ×<packs>: <ingredients covered>", "- Note: <free-text note>", "Have at home: …".
 */
export async function writeBasketSection(result: BasketResult): Promise<void> {
  const { plan } = result;
  const lines = [
    `## ${BASKET_HEADING}`,
    ...result.products.map((p) => `- ${p.title} (id ${p.id}) ×${p.quantity}: ${p.covers.join(", ")}`),
    ...plan.notes.map((note) => `- Note: ${note}`),
    `Have at home: ${plan.haveAtHome.join(", ") || "none"}`,
  ];
  const text = (await readFile(plan.file, "utf8")).replace(/\r\n/g, "\n");
  const all = text.split("\n");
  const start = all.findIndex((l) => sameName(l.trim(), `## ${BASKET_HEADING}`));
  if (start < 0) {
    await writeFile(plan.file, `${text.trimEnd()}\n\n${lines.join("\n")}\n`);
    return;
  }
  const end = all.findIndex((l, i) => i > start && /^##\s/.test(l));
  const rest = end < 0 ? [] : ["", ...all.slice(end)];
  await writeFile(plan.file, `${[...all.slice(0, start), ...lines, ...rest].join("\n").trimEnd()}\n`);
}

/** The report for the person filling the Basket; it ends with the checkout reminder. */
export function formatReport(result: BasketResult): string {
  const { plan } = result;
  const euro = (amount: number) => `€${amount.toFixed(2)}`;
  const group = (heading: string, items: string[]) =>
    items.length ? `${heading}:\n${items.map((i) => `- ${i}\n`).join("")}` : `${heading}: none\n`;
  const added = result.products.filter((p) => p.before === 0);
  const alreadyThere = result.products.filter((p) => p.before > 0);
  return [
    group("Added to Mijn lijst", added.map((p) => `${p.quantity} × ${p.title}${p.price === null ? "" : ` (${euro(p.price)} each)`}`)),
    group("Already in Mijn lijst, added on top", alreadyThere.map((p) => `${p.title}: ${p.before} + ${p.quantity} = ${p.before + p.quantity}`)),
    group("Unmatched, added as notes", plan.notes),
    group("Optional, not added", plan.optional),
    `Have at home: ${plan.haveAtHome.join(", ") || "none"}\n`,
    `Estimated total: ${euro(result.total)}\n`,
    "\nCheck out into the Saturday slot before Friday 12:00.\n",
  ].join("");
}

/** Reads the skill's list from a JSON file. */
export async function readBasketInput(file: string): Promise<BasketInput> {
  const text = await readFile(path.resolve(file), "utf8");
  let input: BasketInput;
  try {
    input = JSON.parse(text);
  } catch (error) {
    throw new BasketInputError(`${file} is not JSON: ${(error as Error).message}`);
  }
  if (!Array.isArray(input?.lines)) throw new BasketInputError(`${file}: expected {"lines": [...], "haveAtHome": [...]}`);
  return input;
}
