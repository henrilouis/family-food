import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { AhError, AhLoginError, type AhGateway } from "./adapters/ah/gateway.ts";
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
  /** The AH product's title, for the shopping list when AH can't be read ("AH Rode linzen 500 g"). */
  title?: string;
};

/** What `food basket fill` reads: the skill's matches, and the Cupboard Ingredients at home (webshop ids). */
export type BasketInput = { lines: Match[]; haveAtHome?: number[] };

/** The skill's list doesn't fit the Week Menu; printed without a stack trace. */
export class BasketInputError extends Error {}

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
  /** Ingredients with no AH product, as free-text notes for Mijn lijst: "lime leaves (25)". */
  notes: string[];
  /** Optional lines, not bought: "Tacos: 8 tortilla wraps (optional)". */
  optional: string[];
  /** The Cupboard Ingredients left out because they are at home, by ingredient name. */
  haveAtHome: string[];
  /** What an earlier run recorded in the Week Menu's `## Basket` section; empty when there is none. */
  recorded: BasketRecord;
};

/** The products (with AH's title) and free-text notes an earlier run added for the week, from its `## Basket` section. */
export type BasketRecord = { products: { id: number; title: string; quantity: number }[]; notes: string[] };

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
  type Sum = { total: number; fresh: boolean; recipe: boolean; covers: string[]; title: string | null };
  const products = new Map<number, Sum>();
  const product = (id: number) =>
    products.get(id) ?? products.set(id, { total: 0, fresh: true, recipe: false, covers: [], title: null }).get(id)!;
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
      sum.recipe = true;
      sum.title ??= match.title ?? null;
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
    sum.title ??= staple.title;
    addOnce(sum.covers, `${staple.name} (Staple)`);
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
    notes: [...notes.values()].map(({ name, amounts }) =>
      amounts.size ? `${name} (${[...amounts].map(([unit, q]) => [number(q), unit].filter(Boolean).join(" ")).join(" + ")})` : name,
    ),
    optional: [...optional],
    haveAtHome: [...haveAtHome],
    recorded: basketRecord(note),
  };
}

type Staple = { name: string; product: number; title: string; quantity: number; kind: "Weekly" | "Ask" };

/**
 * The Staples this week's Basket gets: the Weekly Staples, changed by the Week Menu's `## Staples this week`:
 * "- Skip: milk ×1" (one fewer; without ×n none at all), "- Extra: eggs ×1" (more; ×1 without ×n),
 * "- Ask Staples: peanut butter, oats ×2" (chosen Ask Staples; their usual quantity without ×n).
 */
