import path from "node:path";
import type { MenuDay } from "../bundle/bundle.ts";
import { parseAmount } from "./amount.ts";
import { findRecipeNote, NoteError, parseWeekMenu, readNotes, readWeekMenuNotes, RECIPE_FOLDERS, type Note } from "./vault.ts";

/** A format problem in one Recipe Vault note. `file` is relative to the vault, e.g. "Meals/Dahl.md". */
export type Problem = { file: string; message: string };

/** Errors block Publish; warnings are only reported. */
export type VaultCheck = { errors: Problem[]; warnings: Problem[] };

export async function checkVault(vault: string): Promise<VaultCheck> {
  const check: VaultCheck = { errors: [], warnings: [] };
  const relative = (note: Note) => path.relative(vault, note.file);
  const error = (note: Note, message: string) => check.errors.push({ file: relative(note), message });

  for (const note of await readWeekMenuNotes(vault)) {
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
        } else if (name === day.dinner && day.double === "cook" && recipe.properties.double !== true) {
          error(note, `${dayLabel(day.date)} is a Double cook day, but [[${name}]] isn't double: true`);
        }
      }
    }
  }

  for (const folder of RECIPE_NOTE_FOLDERS) {
    for (const note of await readNotes(path.join(vault, folder))) {
      for (const message of amountProblems(note)) error(note, message);
    }
  }
  return check;
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

/** "2026-11-21" → "Sat 21 Nov", as a Week Menu's Day column writes it. */
function dayLabel(date: string): string {
  const d = new Date(`${date}T00:00:00Z`);
  const weekday = d.toLocaleDateString("en-GB", { weekday: "short", timeZone: "UTC" });
  const month = d.toLocaleDateString("en-GB", { month: "short", timeZone: "UTC" });
  return `${weekday} ${d.getUTCDate()} ${month}`;
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
