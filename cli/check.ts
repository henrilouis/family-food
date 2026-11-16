import { readFile } from "node:fs/promises";
import path from "node:path";
import type { MenuDay } from "../bundle/bundle.ts";
import { parseAmount } from "./amount.ts";
import { isPublished } from "./build-bundle.ts";
import { findRecipeNote, NoteError, parseWeekMenu, readNotes, readWeekMenuNotes, RECIPE_FOLDERS, weekStartOf, type Note } from "./vault.ts";

/** A format problem in one Recipe Vault note. `file` is relative to the vault, e.g. "Meals/Dahl.md". */
export type Problem = { file: string; message: string };

/** Errors block Publish; warnings are only reported. */
export type VaultCheck = { errors: Problem[]; warnings: Problem[] };

/**
 * Checks the whole Recipe Vault or, with `publishing`, only the Week Menus a Publish at that time
 * would send and the Recipes and Sides they link to.
 */
export async function checkVault(vault: string, { publishing }: { publishing?: Date } = {}): Promise<VaultCheck> {
  const check: VaultCheck = { errors: [], warnings: [] };
  const relative = (note: Note) => path.relative(vault, note.file);
  const error = (note: Note, message: string) => check.errors.push({ file: relative(note), message });
  const warning = (note: Note, message: string) => check.warnings.push({ file: relative(note), message });

  const weekMenus = (await readWeekMenuNotes(vault)).filter((note) => !publishing || isPublished(weekStartOf(note), publishing));
  const recipes = new Map<string, Note>();
  for (const note of weekMenus.sort((a, b) => a.file.localeCompare(b.file))) {
    let days: MenuDay[];
    try {
      days = parseWeekMenu(note).days;
    } catch (e) {
      if (!(e instanceof NoteError)) throw e;
      error(note, e.problem);
      continue;
    }
    for (const day of days) {
      for (const name of [day.dinner, day.side]) {
        if (name === null) continue;
        const recipe = await findRecipeNote(vault, name);
        if (!recipe) {
          error(note, `${dayLabel(day.date)} links [[${name}]], which isn't in ${RECIPE_FOLDERS.join(" or ")}`);
          continue;
        }
        recipes.set(recipe.file, recipe);
        if (name === day.dinner && day.double === "cook" && recipe.properties.double !== true) {
          error(note, `${dayLabel(day.date)} is a Double cook day, but [[${name}]] isn't double: true`);
        }
      }
    }
  }

  if (!publishing) {
    for (const folder of RECIPE_NOTE_FOLDERS) {
      for (const note of await readNotes(path.join(vault, folder))) recipes.set(note.file, note);
    }
  }
  const lists = await readFixedLists();
  for (const note of [...recipes.values()].sort((a, b) => a.file.localeCompare(b.file))) {
    for (const message of amountProblems(note)) error(note, message);
    if (path.basename(path.dirname(note.file)) === "Meals") {
      for (const message of mealPropertyProblems(note, lists)) warning(note, message);
    }
  }
  return check;
}

const MEAL_PROPERTIES = ["serves", "active_minutes", "total_minutes", "cuisine", "base", "double", "source", "sides", "novel", "reviewed"];

/** The doc in this repo that holds the fixed `cuisine` and `base` lists. */
export const MEAL_PROPERTIES_DOC = path.resolve(import.meta.dirname, "../docs/meal-properties.md");

type FixedLists = { cuisine: string[]; base: string[] };

/** The `- ` items under the doc's "## `cuisine` values" and "## `base` values" headings. */
async function readFixedLists(): Promise<FixedLists> {
  const sections = (await readFile(MEAL_PROPERTIES_DOC, "utf8")).split(/^## /m);
  const listed = (property: string) => {
    const section = sections.find((s) => s.startsWith(`\`${property}\``));
    if (!section) throw new Error(`${MEAL_PROPERTIES_DOC} has no "## \`${property}\` values" section`);
    return [...section.matchAll(/^- (.+)$/gm)].map((m) => m[1].trim());
  };
  return { cuisine: listed("cuisine"), base: listed("base") };
}

function mealPropertyProblems(note: Note, lists: FixedLists): string[] {
  const problems: string[] = [];
  for (const key of Object.keys(note.properties)) {
    if (!MEAL_PROPERTIES.includes(key)) problems.push(`the property "${key}" isn't a Meal property (${MEAL_PROPERTIES.join(", ")})`);
  }
  const { cuisine, base, serves } = note.properties;
  if (cuisine === undefined || cuisine === null || cuisine === "") problems.push("no cuisine");
  else if (!lists.cuisine.includes(String(cuisine))) {
    problems.push(`cuisine "${cuisine}" isn't in the fixed list (${lists.cuisine.join(", ")})`);
  }
  for (const value of base === undefined || base === null ? [] : [base].flat()) {
    if (!lists.base.includes(String(value))) problems.push(`base "${value}" isn't in the fixed list (${lists.base.join(", ")})`);
  }
  if (typeof serves === "number" && serves > 6) {
    problems.push(`serves ${serves}, more than 6: is it still written for two dinners?`);
  }
  return problems;
}

/** Every folder that holds Recipes, including Baking, which no Week Menu links to. */
const RECIPE_NOTE_FOLDERS = [...RECIPE_FOLDERS, "Baking"];

const ITALIC = /(?<!\*)\*(?!\*)([^*\n]+?)\*(?!\*)/g;

/** Italic amounts that don't parse: the leading one of each ingredient line, and every one in a Method step. */
function amountProblems(note: Note): string[] {
  const problems: string[] = [];
  let section: string | null = null;
  for (const line of note.body.split("\n")) {
    let m: RegExpMatchArray | null;
    if ((m = line.match(/^## (.+)/))) section = m[1].trim().toLowerCase();
    else if (section === "ingredients" && (m = line.match(/^\s*[-*] \*([^*]+)\*/))) {
      if (!parseAmount(m[1])) problems.push(`the ingredient amount "${m[1]}" doesn't start with a number`);
    } else if (section === "method" && (m = line.match(/^\s*(\d+)\.\s+(.*)/))) {
      for (const [, amount] of m[2].matchAll(ITALIC)) {
        if (!parseAmount(amount)) problems.push(`step ${m[1]}: the amount "${amount}" doesn't start with a number`);
      }
    }
  }
  return problems;
}

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "2026-11-21" → "Sat 21 Nov", as a Week Menu's Day column writes it. */
function dayLabel(date: string): string {
  const d = new Date(`${date}T00:00:00Z`);
  return `${WEEKDAYS[d.getUTCDay()]} ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`;
}

/** The check as text for a person: one line per problem, then a count. */
export function formatCheck({ errors, warnings }: VaultCheck): string {
  const lines = [
    ...errors.map((p) => `error    ${p.file}: ${p.message}`),
    ...warnings.map((p) => `warning  ${p.file}: ${p.message}`),
  ];
  lines.push(`${plural(errors.length, "error")}, ${plural(warnings.length, "warning")}`);
  return lines.join("\n") + "\n";
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;
