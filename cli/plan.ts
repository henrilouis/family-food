import { access } from "node:fs/promises";
import path from "node:path";
import { addDays } from "../bundle/kitchen-day.ts";
import { dayLabel } from "./check.ts";
import { findRecipeNote, linkTarget, parseWeekMenu, readNotes, readWeekMenuNotes, weekStartOf, type Note } from "./vault.ts";

const WEEK_MENUS = "Week menus";

/** The Week Menu a Planning Session at `now` plans: the next Saturday → Friday, and whether its Saturday delivery is missed. */
export type PlannedWeek = {
  weekStart: string;
  /** The Week Menu note, relative to the vault. */
  file: string;
  /** The note is already there: the week is Locked. */
  exists: boolean;
  /** The Day cells of its table: "Sat 28 Nov" … "Fri 4 Dec". */
  days: string[];
  /** The order deadline for the Saturday delivery: "Fri 27 Nov 12:00". */
  orderBefore: string;
  /** The deadline has passed. */
  late: boolean;
};

/** The most recent Week Menu before the planned week, whose Novel Recipe the session reviews. */
export type Review = {
  weekStart: string;
  file: string;
  /** The Novel Recipe's note name; null when the week had none. */
  novel: string | null;
  novelSource: string | null;
  /** kept | rejected | not cooked; null until reviewed. */
  novelVerdict: string | null;
  /** The Novel Recipe's note is still in the vault. */
  novelInVault: boolean;
};

export type PlanContext = {
  week: PlannedWeek;
  review: Review | null;
  /** The last 3 Week Menus before the planned week, newest first: the repeat window. */
  recentWeeks: { weekStart: string; dinners: string[] }[];
  /** Novel Recipe sources with a 👎 (`novel_verdict: rejected`) in any Week Menu: never proposed again. */
  rejectedSources: string[];
  /** Every Meal, by name, with what the planner filters on. */
  meals: Meal[];
};

/** A Meal's properties as the planner reads them, and when it was last on a Week Menu before the planned week. */
export type Meal = {
  name: string;
  cuisine: string | null;
  base: string[];
  double: boolean;
  activeMinutes: number | null;
  totalMinutes: number | null;
  serves: number | null;
  /** Note names, the default first. */
  sides: string[];
  source: string | null;
  novel: boolean;
  /** Method steps; 0 for a placeholder that can't be cooked from yet. */
  steps: number;
  /** The last Menu Day it was the dinner, as YYYY-MM-DD; null if never. */
  lastPlanned: string | null;
  /** It is a dinner in one of `recentWeeks`. */
  inRepeatWindow: boolean;
};

/** Week Menus the repeat window counts: notes, not calendar weeks, so a missed week breaks nothing. */
const REPEAT_WINDOW = 3;

/** What the planning-session skill needs to know before it proposes a week. */
export async function planContext(vault: string, now: Date): Promise<PlanContext> {
  const week = await plannedWeek(vault, now);
  const notes = await readWeekMenuNotes(vault);
  const before = notes.filter((note) => weekStartOf(note) < week.weekStart).sort((a, b) => weekStartOf(b).localeCompare(weekStartOf(a)));
  const history = before.map(parseWeekMenu);
  const recentWeeks = history.slice(0, REPEAT_WINDOW).map((menu) => ({
    weekStart: menu.weekStart,
    dinners: [...new Set(menu.days.flatMap((day) => (day.dinner ? [day.dinner] : [])))],
  }));
  const lastPlanned = new Map<string, string>();
  for (const day of history.flatMap((menu) => menu.days)) {
    if (day.dinner && day.date > (lastPlanned.get(day.dinner) ?? "")) lastPlanned.set(day.dinner, day.date);
  }
  const meals = (await readNotes(path.join(vault, "Meals"))).map((note): Meal => {
    const name = path.basename(note.file, ".md");
    const p = note.properties;
    return {
      name,
      cuisine: text(p.cuisine),
      base: list(p.base),
      double: p.double === true,
      activeMinutes: number(p.active_minutes),
      totalMinutes: number(p.total_minutes),
      serves: number(p.serves),
      sides: list(p.sides).flatMap((side) => linkTarget(side) ?? []),
      source: text(p.source),
      novel: p.novel === true,
      steps: methodSteps(note),
      lastPlanned: lastPlanned.get(name) ?? null,
      inRepeatWindow: recentWeeks.some((w) => w.dinners.includes(name)),
    };
  });
  return {
    week,
    review: before.length ? await review(vault, before[0]) : null,
    recentWeeks,
    rejectedSources: [
      ...new Set(
        notes.flatMap((note) =>
          text(note.properties.novel_verdict)?.toLowerCase() === "rejected" ? (text(note.properties.novel_source) ?? []) : [],
        ),
      ),
    ],
    meals,
  };
}

/** The numbered lines under `## Method`. */
function methodSteps(note: Note): number {
  let section = "";
  let steps = 0;
  for (const line of note.body.split("\n")) {
    const heading = line.match(/^## (.+)/);
    if (heading) section = heading[1].trim().toLowerCase();
    else if (section === "method" && /^\d+[.)]\s+\S/.test(line)) steps++;
  }
  return steps;
}

function list(value: unknown): string[] {
  return (value === undefined || value === null ? [] : [value].flat()).flatMap((item) => text(item) ?? []);
}

function number(value: unknown): number | null {
  return typeof value === "number" ? value : null;
}

async function review(vault: string, note: Note): Promise<Review> {
  const novel = linkTarget(text(note.properties.novel) ?? "");
  return {
    weekStart: weekStartOf(note),
    file: path.relative(vault, note.file),
    novel,
    novelSource: text(note.properties.novel_source),
    novelVerdict: text(note.properties.novel_verdict),
    novelInVault: novel !== null && (await findRecipeNote(vault, novel)) !== null,
  };
}

/** A property's text, or null when it is empty. */
function text(value: unknown): string | null {
  return value === undefined || value === null || String(value).trim() === "" ? null : String(value).trim();
}

async function plannedWeek(vault: string, now: Date): Promise<PlannedWeek> {
  const today = localDate(now);
  const weekday = new Date(`${today}T00:00:00Z`).getUTCDay();
  const weekStart = addDays(today, (6 - weekday + 7) % 7 || 7);
  const friday = addDays(weekStart, -1);
  const [year, month, day] = friday.split("-").map(Number);
  const file = path.join(WEEK_MENUS, weekMenuName(weekStart));
  return {
    weekStart,
    file,
    exists: await access(path.join(vault, file)).then(
      () => true,
      () => false,
    ),
    days: [0, 1, 2, 3, 4, 5, 6].map((offset) => dayLabel(addDays(weekStart, offset))),
    orderBefore: `${dayLabel(friday)} 12:00`,
    late: now >= new Date(year, month - 1, day, 12),
  };
}

/** A Week Menu's file name, after its Saturday: "Week 2026-11-28.md". */
export function weekMenuName(weekStart: string): string {
  return `Week ${weekStart}.md`;
}

/** The local calendar date at `now`, as YYYY-MM-DD. */
function localDate(now: Date): string {
  return [now.getFullYear(), now.getMonth() + 1, now.getDate()].map((n) => String(n).padStart(2, "0")).join("-");
}
