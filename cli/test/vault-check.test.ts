import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, test } from "vitest";
import { sandbox } from "./harness.ts";

describe("food vault check", () => {
  test("passes the sample vault with no errors or warnings", async () => {
    const { run } = await sandbox();

    const result = await run(["vault", "check"]);

    expect(result.stderr).toBe("");
    expect(result.code).toBe(0);
    expect(result.stdout).toContain("0 errors, 0 warnings");
  });

  describe("errors", () => {
    test("a Week Menu that links a Recipe that doesn't exist", async () => {
      const { run, vault } = await sandbox();
      await edit(vault, "Week menus/Week 2026-11-21.md", "| [[Dahl]]              |          |                 |", "| [[Pasta Pesto]]       |          |                 |");

      const result = await run(["vault", "check"]);

      expect(result.code).toBe(1);
      expect(result.stdout).toMatch(/error .*Week menus\/Week 2026-11-21\.md: .*Sat 21 Nov.*\[\[Pasta Pesto\]\]/);
      expect(result.stdout).toContain("1 error,");
    });

    test("a Week Menu that links a Side that doesn't exist", async () => {
      const { run, vault } = await sandbox();
      await edit(vault, "Week menus/Week 2026-11-14.md", "| [[Dahl]]              | [[Naan]] | Double: cook    |\n| Tue", "| [[Dahl]]              | [[Roti]] | Double: cook    |\n| Tue");

      const result = await run(["vault", "check"]);

      expect(result.code).toBe(1);
      expect(result.stdout).toMatch(/error .*Week menus\/Week 2026-11-14\.md: .*Mon 16 Nov.*\[\[Roti\]\]/);
    });

    test("an italic amount in a Method step that doesn't parse", async () => {
      const { run, vault } = await sandbox();
      await edit(vault, "Meals/Dahl.md", "Stir in *400g* spinach", "Stir in *a big bag of* spinach");

      const result = await run(["vault", "check"]);

      expect(result.code).toBe(1);
      expect(result.stdout).toMatch(/error .*Meals\/Dahl\.md: .*step 3.*"a big bag of"/);
    });

    test("an italic ingredient amount that doesn't parse", async () => {
      const { run, vault } = await sandbox();
      await edit(vault, "Sides/Naan.md", "- *7g* active dry yeast", "- *one sachet* active dry yeast");

      const result = await run(["vault", "check"]);

      expect(result.code).toBe(1);
      expect(result.stdout).toMatch(/error .*Sides\/Naan\.md: .*"one sachet"/);
    });

    test("a Double cook day whose Recipe isn't double: true", async () => {
      const { run, vault } = await sandbox();
      await edit(vault, "Meals/Dahl.md", "double: true", "double: false");

      const result = await run(["vault", "check"]);

      expect(result.code).toBe(1);
      expect(result.stdout).toMatch(/error .*Week menus\/Week 2026-11-21\.md: .*Mon 23 Nov.*\[\[Dahl\]\].*double: true/);
      expect(result.stdout).toMatch(/error .*Week menus\/Week 2026-11-21\.md: .*Wed 25 Nov/);
      expect(result.stdout).toMatch(/error .*Week menus\/Week 2026-11-14\.md: .*Mon 16 Nov/);
    });

    test("a Week Menu whose Day can't be read, alongside the other problems", async () => {
      const { run, vault } = await sandbox();
      await edit(vault, "Week menus/Week 2026-11-14.md", "| Sun 15 Nov |", "| Day 2      |");
      await edit(vault, "Week menus/Week 2026-11-21.md", "[[Naan]]", "[[Roti]]");

      const result = await run(["vault", "check"]);

      expect(result.code).toBe(1);
      expect(result.stdout).toMatch(/error .*Week menus\/Week 2026-11-14\.md: .*"Day 2"/);
      expect(result.stdout).toMatch(/error .*Week menus\/Week 2026-11-21\.md: .*\[\[Roti\]\]/);
      expect(result.stderr).toBe("");
    });

    test("italics in the notes after the Method are not amounts", async () => {
      const { run, vault } = await sandbox();

      const result = await run(["vault", "check"]);

      expect(await readFile(path.join(vault, "Meals/Dahl.md"), "utf8")).toContain("for more *bite*");
      expect(result.code).toBe(0);
    });
  });
});

/** Replaces `from` with `to` in a vault note, failing if `from` isn't there. */
async function edit(vault: string, note: string, from: string, to: string): Promise<void> {
  const file = path.join(vault, note);
  const text = await readFile(file, "utf8");
  if (!text.includes(from)) throw new Error(`${note} has no ${JSON.stringify(from)}`);
  await writeFile(file, text.replace(from, to));
}
