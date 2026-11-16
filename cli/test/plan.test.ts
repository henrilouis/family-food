import { readFile, rm, writeFile } from "node:fs/promises";
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

describe("food plan verdict", () => {
  const weekNote = "Week menus/Week 2026-11-21.md";
  const biryani = "Meals/Vegetable Biryani.md";

  test("👍 records kept in the Week Menu and clears the Recipe's novel, leaving the rest of both notes as they were", async () => {
    const { run, vault } = await sandbox();
    const [weekBefore, biryaniBefore] = await Promise.all([read(vault, weekNote), read(vault, biryani)]);

    const result = await run(["plan", "verdict", "2026-11-21", "kept"]);

    expect(result.stderr).toBe("");
    expect(result.code).toBe(0);
    expect(await read(vault, weekNote)).toBe(weekBefore.replace("novel_verdict:\n", "novel_verdict: kept\n"));
    expect(await read(vault, biryani)).toBe(biryaniBefore.replace("novel: true\n", "novel: false\n"));
    const context = JSON.parse((await run(["plan", "context"], { now: "2026-11-26T20:00" })).stdout);
    expect(context.review.novelVerdict).toBe("kept");
    expect(context.meals.find((m: { name: string }) => m.name === "Vegetable Biryani").novel).toBe(false);
  });

  test("not cooked is recorded and the Recipe stays Novel; a later verdict replaces it", async () => {
    const { run, vault } = await sandbox();
    const biryaniBefore = await read(vault, biryani);

    const notCooked = await run(["plan", "verdict", "2026-11-21", "not cooked"]);
    const afterNotCooked = await read(vault, weekNote);
    const rejected = await run(["plan", "verdict", "2026-11-21", "rejected"]);

    expect([notCooked.code, rejected.code]).toEqual([0, 0]);
    expect(afterNotCooked).toContain("novel_verdict: not cooked\n");
    expect(await read(vault, weekNote)).toContain("novel_verdict: rejected\n");
    expect(await read(vault, biryani)).toBe(biryaniBefore.replace("novel: true\n", "novel: false\n"));
    const context = JSON.parse((await run(["plan", "context"], { now: "2026-11-26T20:00" })).stdout);
    expect(context.rejectedSources).toEqual(["https://www.seriouseats.com/vegetable-biryani-5324853"]);
  });

  test("refuses a Week Menu without a Novel Recipe and an unknown verdict, writing nothing", async () => {
    const { run, vault } = await sandbox();
    const before = await read(vault, "Week menus/Week 2026-11-14.md");

    const noNovel = await run(["plan", "verdict", "2026-11-14", "kept"]);
    const unknown = await run(["plan", "verdict", "2026-11-21", "meh"]);
    const noWeek = await run(["plan", "verdict", "2026-11-07", "kept"]);

    expect(noNovel.code).toBe(1);
    expect(noNovel.stderr).toMatch(/2026-11-14 has no Novel Recipe/);
    expect(unknown.code).toBe(1);
    expect(unknown.stderr).toMatch(/kept, rejected or not cooked/);
    expect(noWeek.code).toBe(1);
    expect(noWeek.stderr).toMatch(/No Week Menu for the week of 2026-11-07/);
    expect(await read(vault, "Week menus/Week 2026-11-14.md")).toBe(before);
    expect(await read(vault, weekNote)).toContain("novel_verdict:\n");
  });
});

describe("food plan sites", () => {
  test("tallies each site's Novel Recipe verdicts and counts the Meals the family already took from it", async () => {
    const { run, vault } = await sandbox();
    await weekMenu(vault, "2026-10-17", { novel: "[[Lemon Stew]]", novel_source: "https://www.example.com/lemon-stew", novel_verdict: "rejected" }, []);
    await weekMenu(vault, "2026-10-24", { novel: "[[Bean Stew]]", novel_source: "https://example.com/bean-stew", novel_verdict: "not cooked" }, []);
    await weekMenu(vault, "2026-10-31", { novel: "[[Bean Stew]]", novel_source: "https://example.com/bean-stew", novel_verdict: "kept" }, []);
    await weekMenu(vault, "2026-11-07", { novel: "[[Kale Soup]]", novel_source: "https://Cooks.Example.org/kale-soup?ref=x", novel_verdict: "rejected" }, []);
    await meal(vault, "Bean Stew", "---\nsource: https://example.com/bean-stew\nnovel: false\n---\n# Bean Stew\n");
    await meal(vault, "Shakshuka", "---\nsource: https://www.example.com/shakshuka\n---\n# Shakshuka\n");
    await meal(vault, "Tomato Soup", "---\nsource: https://cookieandkate.com/tomato-soup/\n---\n# Tomato Soup\n");
    await meal(vault, "Grandma's Pie", "---\nsource: Grandma's notebook\n---\n# Grandma's Pie\n");

    const result = await run(["plan", "sites"]);

    expect(result.stderr).toBe("");
    expect(result.code).toBe(0);
    // The sample vault's Week 2026-11-21 has a Serious Eats Novel Recipe still waiting for its verdict: it counts nowhere yet.
    expect(JSON.parse(result.stdout)).toEqual([
      { site: "cookieandkate.com", kept: 0, rejected: 0, notCooked: 0, meals: 1 },
      { site: "cooks.example.org", kept: 0, rejected: 1, notCooked: 0, meals: 0 },
      { site: "example.com", kept: 1, rejected: 1, notCooked: 1, meals: 2 },
    ]);
  });
});

