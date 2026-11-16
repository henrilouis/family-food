import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { parse as parseYaml } from "yaml";
import type { Ingredient, IngredientGroup, MenuDay, Recipe, WeekMenu } from "../bundle/bundle.ts";
import { addDays } from "../bundle/kitchen-day.ts";
import { parseAmount } from "./amount.ts";

const WEEK_MENUS = "Week menus";

/** A Recipe Vault note: its file name, properties and markdown body. */
type Note = { file: string; properties: Record<string, unknown>; body: string };

async function readNote(file: string): Promise<Note> {
  const text = (await readFile(file, "utf8")).replace(/\r\n/g, "\n");
  const match = text.match(/^---\n([\s\S]*?)\n---\n?/);
  if (!match) return { file, properties: {}, body: text };
  return { file, properties: parseYaml(match[1]) ?? {}, body: text.slice(match[0].length) };
}

/** Every Week Menu note in the vault that has a `week_start`, oldest first. */
export async function readWeekMenus(vault: string): Promise<WeekMenu[]> {
  const dir = path.join(vault, WEEK_MENUS);
  const files = (await readdir(dir)).filter((f) => f.endsWith(".md"));
  const notes = await Promise.all(files.map((f) => readNote(path.join(dir, f))));
  return notes
    .filter((note) => note.properties.week_start)
    .map(parseWeekMenu)
    .sort((a, b) => a.weekStart.localeCompare(b.weekStart));
}

function parseWeekMenu(note: Note): WeekMenu {
  const start = note.properties.week_start;
  const weekStart = start instanceof Date ? start.toISOString().slice(0, 10) : String(start);
  const rows = dayTable(note);
  const days = rows.map((row, i): MenuDay => {
    const dinner = /^free day$/i.test(row.dinner ?? "") ? null : linkTarget(row.dinner ?? "");
    const marker = row.note ?? "";
    return {
      date: addDays(weekStart, i),
      dinner,
      side: dinner ? linkTarget(row.side ?? "") : null,
      novel: /\bnovel\b/i.test(marker),
      double: /double:\s*cook/i.test(marker) ? "cook" : /double:\s*2nd day/i.test(marker) ? "second" : null,
    };
  });
  return { weekStart, days };
}

/** The rows of the note's day table (Day | Dinner | Side | Note), keyed by lower-cased column name. */
function dayTable(note: Note): Record<string, string>[] {
  const lines = note.body.split("\n").map((l) => l.trim());
  const cells = (line: string) => line.replace(/^\|/, "").replace(/\|$/, "").split("|").map((c) => c.trim());
  const headerAt = lines.findIndex((l) => l.startsWith("|") && /\bdinner\b/i.test(l));
  if (headerAt < 0) throw new Error(`${note.file}: no day table with a Dinner column`);
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

/** The note name a cell's wikilink points at: "[[Meals/Dahl#Method|the dahl]]" → "Dahl". */
function linkTarget(cell: string): string | null {
  const link = cell.match(/\[\[([^\]|#]+)/);
  return link ? path.basename(link[1].trim()) : null;
}

const RECIPE_FOLDERS = ["Meals", "Sides", "Baking"];

/** The Recipe or Side a Week Menu links to by `name`. */
export async function readRecipe(vault: string, name: string): Promise<Recipe> {
  for (const folder of RECIPE_FOLDERS) {
    const file = path.join(vault, folder, `${name}.md`);
    try {
      return parseRecipe(name, await readNote(file));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
  }
  throw new Error(`No Recipe "${name}" in ${RECIPE_FOLDERS.join(", ")}`);
}

function parseRecipe(name: string, note: Note): Recipe {
  const recipe: Recipe = { title: name, ingredients: [] };
  let section: string | null = null;
  let group: IngredientGroup | null = null;
  for (const line of note.body.split("\n")) {
    let m: RegExpMatchArray | null;
    if ((m = line.match(/^# (.+)/))) recipe.title = m[1].trim();
    else if ((m = line.match(/^## (.+)/))) {
      section = m[1].trim().toLowerCase();
      group = null;
    } else if (section === "ingredients" && (m = line.match(/^### (.+)/))) {
      group = { heading: m[1].trim(), items: [] };
      recipe.ingredients.push(group);
    } else if (section === "ingredients" && (m = line.match(/^\s*[-*] (.+)/))) {
      if (!group) {
        group = { heading: null, items: [] };
        recipe.ingredients.push(group);
      }
      group.items.push(parseIngredient(note.file, m[1].trim()));
    }
  }
  return recipe;
}

function parseIngredient(file: string, line: string): Ingredient {
  const italic = line.match(/^\*([^*]+)\*\s*(.*)$/);
  if (!italic) return { amount: null, text: plainText(line) };
  const amount = parseAmount(italic[1]);
  if (!amount) throw new Error(`${file}: the amount "${italic[1]}" in "${line}" doesn't start with a number`);
  return { amount, text: plainText(italic[2]) };
}

/** Wikilinks and markdown links as their text. */
function plainText(s: string): string {
  return s.replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (_, target, alias) => alias ?? target).replace(/\[([^\]]+)\]\([^)]+\)/g, "$1");
}
