import { access, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { addDays, dayLabel, localDate } from "../bundle/dates.ts";
import { staplesThisWeek } from "./basket/staples.ts";
import {
  findRecipeNote,
  linkTarget,
  NoteError,
  parseWeekMenu,
  readNotes,
  readWeekMenuNotes,
  RECIPE_FOLDERS,
  VaultError,
  WEEK_MENUS,
  weekStartOf,
  type Note,
} from "./vault.ts";
import { UserError } from "./user-error.ts";

/** The Week Menu a Planning Session at `now` plans: the next Saturday → Friday, and whether its Saturday delivery is missed. */
export type WeekMenuToPlan = {
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
  week: WeekMenuToPlan;
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
  const week = await weekMenuToPlan(vault, now);
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
      activeMinutes: numberProperty(p.active_minutes),
      totalMinutes: numberProperty(p.total_minutes),
      serves: numberProperty(p.serves),
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

/** What the household made of a recipe site so far: the planner prefers sites with keeps and Meals, and skips repeated 👎. */
export type SiteRecord = {
  /** The source URL's host without "www.": "cookieandkate.com". */
  site: string;
  /** Week Menus whose Novel Recipe came from the site, by `novel_verdict`; a Week Menu without a verdict counts nowhere. */
  kept: number;
  rejected: number;
  notCooked: number;
  /** Meals (not Novel Recipes still waiting for a verdict) whose `source` is on the site. */
  meals: number;
};

/** Every site a Week Menu's `novel_source` or a Meal's `source` points at, by name. Sources that aren't URLs are left out. */
export async function siteTrackRecord(vault: string): Promise<SiteRecord[]> {
  const sites = new Map<string, SiteRecord>();
  const record = (source: unknown) => {
    const site = siteOf(text(source));
    if (!site) return null;
    if (!sites.has(site)) sites.set(site, { site, kept: 0, rejected: 0, notCooked: 0, meals: 0 });
    return sites.get(site)!;
  };
  for (const note of await readWeekMenuNotes(vault)) {
    const verdict = text(note.properties.novel_verdict)?.toLowerCase();
    const key = verdict === "kept" ? "kept" : verdict === "rejected" ? "rejected" : verdict === "not cooked" ? "notCooked" : null;
    if (key) {
      const site = record(note.properties.novel_source);
      if (site) site[key]++;
    }
  }
  for (const note of await readNotes(path.join(vault, "Meals"))) {
    if (note.properties.novel === true) continue;
    const site = record(note.properties.source);
    if (site) site.meals++;
  }
  return [...sites.values()].sort((a, b) => a.site.localeCompare(b.site));
}

function siteOf(source: string | null): string | null {
  if (!source || !/^https?:\/\//i.test(source)) return null;
  try {
    return new URL(source).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return null;
  }
}

/** A Novel Recipe's verdict, given at the next Planning Session. */
export const VERDICTS = ["kept", "rejected", "not cooked"] as const;
export type Verdict = (typeof VERDICTS)[number];

/**
 * Records the verdict on the Novel Recipe of the Week Menu starting on `weekStart` in its `novel_verdict`.
 * Once judged (kept or rejected) the Recipe is no longer Novel, so its `novel` is cleared if it is still in the vault.
 * Returns what changed, for the person.
 */
export async function recordVerdict(vault: string, weekStart: string, verdict: string): Promise<string[]> {
  if (!(VERDICTS as readonly string[]).includes(verdict)) throw new VaultError(`The verdict is kept, rejected or not cooked, not "${verdict}"`);
  const note = (await readWeekMenuNotes(vault)).find((n) => weekStartOf(n) === weekStart);
  if (!note) throw new VaultError(`No Week Menu for the week of ${weekStart} in "${WEEK_MENUS}"`);
  const novel = linkTarget(text(note.properties.novel) ?? "");
  if (!novel) throw new VaultError(`The Week Menu of ${weekStart} has no Novel Recipe to judge`);
  await setProperty(note.file, "novel_verdict", verdict);
  const done = [`${path.relative(vault, note.file)}: novel_verdict: ${verdict}`];
  const recipe = verdict === "not cooked" ? null : await findRecipeNote(vault, novel);
  if (recipe) {
    await setProperty(recipe.file, "novel", "false");
    done.push(`${path.relative(vault, recipe.file)}: novel: false`);
  }
  return done;
}

/** Sets one property in a note's frontmatter to a one-line `value`, leaving every other line as it was. */
async function setProperty(file: string, key: string, value: string): Promise<void> {
  const text = await readFile(file, "utf8");
  const frontmatter = text.match(/^---\r?\n([\s\S]*?\r?\n)?---(\r?\n|$)/);
  if (!frontmatter) {
    await writeFile(file, `---\n${key}: ${value}\n---\n${text}`);
    return;
  }
  const lines = (frontmatter[1] ?? "").split("\n").slice(0, -1);
  const at = lines.findIndex((line) => line.startsWith(`${key}:`));
  if (at < 0) lines.push(`${key}: ${value}`);
  else {
    // A list or block value continues on the indented lines below its key.
    let end = at + 1;
    while (end < lines.length && /^[ \t]+\S|^-\s/.test(lines[end])) end++;
    lines.splice(at, end - at, `${key}: ${value}`);
  }
  await writeFile(file, `---\n${lines.join("\n")}\n---${frontmatter[2]}${text.slice(frontmatter[0].length)}`);
}
/**
 * Deletes a Recipe's note and turns the Week Menus' links to it into plain text, so they keep its name
 * (and their Novel Recipe properties) and still pass `food vault check`. Returns what changed, for the person.
 */
export async function deleteRecipe(vault: string, name: string): Promise<string[]> {
  const recipe = await findRecipeNote(vault, name);
  if (!recipe) throw new VaultError(`No Recipe "${name}" in ${RECIPE_FOLDERS.join(" or ")}`);
  await rm(recipe.file);
  const unlinked: string[] = [];
  for (const note of (await readNotes(path.join(vault, WEEK_MENUS))).sort((a, b) => a.file.localeCompare(b.file))) {
    const text = (await readFile(note.file, "utf8")).replace(/\r\n/g, "\n");
    const at = text.length - note.body.length;
    const body = note.body
      .split("\n")
      .map((line) =>
        line.replace(/\[\[([^\]|#]+)(?:#[^\]|]*)?(?:\|([^\]]+))?\]\]/g, (link, target: string, alias?: string) => {
          if (path.basename(target.trim()) !== name) return link;
          const plain = alias?.trim() ?? name;
          // Keep a table's columns lined up.
          return line.trimStart().startsWith("|") ? plain.padEnd(link.length) : plain;
        }),
      )
      .join("\n");
    if (body === note.body) continue;
    await writeFile(note.file, text.slice(0, at) + body);
    unlinked.push(path.relative(vault, note.file));
  }
  return [`Deleted ${path.relative(vault, recipe.file)}`, ...(unlinked.length ? [`Unlinked it in ${unlinked.join(", ")}`] : [])];
}

/** The Locked Week Menu handed to `food plan write` doesn't make a Week Menu note. */
export class PlanInputError extends UserError {}

/** A Locked Week Menu as the planning-session skill hands it over: `food plan write` turns it into the note. */
export type LockedWeekMenu = {
  /** The Saturday, YYYY-MM-DD. */
  weekStart: string;
  /** The Novel Recipe's source URL, for `novel_source`; the Novel Recipe itself is the day marked `novel`. */
  novelSource?: string | null;
  /** Saturday to Friday. `dinner` is a Recipe's note name, or null for the Free Day. */
  days: { dinner: string | null; side?: string | null; novel?: boolean; double?: "cook" | "second" | null }[];
  /** This Basket's Staple deviations, the `## Staples this week` lines without "- ": "Skip: milk ×1". */
  staples?: string[];
  /** `## Notes` lines without "- ", e.g. the rules the planner bent. */
  notes?: string[];
};

/** Writes the note of a Locked Week Menu, after checking it makes one. Returns the note's path in the vault. */
export async function writeWeekMenu(vault: string, weekMenu: LockedWeekMenu): Promise<string> {
  const { weekStart, days } = weekMenu;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(weekStart ?? "") || new Date(`${weekStart}T00:00:00Z`).getUTCDay() !== 6) {
    throw new PlanInputError(`The week starts on a Saturday; ${weekStart} is not a Saturday`);
  }
  if (!Array.isArray(days) || days.length !== 7) throw new PlanInputError("A Week Menu has 7 days, Saturday to Friday");
  const labels = days.map((_, i) => dayLabel(addDays(weekStart, i)));
  const problems: string[] = [];
  days.forEach((day, i) => {
    if (day.double === "second" && !(i > 0 && days[i - 1].double === "cook" && days[i - 1].dinner === day.dinner && day.dinner)) {
      problems.push(`${labels[i]}: a Double 2nd day must follow the cook day of the same dinner`);
    }
    if (day.double && day.double !== "cook" && day.double !== "second") problems.push(`${labels[i]}: double is "cook" or "second"`);
  });
  const novels = [...new Set(days.filter((day) => day.novel && day.dinner).map((day) => day.dinner))];
  if (novels.length > 1) problems.push(`A Week Menu has one Novel Recipe, not ${novels.join(", ")}`);
  if (problems.length) throw new PlanInputError(`Can't write this Week Menu:\n${problems.map((p) => `- ${p}`).join("\n")}`);

  const file = path.join(vault, WEEK_MENUS, weekMenuName(weekStart));
  const exists = await access(file).then(
    () => true,
    () => false,
  );
  if (exists) throw new PlanInputError(`${path.relative(vault, file)} is already there: edit it instead`);

  const link = (name: string | null | undefined) => (name ? `[[${name}]]` : "");
  const rows = days.map((day, i) => [
    labels[i],
    day.dinner ? link(day.dinner) : "Free Day",
    day.dinner ? link(day.side) : "",
    [day.novel && day.dinner ? "Novel" : "", day.double === "cook" ? "Double: cook" : day.double === "second" ? "Double: 2nd day" : ""]
      .filter(Boolean)
      .join(", "),
  ]);
  const source = weekMenu.novelSource?.trim() ?? "";
  const body = [
    "---",
    `week_start: ${weekStart}`,
    `novel:${novels.length ? ` "[[${novels[0]}]]"` : ""}`,
    `novel_source:${source ? ` ${/^https?:\/\/\S+$/.test(source) ? source : JSON.stringify(source)}` : ""}`,
    "novel_verdict:",
    "---",
    `# Week Menu ${weekStart}`,
    "",
    ...table(["Day", "Dinner", "Side", "Note"], rows),
    "",
    "## Staples this week",
    ...(weekMenu.staples ?? []).map((line) => `- ${line}`),
    "",
    "## Notes",
    ...(weekMenu.notes ?? []).map((line) => `- ${line}`),
    "",
  ].join("\n");
  // The Staples lines must be ones Basket filling can read.
  try {
    await staplesThisWeek(vault, { file, properties: {}, body });
  } catch (error) {
    if (error instanceof NoteError) throw new PlanInputError(`Can't write this Week Menu: ${error.problem}`);
    throw error;
  }
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, body);
  return path.relative(vault, file);
}

/** A markdown table with its columns lined up. */
function table(header: string[], rows: string[][]): string[] {
  const widths = header.map((h, i) => Math.max(h.length, ...rows.map((row) => row[i].length)));
  const line = (cells: string[]) => `| ${cells.map((c, i) => c.padEnd(widths[i])).join(" | ")} |`;
  return [line(header), `|${widths.map((w) => "-".repeat(w + 2)).join("|")}|`, ...rows.map(line)];
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

/** A number property, or null when it isn't a number. */
function numberProperty(value: unknown): number | null {
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

async function weekMenuToPlan(vault: string, now: Date): Promise<WeekMenuToPlan> {
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
