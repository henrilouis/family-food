import type { DisplayBundle, MenuDay } from "../bundle/bundle.ts";
import { familyNotes, type NoteLine } from "./adapters/apple-notes/notes.ts";
import { dayLabel } from "./check.ts";
import type { Config } from "./config.ts";

/**
 * Rewrites the shared This week note with the bundle's Week Menus (the current and upcoming ones),
 * for the partner to read on their phone. Throws AppleNotesError when Notes won't take it.
 */
export async function writeThisWeek(config: Config, bundle: DisplayBundle, now: Date): Promise<void> {
  await familyNotes(config).writeThisWeek(thisWeekLines(bundle, now));
}

function thisWeekLines(bundle: DisplayBundle, now: Date): NoteLine[] {
  const lines: NoteLine[] = [`Published ${timeLabel(now)} by food publish. Changes made here are overwritten.`];
  if (bundle.weekMenus.length === 0) return [...lines, "", "No Week Menu yet."];
  const title = (key: string | null) => (key ? bundle.recipes[key]?.title ?? key : "");
  const dinner = (day: MenuDay) => {
    const name = day.dinner ? title(day.dinner) : day.unlinkedDinner;
    if (!name) return "Free Day";
    const marks = [
      !day.dinner && "deleted",
      day.novel && "new recipe",
      day.double === "cook" && "cook double",
      day.double === "second" && "leftovers",
    ];
    const notes = marks.filter(Boolean).join(", ");
    return name + (day.side && day.double !== "second" ? ` with ${title(day.side)}` : "") + (notes ? ` (${notes})` : "");
  };
  for (const week of bundle.weekMenus) {
    lines.push("", { heading: `Week of ${dayLabel(week.weekStart)}` });
    for (const day of week.days) lines.push(`${dayLabel(day.date)}: ${dinner(day)}`);
  }
  return lines;
}

/** Local time, e.g. "Fri 20 Nov 18:00". */
function timeLabel(d: Date): string {
  const date = [d.getFullYear(), d.getMonth() + 1, d.getDate()].map((n) => String(n).padStart(2, "0")).join("-");
  return `${dayLabel(date)} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}
