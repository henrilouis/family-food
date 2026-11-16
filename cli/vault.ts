import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { parse as parseYaml } from "yaml";
import type { Ingredient, IngredientGroup, MenuDay, Recipe, WeekMenu } from "../bundle/bundle.ts";
import { addDays } from "../bundle/dates.ts";
import { parseRecipeAmount } from "./amount.ts";
import { ingredientWords, markStep } from "./step.ts";

/** The vault folder of the Week Menu notes. */
export const WEEK_MENUS = "Week menus";

/** A problem with the Recipe Vault's contents, reported to the user without a stack trace. */
export class VaultError extends Error {}

/** A problem in one note, which `food vault check` can report next to the others. */
export class NoteError extends VaultError {
  readonly file: string;
  readonly problem: string;
  constructor(file: string, problem: string) {
    super(`${file}: ${problem}`);
    this.file = file;
    this.problem = problem;
  }
}

/** A Recipe Vault note: its file name, properties and markdown body. */
export type Note = { file: string; properties: Record<string, unknown>; body: string };

export async function readNote(file: string): Promise<Note> {
  const text = (await readFile(file, "utf8")).replace(/\r\n/g, "\n");
  const match = text.match(/^---\n([\s\S]*?)\n---\n?/);
  if (!match) return { file, properties: {}, body: text };
  return { file, properties: parseYaml(match[1]) ?? {}, body: text.slice(match[0].length) };
}

/** Every Week Menu note in the vault that has a `week_start`, oldest first. */
export async function readWeekMenus(vault: string): Promise<WeekMenu[]> {
  return (await readWeekMenuNotes(vault)).map(parseWeekMenu).sort((a, b) => a.weekStart.localeCompare(b.weekStart));
}

/** Every Week Menu note in the vault that has a `week_start`, unparsed. */
export async function readWeekMenuNotes(vault: string): Promise<Note[]> {
  const notes = await readNotes(path.join(vault, WEEK_MENUS));
  return notes.filter((note) => note.properties.week_start);
}

/** A Week Menu note's `week_start` as YYYY-MM-DD. */
export function weekStartOf(note: Note): string {
  const start = note.properties.week_start;
  return start instanceof Date ? start.toISOString().slice(0, 10) : String(start);
}