describe("food plan write", () => {
  type Day = { dinner: string | null; side?: string; novel?: boolean; double?: string };
  const plan: { weekStart: string; novelSource: string; days: Day[]; staples: string[]; notes: string[] } = {
    weekStart: "2026-11-28",
    novelSource: "https://example.com/shakshuka",
    days: [
      { dinner: "Vegetable Biryani" },
      { dinner: "Shakshuka", novel: true },
      { dinner: "Dahl", side: "Naan", double: "cook" },
      { dinner: "Dahl", double: "second" },
      { dinner: "Dahl", side: "Naan", double: "cook" },
      { dinner: "Dahl", double: "second" },
      { dinner: null },
    ],
    staples: ["Skip: milk ×1", "Ask Staples: peanut butter, oats ×2"],
    notes: ["Bent repeat window for Dahl (Wish)."],
  };
  const writePlan = async (dir: string, value: unknown) => {
    const file = path.join(dir, "plan.json");
    await writeFile(file, JSON.stringify(value));
    return file;
  };

  test("writes the Locked Week Menu note named after its Saturday, which passes the check once the Novel Recipe is saved", async () => {
    const { run, vault } = await sandbox();

    const result = await run(["plan", "write", await writePlan(vault, plan)]);
    await meal(vault, "Shakshuka", "---\ncuisine: Middle Eastern\nnovel: true\n---\n# Shakshuka\n");

    expect(result.stderr).toBe("");
    expect(result.code).toBe(0);
    expect(result.stdout).toBe("Wrote Week menus/Week 2026-11-28.md\n");
    expect(await read(vault, "Week menus/Week 2026-11-28.md")).toBe(
      [
        "---",
        "week_start: 2026-11-28",
        'novel: "[[Shakshuka]]"',
        "novel_source: https://example.com/shakshuka",
        "novel_verdict:",
        "---",
        "# Week Menu 2026-11-28",
        "",
        "| Day        | Dinner                | Side     | Note            |",
        "|------------|-----------------------|----------|-----------------|",
        "| Sat 28 Nov | [[Vegetable Biryani]] |          |                 |",
        "| Sun 29 Nov | [[Shakshuka]]         |          | Novel           |",
        "| Mon 30 Nov | [[Dahl]]              | [[Naan]] | Double: cook    |",
        "| Tue 1 Dec  | [[Dahl]]              |          | Double: 2nd day |",
        "| Wed 2 Dec  | [[Dahl]]              | [[Naan]] | Double: cook    |",
        "| Thu 3 Dec  | [[Dahl]]              |          | Double: 2nd day |",
        "| Fri 4 Dec  | Free Day              |          |                 |",
        "",
        "## Staples this week",
        "- Skip: milk ×1",
        "- Ask Staples: peanut butter, oats ×2",
        "",
        "## Notes",
        "- Bent repeat window for Dahl (Wish).",
        "",
      ].join("\n"),
    );
    expect((await run(["vault", "check"])).code).toBe(0);
    const bundle = JSON.parse((await run(["bundle"], { now: "2026-11-28T10:00" })).stdout);
    expect(bundle.weekMenus.find((w: { weekStart: string }) => w.weekStart === "2026-11-28").days.slice(1, 3)).toEqual([
      { date: "2026-11-29", dinner: "Shakshuka", side: null, novel: true, double: null },
      { date: "2026-11-30", dinner: "Dahl", side: "Naan", novel: false, double: "cook" },
    ]);
  });

  test("a Novel Recipe cooked as a Double, and a week without one", async () => {
    const { run, vault } = await sandbox();
    const days = [...plan.days];
    days[1] = { dinner: "Vegetable Biryani" };
    days[2] = { dinner: "Shakshuka", side: "Naan", double: "cook", novel: true };
    days[3] = { dinner: "Shakshuka", double: "second" };

    const novelDouble = await run(["plan", "write", await writePlan(vault, { ...plan, days })]);
    const noNovel = await run(["plan", "write", await writePlan(vault, { weekStart: "2026-12-05", days: plan.days.map(() => ({ dinner: null })) })]);

    expect([novelDouble.code, noNovel.code]).toEqual([0, 0]);
    expect(await read(vault, "Week menus/Week 2026-11-28.md")).toContain("| Mon 30 Nov | [[Shakshuka]]         | [[Naan]] | Novel, Double: cook |");
    expect(await read(vault, "Week menus/Week 2026-12-05.md")).toMatch(/^---\nweek_start: 2026-12-05\nnovel:\nnovel_source:\nnovel_verdict:\n---\n/);
    expect(await read(vault, "Week menus/Week 2026-12-05.md")).toContain("## Staples this week\n\n## Notes\n");
  });

  test("takes a chosen Staple that has no AH product, which Basket filling adds as a note", async () => {
    const { run, vault } = await sandbox();
    const staples = await read(vault, "Staples.md");
    await writeFile(path.join(vault, "Staples.md"), `${staples.trimEnd()}\n| Tea | | 1 | Ask |\n`);

    const result = await run(["plan", "write", await writePlan(vault, { ...plan, staples: ["Ask Staples: tea"] })]);

    expect(result.stderr).toBe("");
    expect(result.code).toBe(0);
    expect(await read(vault, "Week menus/Week 2026-11-28.md")).toContain("## Staples this week\n- Ask Staples: tea\n");
  });

  test("refuses a plan that doesn't make a Week Menu, writing nothing", async () => {
    const { run, vault } = await sandbox();
    const refused = async (value: unknown) => {
      const result = await run(["plan", "write", await writePlan(vault, value)]);
      expect(result.code).toBe(1);
      return result.stderr;
    };
    const days = (change: (days: typeof plan.days) => void) => {
      const copy = structuredClone(plan.days);
      change(copy);
      return { ...plan, days: copy };
    };

    expect(await refused({ ...plan, weekStart: "2026-11-21" })).toMatch(/Week menus\/Week 2026-11-21\.md is already there/);
    expect(await refused({ ...plan, weekStart: "2026-11-27" })).toMatch(/2026-11-27 is not a Saturday/);
    expect(await refused({ ...plan, days: plan.days.slice(1) })).toMatch(/7 days, Saturday to Friday/);
    expect(await refused(days((d) => (d[3].dinner = "Vegetable Biryani")))).toMatch(/Tue 1 Dec: a Double 2nd day must follow the cook day of the same dinner/);
    expect(await refused(days((d) => (d[0] = { dinner: "Vegetable Biryani", novel: true })))).toMatch(/one Novel Recipe/);
    expect(await refused({ ...plan, staples: ["Skip: caviar"] })).toMatch(/"caviar" under Staples this week is not in Staples\.md/);
    await expect(read(vault, "Week menus/Week 2026-11-28.md")).rejects.toThrow(/ENOENT/);
  });
});

