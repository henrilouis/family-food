import { BUNDLE_SCHEMA_VERSION, type DisplayBundle, type Recipe } from "../bundle/bundle.ts";
import { addDays, kitchenDate } from "../bundle/kitchen-day.ts";
import { readRecipe, readWeekMenus } from "./vault.ts";

export async function buildBundle(vault: string, now: Date): Promise<DisplayBundle> {
  const weekMenus = (await readWeekMenus(vault)).filter((week) => isPublished(week.weekStart, now));
  const names = new Set(weekMenus.flatMap((week) => week.days.flatMap((day) => [day.dinner, day.side])));
  const recipes: Record<string, Recipe> = {};
  for (const name of [...names].filter((n) => n !== null).sort()) recipes[name] = await readRecipe(vault, name);
  return {
    schemaVersion: BUNDLE_SCHEMA_VERSION,
    publishedAt: now.toISOString(),
    weekMenus,
    recipes,
  };
}

/** Whether a Publish at `now` sends the Week Menu starting on `weekStart`: it ends on or after today. */
export function isPublished(weekStart: string, now: Date): boolean {
  return addDays(weekStart, 6) >= kitchenDate(now);
}