/** Every note in a vault folder (not its subfolders); none if the folder doesn't exist. */
export async function readNotes(dir: string): Promise<Note[]> {
  let files: string[];
  try {
    files = (await readdir(dir)).filter((f) => f.endsWith(".md")).sort();
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
  return Promise.all(files.map((f) => readNote(path.join(dir, f))));
}

export function parseWeekMenu(note: Note): WeekMenu {
  const weekStart = weekStartOf(note);
  const days = dayTable(note).map((row): MenuDay => {
    const cell = row.dinner ?? "";
    const freeDay = /^free day$/i.test(cell);
    const dinner = freeDay ? null : linkTarget(cell);
    const unlinkedDinner = freeDay || dinner ? "" : plainText(cell);
    const noteCell = row.note ?? "";
    return {
      date: addDays(weekStart, weekdayOffset(note.file, row.day ?? "")),
      dinner,
      ...(unlinkedDinner ? { unlinkedDinner } : {}),
      side: dinner || unlinkedDinner ? linkTarget(row.side ?? "") : null,
      novel: /\bnovel\b/i.test(noteCell),
      double: /double:\s*cook/i.test(noteCell) ? "cook" : /double:\s*2nd day/i.test(noteCell) ? "second" : null,
    };
  });
  return { weekStart, days: days.sort((a, b) => a.date.localeCompare(b.date)) };
}

const WEEK_DAYS = ["sat", "sun", "mon", "tue", "wed", "thu", "fri"];

/** Days from the Week Menu's Saturday to the weekday a Day cell starts with: "Mon 23 Nov" → 2. */
function weekdayOffset(file: string, day: string): number {
  const weekday = day.trim().toLowerCase().match(/^(sat|sun|mon|tue|wed|thu|fri)[a-z]*\b/);
  if (!weekday) throw new NoteError(file, `can't tell which weekday the Day "${day}" is`);
  return WEEK_DAYS.indexOf(weekday[1]);
}

/** The rows of the note's day table (Day | Dinner | Side | Note), keyed by lower-cased column name. */
function dayTable(note: Note): Record<string, string>[] {
  const rows = tableRows(note, "dinner");
  if (!rows) throw new NoteError(note.file, "no day table with a Dinner column");
  return rows;
}

/** The rows of the note's first table with a `column` column, keyed by lower-cased column name; null if there is none. */
export function tableRows(note: Note, column: string): Record<string, string>[] | null {
  const lines = note.body.split("\n").map((l) => l.trim());
  const cells = (line: string) => line.replace(/^\|/, "").replace(/\|$/, "").split("|").map((c) => c.trim());
  const headerAt = lines.findIndex((l) => l.startsWith("|") && new RegExp(`\\b${column}\\b`, "i").test(l));
  if (headerAt < 0) return null;
  const header = cells(lines[headerAt]).map((c) => c.toLowerCase());
  const rows: Record<string, string>[] = [];
  for (const line of lines.slice(headerAt + 1)) {
    if (!line.startsWith("|")) break;
    if (/^\|[\s:|-]+\|?$/.test(line)) continue;
    const values = cells(line);
    rows.push(Object.fromEntries(header.map((h, i) => [h, values[i] ?? ""])));
  }
  return rows;
}

/** The lines under a note's `## <heading>`, up to the next `## ` heading; none when it has no such section. */
export function sectionLines(note: Note, heading: string): string[] {
  const lines = note.body.split("\n");
  const start = lines.findIndex((l) => l.trim().toLowerCase() === `## ${heading.toLowerCase()}`);
  if (start < 0) return [];
  const end = lines.findIndex((l, i) => i > start && /^##\s/.test(l));
  return lines.slice(start + 1, end < 0 ? undefined : end);
}

/** The note name a cell's wikilink points at: "[[Meals/Dahl#Method|the dahl]]" → "Dahl". */
export function linkTarget(cell: string): string | null {
  const link = cell.match(/\[\[([^\]|#]+)/);
  return link ? path.basename(link[1].trim()) : null;
}

/** The folders a Week Menu's dinners and sides link into, in lookup order. */
export const RECIPE_FOLDERS = ["Meals", "Sides"];

/** The Recipe or Side a Week Menu links to by `name`. */
export async function readRecipe(vault: string, name: string): Promise<Recipe> {
  const note = await findRecipeNote(vault, name);
  if (!note) throw new VaultError(`No Recipe "${name}" in ${RECIPE_FOLDERS.join(" or ")}`);
  return parseRecipe(name, note);
}

/** The note of the Recipe or Side a Week Menu links to by `name`; null if there is none. */
export async function findRecipeNote(vault: string, name: string): Promise<Note | null> {
  for (const folder of RECIPE_FOLDERS) {
    try {
      return await readNote(path.join(vault, folder, `${name}.md`));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
  }
  return null;
}

export function parseRecipe(name: string, note: Note): Recipe {
  const source = typeof note.properties.source === "string" && note.properties.source.trim() ? note.properties.source.trim() : null;
  const recipe: Recipe = { title: name, ingredients: [], method: [], notes: [], source };
  const steps: string[] = [];
  const paragraphs: string[][] = [];
  let section: string | null = null;
  let group: IngredientGroup | null = null;
  /** Where a line that isn't a step or a blank line goes: onto the step above it, or into a notes paragraph. */
  let continuing: "step" | "paragraph" | null = null;
  for (const line of note.body.split("\n")) {
    let m: RegExpMatchArray | null;
    if ((m = line.match(/^# (.+)/))) recipe.title = m[1].trim();
    else if ((m = line.match(/^## (.+)/))) {
      section = m[1].trim().toLowerCase();
      group = null;
      continuing = null;
    } else if (section === "ingredients" && (m = line.match(/^### (.+)/))) {
      group = { heading: m[1].trim(), items: [] };
      recipe.ingredients.push(group);
    } else if (section === "ingredients" && (m = line.match(/^\s*[-*] (.+)/))) {
      if (!group) {
        group = { heading: null, items: [] };
        recipe.ingredients.push(group);
      }
      group.items.push(parseIngredient(note.file, m[1].trim()));
    } else if (section === "method" || section === "notes") {
      if (!line.trim()) continuing = null;
      else if (section === "method" && (m = line.match(/^\d+[.)]\s+(.+)/))) {
        steps.push(m[1].trim());
        continuing = "step";
      } else if (continuing === "step" && /^\s/.test(line)) steps[steps.length - 1] += ` ${line.trim()}`;
      else if (continuing === "paragraph") paragraphs[paragraphs.length - 1].push(line.trim());
      else {
        paragraphs.push([line.trim()]);
        continuing = "paragraph";
      }
    }
  }
  const vocabulary = ingredientWords(recipe.ingredients);
  recipe.method = steps.map((step) =>
    markStep(plainText(step), vocabulary, (amount) => {
      const parsed = parseRecipeAmount(amount);
      if (!parsed) throw new NoteError(note.file, `the amount "${amount}" in the Method step "${step}" doesn't start with a number`);
      return parsed;
    }),
  );
  recipe.notes = paragraphs.map((p) => plainText(p.join(" ")).replace(/\*([^*]+)\*/g, "$1"));
  return recipe;
}

function parseIngredient(file: string, line: string): Ingredient {
  const italic = line.match(/^\*([^*]+)\*\s*(.*)$/);
  if (!italic) return { amount: null, text: plainText(line) };
  const amount = parseRecipeAmount(italic[1]);
  if (!amount) throw new NoteError(file, `the amount "${italic[1]}" in "${line}" doesn't start with a number`);
  return { amount, text: plainText(italic[2]) };
}

/** Wikilinks and markdown links as their text. */
function plainText(s: string): string {
  return s.replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (_, target, alias) => alias ?? target).replace(/\[([^\]]+)\]\([^)]+\)/g, "$1");
}
