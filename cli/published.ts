import type { WeekMenu } from "./model.ts";
import { addDays, localDate } from "./dates.ts";
import { readRecipe, readWeekMenus } from "./vault.ts";

/** What a Publish sends: the Week Menus, and the title of each Recipe and Side they link to, by the name linked. */
export type Published = {
  weekMenus: WeekMenu[];
  titles: Record<string, string>;
};

/** The Week Menus a Publish at `now` sends (see `isPublished`), oldest first, with their Recipes' titles. */
export async function readPublished(vault: string, now: Date): Promise<Published> {
  const weekMenus = (await readWeekMenus(vault)).filter((week) => isPublished(week.weekStart, now));
  const names = new Set(weekMenus.flatMap((week) => week.days.flatMap((day) => [day.dinner, day.side])));
  const titles: Record<string, string> = {};
  for (const name of [...names].filter((n) => n !== null).sort()) titles[name] = (await readRecipe(vault, name)).title;
  return { weekMenus, titles };
}

/** Whether a Publish at `now` sends the Week Menu starting on `weekStart`: it ends on or after today. */
export function isPublished(weekStart: string, now: Date): boolean {
  return addDays(weekStart, 6) >= localDate(now);
}

/** The `week_start` of each Week Menu a Publish at `now` sends that links Recipe `name`, as a dinner or a side. */
export async function publishedWeekMenusWith(vault: string, name: string, now: Date): Promise<string[]> {
  return (await readWeekMenus(vault))
    .filter((week) => isPublished(week.weekStart, now) && week.days.some((day) => day.dinner === name || day.side === name))
    .map((week) => week.weekStart);
}
