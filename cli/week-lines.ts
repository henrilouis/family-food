import type { Ingredient } from "./model.ts";
import { coversBothDays, findRecipeNote, parseRecipe, parseWeekMenu, readWeekMenuNotes, VaultError, WEEK_MENUS, weekStartOf, type Note } from "./vault.ts";

/** An ingredient line that isn't bought unless an adult asks for it: "Wraps if you want", "chilli flakes (optional)". */
const OPTIONAL = /\boptional\b|\bif you (?:want|like)\b/i;

/** An ingredient line of a Recipe or Side the Week Menu buys, and the number of dinners it is bought for. */
export type WeekLine = {
  /** The Recipe or Side, by note name. */
  recipe: string;
  ingredient: Ingredient;
  /**
   * 1 per day it is on, 2 on a Double cook day (a Double 2nd day buys nothing); 1 on the cook day of a Recipe
   * written for both days (serves more than 6).
   */
  times: number;
  /** "Wraps if you want", "chilli flakes (optional)": bought only when the Matches have an entry for it. */
  optional: boolean;
};

/** An ingredient line as written, without the italics: "300g red split lentils". */
export function lineText(ingredient: Ingredient): string {
  return ingredient.amount ? `${ingredient.amount.text} ${ingredient.text}` : ingredient.text;
}

/** The Locked Week Menu starting on `weekStart`, and every ingredient line of the Recipes and Sides it buys, in order. */
export async function weekLines(vault: string, weekStart: string): Promise<{ note: Note; lines: WeekLine[] }> {
  const note = (await readWeekMenuNotes(vault)).find((n) => weekStartOf(n) === weekStart);
  if (!note) throw new VaultError(`No Week Menu for the week of ${weekStart} in "${WEEK_MENUS}"`);
  const notes = new Map<string, Note>();
  const recipeNote = async (name: string) => {
    const found = notes.get(name) ?? (await findRecipeNote(vault, name));
    if (!found) throw new VaultError(`No Recipe "${name}" in Meals or Sides`);
    notes.set(name, found);
    return found;
  };
  const times = new Map<string, number>();
  for (const day of parseWeekMenu(note).days) {
    if (day.double === "second") continue;
    for (const name of [day.dinner, day.side]) {
      if (!name) continue;
      const doubled = day.double === "cook" && !(name === day.dinner && coversBothDays(await recipeNote(name)));
      times.set(name, (times.get(name) ?? 0) + (doubled ? 2 : 1));
    }
  }
  const lines: WeekLine[] = [];
  for (const [recipe, count] of times) {
    for (const ingredient of parseRecipe(recipe, await recipeNote(recipe)).ingredients.flatMap((group) => group.items)) {
      lines.push({ recipe, ingredient, times: count, optional: OPTIONAL.test(lineText(ingredient)) });
    }
  }
  return { note, lines };
}
