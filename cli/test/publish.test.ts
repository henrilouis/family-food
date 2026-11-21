import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, test } from "vitest";
import { sandbox } from "./harness.ts";

const readJson = async <T>(file: string): Promise<T> => JSON.parse(await readFile(file, "utf8"));

/** A note body as the lines a person sees: one per block, tags and entities gone. */
const noteText = (html: string) =>
  html
    .replace(/\n|<br>/g, "")
    .replace(/<\/(div|li)>/g, "\n")
    .replace(/<[^>]*>/g, "")
    .replace(/&amp;/g, "&")
    .split("\n")
    .map((line) => line.trim())
    .filter((line, index, lines) => line !== "" || lines[index - 1] !== "")
    .join("\n")
    .trim();

const thisWeek = async (folder: string) =>
  noteText((await readJson<Record<string, string>>(path.join(folder, "notes.json")))["This week"]);

describe("food publish", () => {
  test("rewrites This week with the current and upcoming Week Menus", async () => {
    const { run, fake } = await sandbox();
    const notes = await fake("apple-notes");
    await writeFile(path.join(notes, "notes.json"), JSON.stringify({ "This week": "<div><h1>This week</h1></div><div>Old week</div>" }));

    const result = await run(["publish"], { now: "2026-11-20T10:00" });

    expect(result.code).toBe(0);
    expect(result.stdout).toContain("This week note updated.");
    expect(await thisWeek(notes)).toBe(
      [
        "This week",
        "Published Fri 20 Nov 10:00 by food publish. Changes made here are overwritten.",
        "",
        "Week of Sat 14 Nov",
        "Sat 14 Nov: Vegetable Biryani",
        "Sun 15 Nov: Vegetable Biryani",
        "Mon 16 Nov: Dahl with Naan (cook double)",
        "Tue 17 Nov: Dahl (leftovers)",
        "Wed 18 Nov: Free Day",
        "Thu 19 Nov: Dahl with Naan (cook double)",
        "Fri 20 Nov: Dahl (leftovers)",
        "",
        "Week of Sat 21 Nov",
        "Sat 21 Nov: Dahl",
        "Sun 22 Nov: Vegetable Biryani (new recipe)",
        "Mon 23 Nov: Dahl with Naan (cook double)",
        "Tue 24 Nov: Dahl (leftovers)",
        "Wed 25 Nov: Dahl with Naan (cook double)",
        "Thu 26 Nov: Dahl (leftovers)",
        "Fri 27 Nov: Free Day",
      ].join("\n"),
    );
  });

  test("names a 👎 Novel Recipe deleted from the vault as deleted", async () => {
    const { run, fake } = await sandbox();
    const notes = await fake("apple-notes");
    await run(["plan", "verdict", "2026-11-21", "rejected"]);
    await run(["recipe", "delete", "Vegetable Biryani"]);

    const result = await run(["publish"], { now: "2026-11-22T10:00" });

    expect(result.code).toBe(0);
    expect(await thisWeek(notes)).toContain("Sun 22 Nov: Vegetable Biryani (deleted, new recipe)\n");
  });

  test("says when there is no Week Menu yet", async () => {
    const { run, fake } = await sandbox();
    const notes = await fake("apple-notes");

    const result = await run(["publish"], { now: "2026-11-28T10:00" });

    expect(result.code).toBe(0);
    expect(await thisWeek(notes)).toBe(
      ["This week", "Published Sat 28 Nov 10:00 by food publish. Changes made here are overwritten.", "", "No Week Menu yet."].join("\n"),
    );
  });

  test("a This week write that fails is skipped with a warning and the publish still succeeds", async () => {
    const { run, fake } = await sandbox();
    const notes = await fake("apple-notes");
    await writeFile(path.join(notes, "fake.json"), JSON.stringify({ writes: "fail" }));

    const result = await run(["publish"], { now: "2026-11-21T10:00" });

    expect(result.code).toBe(0);
    expect(result.stderr).toBe("");
    expect(result.stdout).toMatch(/^Warning: This week note not updated: .*refused/m);
    expect(result.stdout).not.toContain("This week note updated.");
  });

  test("a vault check error leaves This week alone", async () => {
    const { run, fake, vault } = await sandbox();
    const notes = await fake("apple-notes");
    const before = { "This week": "<div><h1>This week</h1></div><div>Last good week</div>" };
    await writeFile(path.join(notes, "notes.json"), JSON.stringify(before));
    const dahl = path.join(vault, "Meals/Dahl.md");
    await writeFile(dahl, (await readFile(dahl, "utf8")).replace("double: true", "double: false"));

    const result = await run(["publish"], { now: "2026-11-21T10:00" });

    expect(result.code).toBe(1);
    expect(result.stdout).toMatch(/error .*Week menus\/Week 2026-11-21\.md: .*Mon 23 Nov.*double: true/);
    expect(result.stdout).toContain("Not published");
    expect(await readJson(path.join(notes, "notes.json"))).toEqual(before);
  });

  test("sends a Week Menu until its Friday is over", async () => {
    const { run, fake } = await sandbox();
    const notes = await fake("apple-notes");

    await run(["publish"], { now: "2026-11-20T23:30" });
    const friday = await thisWeek(notes);
    await run(["publish"], { now: "2026-11-21T00:30" });
    const saturday = await thisWeek(notes);

    expect(friday).toContain("Week of Sat 14 Nov");
    expect(saturday).not.toContain("Week of Sat 14 Nov");
    expect(saturday).toContain("Week of Sat 21 Nov");
  });

  test("dates each dinner by the weekday in its Day column, not by its row", async () => {
    const { run, fake, vault } = await sandbox();
    const notes = await fake("apple-notes");
    const note = path.join(vault, "Week menus/Week 2026-11-21.md");
    const text = await readFile(note, "utf8");
    const [sat, sun, mon] = text.split("\n").filter((l) => /^\| (Sat|Sun|Mon) /.test(l));
    await writeFile(note, text.replace(`${sat}\n${sun}\n${mon}\n`, `${mon}\n${sat}\n`));

    await run(["publish"], { now: "2026-11-21T10:00" });

    expect(await thisWeek(notes)).toContain(
      ["Week of Sat 21 Nov", "Sat 21 Nov: Dahl", "Mon 23 Nov: Dahl with Naan (cook double)", "Tue 24 Nov: Dahl (leftovers)"].join("\n"),
    );
  });
});

