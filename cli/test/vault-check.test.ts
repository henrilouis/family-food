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

    test("a Week Menu dinner written as plain text, unless it is a 👎 Novel Recipe deleted from the vault", async () => {
      const { run, vault } = await sandbox();
      await edit(vault, "Week menus/Week 2026-11-21.md", "| [[Dahl]]              |          |                 |", "| Dahl                  |          |                 |");
      await run(["plan", "verdict", "2026-11-21", "rejected"]);
      await run(["recipe", "delete", "Vegetable Biryani"]);

      const result = await run(["vault", "check"]);

      expect(result.code).toBe(1);
      expect(result.stdout).toContain('error    Week menus/Week 2026-11-21.md: Sat 21 Nov has the dinner "Dahl" as plain text: link it ([[Dahl]]) or write Free Day\n');
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

    test("an italic amount that doesn't parse on a Method step's continuation line", async () => {
      const { run, vault } = await sandbox();
      await edit(vault, "Sides/Naan.md", "2. Divide the dough into 8 equal portions.", "2) Divide the dough into 8 equal portions,\n   using *a sharp* knife.");

      const result = await run(["vault", "check"]);

      expect(result.code).toBe(1);
      expect(result.stdout).toMatch(/error .*Sides\/Naan\.md: .*"a sharp"/);
    });

    test("italics in the notes after the Method are not amounts", async () => {
      const { run, vault } = await sandbox();

      const result = await run(["vault", "check"]);

      expect(await readFile(path.join(vault, "Meals/Dahl.md"), "utf8")).toContain("for more *bite*");
      expect(result.code).toBe(0);
    });
  });

  describe("warnings, which don't fail the check", () => {
    test("a Meal property outside the Meal property set", async () => {
      const { run, vault } = await sandbox();
      await edit(vault, "Meals/Dahl.md", "reviewed: true", "reviewed: true\nrating: 5");

      const result = await run(["vault", "check"]);

      expect(result.code).toBe(0);
      expect(result.stdout).toMatch(/warning .*Meals\/Dahl\.md: .*"rating"/);
      expect(result.stdout).toContain("0 errors, 1 warning");
    });

    test("a Meal with no cuisine", async () => {
      const { run, vault } = await sandbox();
      await edit(vault, "Meals/Dahl.md", "cuisine: Indian\n", "");
      await edit(vault, "Meals/Vegetable Biryani.md", "cuisine: Indian", "cuisine:");

      const result = await run(["vault", "check"]);

      expect(result.code).toBe(0);
      expect(result.stdout).toMatch(/warning .*Meals\/Dahl\.md: .*no cuisine/);
      expect(result.stdout).toMatch(/warning .*Meals\/Vegetable Biryani\.md: .*no cuisine/);
    });

    test("a cuisine or base outside the fixed lists", async () => {
      const { run, vault } = await sandbox();
      await edit(vault, "Meals/Dahl.md", "cuisine: Indian", "cuisine: Nepalese");
      await edit(vault, "Meals/Vegetable Biryani.md", "  - rice", "  - rice\n  - couscous");

      const result = await run(["vault", "check"]);

      expect(result.code).toBe(0);
      expect(result.stdout).toMatch(/warning .*Meals\/Dahl\.md: .*cuisine "Nepalese"/);
      expect(result.stdout).toMatch(/warning .*Meals\/Vegetable Biryani\.md: .*base "couscous"/);
      expect(result.stdout).toContain("0 errors, 2 warnings");
    });

    test("takes the fixed cuisine and base lists from docs/meal-properties.md", async () => {
      const doc = await readFile(path.join(import.meta.dirname, "../../docs/meal-properties.md"), "utf8");
      const listed = (property: string) => {
        const section = doc.split(/^## /m).find((s) => s.startsWith(`\`${property}\``)) ?? "";
        return [...section.matchAll(/^- (.+)$/gm)].map((m) => m[1].trim());
      };
      const cuisines = listed("cuisine");
      const bases = listed("base");
      expect(cuisines).toContain("Southeast Asian");
      expect(bases).toContain("bread/wrap");
      const { run, vault } = await sandbox();
      for (let i = 0; i < Math.max(cuisines.length, bases.length); i++) {
        const properties = `cuisine: ${cuisines[i % cuisines.length]}\nbase:\n  - ${bases[i % bases.length]}`;
        await writeFile(path.join(vault, `Meals/Meal ${i}.md`), `---\n${properties}\n---\n# Meal ${i}\n`);
      }

      const result = await run(["vault", "check"]);

      expect(result.stdout).toContain("0 errors, 0 warnings");
    });

    test("a Meal that serves more than 6, probably still written for two dinners", async () => {
      const { run, vault } = await sandbox();
      await edit(vault, "Meals/Dahl.md", "serves: 4", "serves: 8");
      await edit(vault, "Meals/Vegetable Biryani.md", "serves: 5", "serves: 6");

      const result = await run(["vault", "check"]);

      expect(result.code).toBe(0);
      expect(result.stdout).toMatch(/warning .*Meals\/Dahl\.md: .*serves 8/);
      expect(result.stdout).toContain("0 errors, 1 warning");
    });
  });

  describe("--json", () => {
    test("prints the errors and warnings as JSON for an agent, with the same exit code", async () => {
      const { run, vault } = await sandbox();
      await edit(vault, "Sides/Naan.md", "- *7g* active dry yeast", "- *one sachet* active dry yeast");
      await edit(vault, "Meals/Dahl.md", "serves: 4", "serves: 8");

      const result = await run(["vault", "check", "--json"]);

      expect(result.code).toBe(1);
      const check = JSON.parse(result.stdout);
      expect(check.errors).toEqual([{ file: "Sides/Naan.md", message: expect.stringContaining('"one sachet"') }]);
      expect(check.warnings).toEqual([{ file: "Meals/Dahl.md", message: expect.stringContaining("serves 8") }]);
    });
  });

  describe("--published", () => {
    test("checks only the Week Menus that would be published and the Recipes they use", async () => {
      const { run, vault } = await sandbox();
      await edit(vault, "Week menus/Week 2026-11-14.md", "[[Naan]]", "[[Roti]]");
      await writeFile(path.join(vault, "Meals/Pasta Pesto.md"), "---\nrating: 5\n---\n# Pasta Pesto\n\n## Method\n\n1. Cook *a lot of* pasta.\n");
      await edit(vault, "Meals/Vegetable Biryani.md", "cuisine: Indian", "cuisine: Nepalese");

      const published = await run(["vault", "check", "--published"], { now: "2026-11-21T10:00" });
      const whole = await run(["vault", "check"], { now: "2026-11-21T10:00" });

      expect(published.code).toBe(0);
      expect(published.stdout).not.toContain("Week 2026-11-14.md");
      expect(published.stdout).not.toContain("Pasta Pesto.md");
      expect(published.stdout).toMatch(/warning .*Meals\/Vegetable Biryani\.md: .*"Nepalese"/);
      expect(published.stdout).toContain("0 errors, 1 warning");
      expect(whole.code).toBe(1);
      expect(whole.stdout).toContain("Week 2026-11-14.md");
      expect(whole.stdout).toContain("Pasta Pesto.md");
    });

    test("still checks last week's Week Menu on Friday, while the Kitchen Display shows it", async () => {
      const { run, vault } = await sandbox();
      await edit(vault, "Week menus/Week 2026-11-14.md", "[[Naan]]", "[[Roti]]");

      const result = await run(["vault", "check", "--published"], { now: "2026-11-20T18:00" });

      expect(result.code).toBe(1);
      expect(result.stdout).toMatch(/error .*Week menus\/Week 2026-11-14\.md: .*\[\[Roti\]\]/);
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
