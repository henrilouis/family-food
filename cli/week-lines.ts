import type { Ingredient } from "../bundle/bundle.ts";
import { findRecipeNote, parseRecipe, parseWeekMenu, readWeekMenuNotes, VaultError, WEEK_MENUS, weekStartOf, type Note } from "./vault.ts";

/** An ingredient line that isn't bought: "Wraps if you want", "chilli flakes (optional)". */
const OPTIONAL = /\boptional\b|\bif you (?:want|like)\b/i;

/** An ingredient line of a Recipe or Side the Week Menu buys, and the number of dinners it is bought for. */
export type WeekLine = {
  /** The Recipe or Side, by note name. */
  recipe: string;
  ingredient: Ingredient;
  /** 1 per day it is on, 2 on a Double cook day (a Double 2nd day buys nothing). */
  times: number;
  /** "Wraps if you want", "chilli flakes (optional)": never bought. */
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
  const times = new Map<string, number>();
  for (const day of parseWeekMenu(note).days) {
    if (day.double === "second") continue;
    for (const name of [day.dinner, day.side]) {
      if (name) times.set(name, (times.get(name) ?? 0) + (day.double === "cook" ? 2 : 1));
    }
  }
  const lines: WeekLine[] = [];
  for (const [recipe, count] of times) {
    const recipeNote = await findRecipeNote(vault, recipe);
    if (!recipeNote) throw new VaultError(`No Recipe "${recipe}" in Meals or Sides`);
    for (const ingredient of parseRecipe(recipe, recipeNote).ingredients.flatMap((group) => group.items)) {
      lines.push({ recipe, ingredient, times: count, optional: OPTIONAL.test(lineText(ingredient)) });
    }
  }
  return { note, lines };
}