describe("Obsidian on this Mac", () => {
  const closed = async (fake: (adapter: "obsidian") => Promise<string>) =>
    writeFile(path.join(await fake("obsidian"), "fake.json"), JSON.stringify({ running: false }));

  test("publish warns when Obsidian isn't running, and still publishes", async () => {
    const { run, fake } = await sandbox();
    await fake("apple-notes");
    await closed(fake);

    const result = await run(["publish"], { now: "2026-11-21T10:00" });

    expect(result.code).toBe(0);
    expect(result.stdout).toMatch(/^Warning: Obsidian isn't running on this Mac\..*Open Obsidian and let it sync\.$/m);
    expect(result.stdout).toContain("This week note updated.");
  });

  test("plan context and basket lines warn on stderr and keep their JSON whole", async () => {
    const { run, fake } = await sandbox();
    await closed(fake);

    for (const args of [["plan", "context"], ["basket", "lines", "--week", "2026-11-21"]]) {
      const result = await run(args, { now: "2026-11-20T10:00" });

      expect(result.code).toBe(0);
      expect(result.stderr).toMatch(/^Warning: Obsidian isn't running on this Mac\./);
      expect(() => JSON.parse(result.stdout)).not.toThrow();
    }
  });

  test("no warning while Obsidian runs", async () => {
    const { run, fake } = await sandbox();
    await fake("apple-notes");
    await fake("obsidian");

    const publish = await run(["publish"], { now: "2026-11-21T10:00" });
    const context = await run(["plan", "context"], { now: "2026-11-20T10:00" });

    expect(publish.stdout).not.toContain("Obsidian");
    expect(context.stderr).toBe("");
  });
});
