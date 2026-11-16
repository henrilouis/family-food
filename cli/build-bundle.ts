import { BUNDLE_SCHEMA_VERSION, type DisplayBundle, type Recipe } from "../bundle/bundle.ts";
import { addDays, kitchenDate } from "../bundle/kitchen-day.ts";
import { readRecipe, readWeekMenus } from "./vault.ts";

export async function buildBundle(vault: string, now: Date): Promise<DisplayBundle> {
  const today = kitchenDate(now);
  const weekMenus = (await readWeekMenus(vault)).filter((week) => addDays(week.weekStart, 6) >= today);
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