async function staplesThisWeek(vault: string, weekMenu: Note): Promise<Staple[]> {
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
    const title = row["ah product"].replace(/\s*\(\d+\)\s*$/, "");
    return { name: row.staple, product: Number(product[1]), title, quantity, kind: kind === "weekly" ? "Weekly" : "Ask" };
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

/** Reads the `## Basket` section's product lines ("- <title> (id <id>) ×<packs>: …") and notes ("- Note: …"). */
function basketRecord(weekMenu: Note): BasketRecord {
  const record: BasketRecord = { products: [], notes: [] };
  for (const line of section(weekMenu.body, BASKET_HEADING)) {
    const product = line.match(/^- (.+) \(id (\d+)\) ×(\d+): (.*)$/);
    const note = line.match(/^- Note: (.*)$/);
    if (product) record.products.push({ id: Number(product[2]), title: product[1], quantity: Number(product[3]) });
    else if (note) record.notes.push(note[1]);
  }
  return record;
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

/**
 * What the Week Menu needs beyond what an earlier run recorded in `## Basket` (`add`, `addNotes`; quantities are
 * the difference), and what that run added that is no longer needed (`remove`, `removeNotes`).
 */
export type BasketChange = {
  add: PlannedProduct[];
  addNotes: string[];
  remove: { id: number; title: string; quantity: number }[];
  removeNotes: string[];
};

function changeSince(plan: BasketPlan): BasketChange {
  const { recorded } = plan;
  const recordedQuantity = (id: number) => recorded.products.find((p) => p.id === id)?.quantity ?? 0;
  const plannedQuantity = (id: number) => plan.products.find((p) => p.id === id)?.quantity ?? 0;
  return {
    add: plan.products.map((p) => ({ ...p, quantity: p.quantity - recordedQuantity(p.id) })).filter((p) => p.quantity > 0),
    addNotes: plan.notes.filter((note) => !recorded.notes.includes(note)),
    remove: recorded.products.map((p) => ({ ...p, quantity: p.quantity - plannedQuantity(p.id) })).filter((p) => p.quantity > 0),
    removeNotes: recorded.notes.filter((note) => !plan.notes.includes(note)),
  };
}

/** A product of the plan once Mijn lijst is filled: what this run added, what Mijn lijst had before (0 when new), AH's title and pack price. */
export type FilledProduct = PlannedProduct & { title: string; added: number; before: number; price: number | null };

/** What `food basket fill` did. */
export type BasketOutcome =
  /**
   * Mijn lijst is filled. `change` only holds removals still possible: what is still in Mijn lijst.
   * `total` is Mijn lijst's estimated total after adding, from the prices AH gives.
   */
  | { kind: "filled"; plan: BasketPlan; change: BasketChange; products: FilledProduct[]; total: number }
  /** The coming Saturday's order is placed: nothing was written to AH. */
  | { kind: "order placed"; plan: BasketPlan; change: BasketChange; order: { id: number; status: string } }
  /** AH refused the login, also after logging in again: nothing was written to AH. */
  | { kind: "login failed"; plan: BasketPlan; change: BasketChange; error: string };

/**
 * Adds to Mijn lijst what the plan needs beyond what an earlier run recorded: products merge into lines already
 * there, unmatched items go in as free-text notes. Never removes anything; what is no longer needed is only listed.
 * Writes nothing once the coming Saturday's order is placed. When AH refuses the login, `log`s a prompt and runs
 * the browser login once; if AH still refuses, writes nothing.
 */
export async function fillBasket(plan: BasketPlan, gateway: AhGateway, log: (line: string) => void): Promise<BasketOutcome> {
  const change = changeSince(plan);
  try {
    return await fillWith(gateway, plan, change);
  } catch (error) {
    if (!(error instanceof AhLoginError)) throw error;
  }
  log("AH login expired: log in again in the browser window that opens.");
  try {
    await gateway.login();
  } catch (error) {
    if (!(error instanceof AhError)) throw error;
    return { kind: "login failed", plan, change, error: error.message };
  }
  try {
    return await fillWith(gateway, plan, change);
  } catch (error) {
    if (!(error instanceof AhLoginError)) throw error;
    return { kind: "login failed", plan, change, error: error.message };
  }
}

async function fillWith(gateway: AhGateway, plan: BasketPlan, change: BasketChange): Promise<BasketOutcome> {
  const order = await gateway.placedOrder(plan.weekStart);
  if (order) return { kind: "order placed", plan, change, order };

  const before = await gateway.readBasket();
  const additions = {
    products: change.add.map(({ id, quantity }) => ({ id, quantity })),
    notes: change.addNotes.map((description) => ({ description, quantity: 1 })),
  };
  const after = additions.products.length || additions.notes.length ? await gateway.addToBasket(additions) : before;
  const inList = (id: number) => before.products.find((p) => p.id === id)?.quantity ?? 0;
  return {
    kind: "filled",
    plan,
    change: {
      ...change,
      remove: change.remove.map((p) => ({ ...p, quantity: Math.min(p.quantity, inList(p.id)) })).filter((p) => p.quantity > 0),
      removeNotes: change.removeNotes.filter((note) => before.notes.some((n) => n.description === note)),
    },
    products: plan.products.map((p) => ({
      ...p,
      title: after.products.find((line) => line.id === p.id)?.title ?? titleOf(plan, p),
      price: after.products.find((line) => line.id === p.id)?.price ?? null,
      added: change.add.find((a) => a.id === p.id)?.quantity ?? 0,
      before: inList(p.id),
    })),
    total: after.products.reduce((sum, p) => sum + (p.price ?? 0) * p.quantity, 0),
  };
}

/** A product's title without AH: from an earlier run's record, the skill's list or Staples.md. */
function titleOf(plan: BasketPlan, product: PlannedProduct): string {
  return plan.recorded.products.find((p) => p.id === product.id)?.title ?? product.title ?? `product ${product.id}`;
}

/**
 * Records what Mijn lijst got for the week in the Week Menu's `## Basket` section, replacing an earlier one:
 * "- <AH title> (id <webshop id>) ×<packs>: <ingredients covered>", "- Note: <free-text note>", "Have at home: …".
 * Only once Mijn lijst is filled; otherwise the note is left as it is.
 */
export async function writeBasketSection(outcome: BasketOutcome): Promise<void> {
  if (outcome.kind !== "filled") return;
  const { plan } = outcome;
  await replaceSection(plan.file, [
    `## ${BASKET_HEADING}`,
    ...outcome.products.map((p) => `- ${p.title} (id ${p.id}) ×${p.quantity}: ${p.covers.join(", ")}`),
    ...plan.notes.map((note) => `- Note: ${note}`),
    `Have at home: ${plan.haveAtHome.join(", ") || "none"}`,
  ]);
}

/** Puts `lines` (starting with the `## Basket` heading) in place of the note's `## Basket` section, or at its end. */
async function replaceSection(file: string, lines: string[]): Promise<void> {
  const text = (await readFile(file, "utf8")).replace(/\r\n/g, "\n");
  const all = text.split("\n");
  const start = all.findIndex((l) => sameName(l.trim(), `## ${BASKET_HEADING}`));
  if (start < 0) {
    await writeFile(file, `${text.trimEnd()}\n\n${lines.join("\n")}\n`);
    return;
  }
  const end = all.findIndex((l, i) => i > start && /^##\s/.test(l));
  const rest = end < 0 ? [] : ["", ...all.slice(end)];
  await writeFile(file, `${[...all.slice(0, start), ...lines, ...rest].join("\n").trimEnd()}\n`);
}

/** The exit code for `food basket fill`: 2 when nothing was written to AH and a human must act on the output. */
export function exitCode(outcome: BasketOutcome): number {
  if (outcome.kind === "filled") return 0;
  if (outcome.kind === "order placed" && filledBefore(outcome.plan) && unchanged(outcome.change)) return 0;
  return 2;
}

/** An earlier run filled Mijn lijst for the week (its `## Basket` section has products or notes). */
function filledBefore(plan: BasketPlan): boolean {
  return plan.recorded.products.length > 0 || plan.recorded.notes.length > 0;
}

function unchanged(change: BasketChange): boolean {
  return !change.add.length && !change.addNotes.length && !change.remove.length && !change.removeNotes.length;
}

/** What to tell the person filling the Basket. */
export function formatReport(outcome: BasketOutcome): string {
  switch (outcome.kind) {
    case "filled":
      return formatFilled(outcome);
    case "order placed": {
      const { plan, change } = outcome;
      const placed = `The order for ${saturday(plan.weekStart)} is already placed`;
      if (!filledBefore(plan)) {
        return [`${placed}, so nothing was added to Mijn lijst.\n`, formatLinks(change), formatShoppingList(plan, change)].join("");
      }
      if (unchanged(change)) return `${placed} and has what the Week Menu needs: nothing to change.\n`;
      return [
        `${placed}, so nothing was changed in AH.\n`,
        "The Week Menu changed since the Basket was filled. Change the order in Mijn bestellingen:\n",
        group("Add to the order", change.add.map((p) => `${p.quantity} × ${titleOf(plan, p)}: ${p.covers.join(", ")}`)),
        group("Remove from the order", change.remove.map((p) => `${p.quantity} × ${p.title}`)),
        change.addNotes.length ? group("Unmatched, buy these yourself", change.addNotes) : "",
        change.removeNotes.length ? group("Unmatched, no longer needed", change.removeNotes) : "",
      ].join("");
    }
    case "login failed":
      return [
        "The AH login failed again, so nothing was added to Mijn lijst.\n",
        formatLinks(outcome.change),
        formatShoppingList(outcome.plan, outcome.change),
      ].join("");
  }
}

function formatFilled({ plan, change, products, total }: Extract<BasketOutcome, { kind: "filled" }>): string {
  const added = products.filter((p) => p.added > 0 && p.before === 0);
  const alreadyThere = products.filter((p) => p.added > 0 && p.before > 0);
  const unchanged = [
    ...products.filter((p) => p.added === 0).map((p) => `${p.quantity} × ${p.title}`),
    ...plan.notes.filter((note) => !change.addNotes.includes(note)).map((note) => `Note: ${note}`),
  ];
  return [
    group("Added to Mijn lijst", added.map((p) => `${p.added} × ${p.title}${p.price === null ? "" : ` (${euro(p.price)} each)`}`)),
    group("Already in Mijn lijst, added on top", alreadyThere.map((p) => `${p.title}: ${p.before} + ${p.added} = ${p.before + p.added}`)),
    unchanged.length ? group("Added on an earlier run, unchanged", unchanged) : "",
    group("No longer needed, remove these from Mijn lijst by hand", [
      ...change.remove.map((p) => `${p.quantity} × ${p.title}`),
      ...change.removeNotes.map((note) => `Note: ${note}`),
    ]),
    group("Unmatched, added as notes", change.addNotes),
    group("Optional, not added", plan.optional),
    `Have at home: ${plan.haveAtHome.join(", ") || "none"}\n`,
    `Estimated total: ${euro(total)}\n`,
    "\nCheck out into the Saturday slot before Friday 12:00.\n",
  ].join("");
}

/** AH's own add-multiple links for the products to add, at most this many products per link (AH drops the rest). */
const LINK_SIZE = 25;

function formatLinks(change: BasketChange): string {
  const links: string[] = [];
  for (let i = 0; i < change.add.length; i += LINK_SIZE) {
    const products = change.add.slice(i, i + LINK_SIZE);
    links.push(`https://www.ah.nl/mijnlijst/add-multiple?${products.map((p) => `p=${p.id}:${p.quantity}`).join("&")}`);
  }
  return [
    "Open each link in a browser where you are logged in to ah.nl: it adds its products to Mijn lijst\n",
    "(once an order is placed, that is the order). Or shop from the list below.\n",
    group("Links", links),
    "\n",
  ].join("");
}

/** The products to add and the unmatched items, grouped for shopping by hand. */
function formatShoppingList(plan: BasketPlan, change: BasketChange): string {
  return [
    "Shopping list:\n",
    shoppingList(plan, change).join("\n") + "\n",
    group("Optional, not added", plan.optional),
    `Have at home: ${plan.haveAtHome.join(", ") || "none"}\n`,
  ].join("");
}

/** "Fresh:", "Cupboard Ingredients:", "Staples:" and "Unmatched:" with their items; empty groups left out. */
function shoppingList(plan: BasketPlan, change: BasketChange): string[] {
  const groups: ShoppingGroup[] = ["Fresh", "Cupboard Ingredients", "Staples"];
  const item = (p: PlannedProduct) => {
    const title = plan.recorded.products.find((r) => r.id === p.id)?.title ?? p.title;
    return title ? `${p.quantity} × ${title}: ${p.covers.join(", ")}` : `${p.quantity} × ${p.covers.join(", ")}`;
  };
  return [
    ...groups.map((name) => [name, change.add.filter((p) => p.group === name).map(item)] as const),
    ["Unmatched", change.addNotes] as const,
  ]
    .filter(([, items]) => items.length)
    .flatMap(([name, items]) => [`${name}:`, ...items.map((i) => `- ${i}`)]);
}

/** "Saturday 28 Nov" for a Week Menu's `week_start`. */
function saturday(weekStart: string): string {
  const options = { weekday: "long", day: "numeric", month: "short", timeZone: "UTC" } as const;
  return new Date(`${weekStart}T00:00Z`).toLocaleDateString("en-GB", options);
}

function euro(amount: number): string {
  return `€${amount.toFixed(2)}`;
}

/** A report group: "<heading>:" and one "- " line per item, or "<heading>: none". */
function group(heading: string, items: string[]): string {
  return items.length ? `${heading}:\n${items.map((i) => `- ${i}\n`).join("")}` : `${heading}: none\n`;
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
