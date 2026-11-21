import type { MenuDay } from "./model.ts";
import { dayLabel, timeLabel } from "./dates.ts";
import { familyNotes, type NoteLine } from "./adapters/apple-notes/notes.ts";
import type { Config } from "./config.ts";
import type { Published } from "./published.ts";

/**
 * Rewrites the shared This week note with the published Week Menus (the current and upcoming ones),
 * for the partner to read on their phone. Throws AppleNotesError when Notes won't take it.
 */
export async function writeThisWeek(config: Config, published: Published, now: Date): Promise<void> {
  await familyNotes(config).writeThisWeek(thisWeekLines(published, now));
}

function thisWeekLines(published: Published, now: Date): NoteLine[] {
  const lines: NoteLine[] = [`Published ${timeLabel(now)} by food publish. Changes made here are overwritten.`];
  if (published.weekMenus.length === 0) return [...lines, "", "No Week Menu yet."];
  const title = (key: string | null) => (key ? published.titles[key] ?? key : "");
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
  for (const week of published.weekMenus) {
    lines.push("", { heading: `Week of ${dayLabel(week.weekStart)}` });
    for (const day of week.days) lines.push(`${dayLabel(day.date)}: ${dinner(day)}`);
  }
  return lines;
}
