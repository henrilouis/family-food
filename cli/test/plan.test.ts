import { rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, test } from "vitest";
import { sandbox } from "./harness.ts";

describe("food plan context", () => {
  test("plans the Saturday after today, and is late from the Friday before it at 12:00", async () => {
    const { run } = await sandbox();
    const week = async (now: string) => {
      const result = await run(["plan", "context"], { now });
      expect(result.stderr).toBe("");
      expect(result.code).toBe(0);
      return JSON.parse(result.stdout).week;
    };

    const thursday = await week("2026-11-26T20:00");
    const fridayMorning = await week("2026-11-27T11:59");
    const fridayAfternoon = await week("2026-11-27T12:00");
    const saturday = await week("2026-11-28T09:00");

    expect(thursday).toEqual({
      weekStart: "2026-11-28",
      file: "Week menus/Week 2026-11-28.md",
      exists: false,
      days: ["Sat 28 Nov", "Sun 29 Nov", "Mon 30 Nov", "Tue 1 Dec", "Wed 2 Dec", "Thu 3 Dec", "Fri 4 Dec"],
      orderBefore: "Fri 27 Nov 12:00",
      late: false,
    });
    expect([fridayMorning.weekStart, fridayMorning.late]).toEqual(["2026-11-28", false]);
    expect([fridayAfternoon.weekStart, fridayAfternoon.late]).toEqual(["2026-11-28", true]);
    expect([saturday.weekStart, saturday.late]).toEqual(["2026-12-05", false]);
  });

  test("says when the week's Week Menu is already there", async () => {
    const { run } = await sandbox();

    const result = await run(["plan", "context"], { now: "2026-11-19T20:00" });

    expect(JSON.parse(result.stdout).week).toMatchObject({ weekStart: "2026-11-21", exists: true });
  });

  test("reviews the Novel Recipe of the most recent Week Menu before the planned week", async () => {
    const { run } = await sandbox();

    const result = await run(["plan", "context"], { now: "2026-11-26T20:00" });

    expect(JSON.parse(result.stdout).review).toEqual({
      weekStart: "2026-11-21",
      file: "Week menus/Week 2026-11-21.md",
      novel: "Vegetable Biryani",
      novelSource: "https://www.seriouseats.com/vegetable-biryani-5324853",
      novelVerdict: null,
      novelInVault: true,
    });
  });

  test("has nothing to review before the first Week Menu", async () => {
    const { run, vault } = await sandbox();
    await rm(path.join(vault, "Week menus"), { recursive: true });

    const result = await run(["plan", "context"], { now: "2026-11-26T20:00" });

    expect(result.code).toBe(0);
    expect(JSON.parse(result.stdout).review).toBeNull();
  });

  test("counts the repeat window in Week Menu notes, and lists the Novel Recipe sources that got a 👎", async () => {
    const { run, vault } = await sandbox();
    await weekMenu(vault, "2026-10-24", { novel: "[[Lemon Stew]]", novel_source: "https://example.com/lemon-stew", novel_verdict: "rejected" }, [
      ["Sat 24 Oct", "[[Pasta Pesto]]", ""],
      ["Sun 25 Oct", "Lemon Stew", "Novel"],
    ]);
    // A missed week: the repeat window reaches back to 31 Oct anyway.
    await weekMenu(vault, "2026-10-31", { novel: "[[Shakshuka]]", novel_source: "https://example.com/shakshuka", novel_verdict: "kept" }, [
      ["Sat 31 Oct", "[[Shakshuka]]", "Novel"],
      ["Sun 1 Nov", "Free Day", ""],
    ]);
    await meal(vault, "Pasta Pesto", "---\ncuisine: Italian\nbase:\n  - pasta\ndouble: false\n---\n# Pasta Pesto\n");
    await meal(vault, "Shakshuka", "---\ncuisine: Middle Eastern\n---\n# Shakshuka\n");
    await meal(vault, "Tomato Soup", "---\ncuisine: Dutch/European\n---\n# Tomato Soup\n");

    const result = await run(["plan", "context"], { now: "2026-11-26T20:00" });

    expect(result.stderr).toBe("");
    const context = JSON.parse(result.stdout);
    expect(context.recentWeeks).toEqual([
      { weekStart: "2026-11-21", dinners: ["Dahl", "Vegetable Biryani"] },
      { weekStart: "2026-11-14", dinners: ["Vegetable Biryani", "Dahl"] },
      { weekStart: "2026-10-31", dinners: ["Shakshuka"] },
    ]);
    expect(context.rejectedSources).toEqual(["https://example.com/lemon-stew"]);
    const meals = Object.fromEntries(context.meals.map((m: { name: string }) => [m.name, m]));
    expect(Object.keys(meals)).toEqual(["Dahl", "Pasta Pesto", "Shakshuka", "Tomato Soup", "Vegetable Biryani"]);
    expect(meals.Dahl).toEqual({
      name: "Dahl",
      cuisine: "Indian",
      base: ["legumes"],
      double: true,
      activeMinutes: 30,
      totalMinutes: 40,
      serves: 4,
      sides: ["Naan"],
      source: null,
      novel: false,
      steps: 3,
      lastPlanned: "2026-11-26",
      inRepeatWindow: true,
    });
    expect(meals["Pasta Pesto"]).toMatchObject({ base: ["pasta"], double: false, steps: 0, lastPlanned: "2026-10-24", inRepeatWindow: false });
    expect(meals.Shakshuka).toMatchObject({ base: [], double: false, activeMinutes: null, sides: [], lastPlanned: "2026-10-31", inRepeatWindow: true });
    expect(meals["Tomato Soup"]).toMatchObject({ lastPlanned: null, inRepeatWindow: false });
    expect(meals["Vegetable Biryani"]).toMatchObject({ novel: true, source: "https://www.seriouseats.com/vegetable-biryani-5324853" });
  });
});

/** Writes a Week Menu note with these properties and day rows (Day, Dinner, Note). */
async function weekMenu(vault: string, weekStart: string, properties: Record<string, string>, rows: string[][]) {
  const frontmatter = Object.entries({ week_start: weekStart, ...properties }).map(([key, value]) => `${key}: "${value}"`);
  const table = ["| Day | Dinner | Side | Note |", "|---|---|---|---|", ...rows.map(([day, dinner, note]) => `| ${day} | ${dinner} | | ${note} |`)];
  await writeFile(path.join(vault, "Week menus", `Week ${weekStart}.md`), ["---", ...frontmatter, "---", `# Week Menu ${weekStart}`, "", ...table, ""].join("\n"));
}

async function meal(vault: string, name: string, text: string) {
  await writeFile(path.join(vault, "Meals", `${name}.md`), text);
}