const read = (vault: string, file: string) => readFile(path.join(vault, file), "utf8");

describe("food recipe delete", () => {
  test("deletes a 👎 Novel Recipe and unlinks it in the Week Menus, which keep its name, verdict and source and still publish", async () => {
    const { run, vault } = await sandbox();
    await run(["plan", "verdict", "2026-11-21", "rejected"]);
    const weekBefore = await read(vault, "Week menus/Week 2026-11-21.md");

    const result = await run(["recipe", "delete", "Vegetable Biryani"]);

    expect(result.stderr).toBe("");
    expect(result.code).toBe(0);
    expect(result.stdout).toBe(
      "Deleted Meals/Vegetable Biryani.md\nUnlinked it in Week menus/Week 2026-11-14.md, Week menus/Week 2026-11-21.md\n",
    );
    await expect(read(vault, "Meals/Vegetable Biryani.md")).rejects.toThrow(/ENOENT/);
    const week = await read(vault, "Week menus/Week 2026-11-21.md");
    expect(week).toBe(weekBefore.replace("| [[Vegetable Biryani]] |", "| Vegetable Biryani     |"));
    expect(week).toContain('novel: "[[Vegetable Biryani]]"\nnovel_source: https://www.seriouseats.com/vegetable-biryani-5324853\nnovel_verdict: rejected\n');
    expect(await read(vault, "Week menus/Week 2026-11-14.md")).not.toContain("[[Vegetable Biryani]]");
    expect((await run(["vault", "check"])).code).toBe(0);
    const context = JSON.parse((await run(["plan", "context"], { now: "2026-11-26T20:00" })).stdout);
    expect(context.review).toMatchObject({ novel: "Vegetable Biryani", novelInVault: false });
    expect(context.rejectedSources).toEqual(["https://www.seriouseats.com/vegetable-biryani-5324853"]);
  });

  test("refuses a Recipe that isn't in the vault", async () => {
    const { run } = await sandbox();

    const result = await run(["recipe", "delete", "Pasta Pesto"]);

    expect(result.code).toBe(1);
    expect(result.stderr).toBe('No Recipe "Pasta Pesto" in Meals or Sides\n');
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
