import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, test } from "vitest";
import { sandbox } from "./harness.ts";

describe("food bundle", () => {
  test("produces the sample bundle that the Kitchen Display page tests use", async () => {
    const { run } = await sandbox();

    const result = await run(["bundle"], { now: "2026-11-20T18:00" });

    expect(result.code).toBe(0);
    await expect(result.stdout).toMatchFileSnapshot("../../samples/bundles/published-2026-11-20.json");
  });

  test("builds a schema-versioned display bundle stamped with the publish time", async () => {
    const { run } = await sandbox();

    const result = await run(["bundle"], { now: "2026-11-21T10:00" });

    expect(result.stderr).toBe("");
    expect(result.code).toBe(0);
    const bundle = JSON.parse(result.stdout);
    expect(bundle.schemaVersion).toBe(1);
    expect(bundle.publishedAt).toBe("2026-11-21T09:00:00.000Z");
  });

  test("holds every Week Menu that ends on or after today, with its days in order", async () => {
    const { bundle } = await sandbox();

    const onFriday = await bundle("2026-11-20T18:00");
    const onSaturday = await bundle("2026-11-21T10:00");

    expect(onFriday.weekMenus.map((w) => w.weekStart)).toEqual(["2026-11-14", "2026-11-21"]);
    expect(onSaturday.weekMenus.map((w) => w.weekStart)).toEqual(["2026-11-21"]);
    expect(onSaturday.weekMenus[0].days.map((d) => [d.date, d.dinner, d.side])).toEqual([
      ["2026-11-21", "Dahl", null],
      ["2026-11-22", "Vegetable Biryani", null],
      ["2026-11-23", "Dahl", "Naan"],
      ["2026-11-24", "Dahl", null],
      ["2026-11-25", "Dahl", "Naan"],
      ["2026-11-26", "Dahl", null],
      ["2026-11-27", null, null],
    ]);
  });

  test("keeps last week's Week Menu until 03:00 on Saturday, when the Kitchen Display moves to the new week", async () => {
    const { bundle } = await sandbox();

    const { weekMenus } = await bundle("2026-11-21T02:30");

    expect(weekMenus.map((w) => w.weekStart)).toEqual(["2026-11-14", "2026-11-21"]);
  });

  test("dates each dinner by the weekday in its Day column, not by its row", async () => {
    const { bundle, vault } = await sandbox();
    const note = path.join(vault, "Week menus/Week 2026-11-21.md");
    const text = await readFile(note, "utf8");
    const [sat, sun, mon] = text.split("\n").filter((l) => /^\| (Sat|Sun|Mon) /.test(l));
    await writeFile(note, text.replace(`${sat}\n${sun}\n${mon}\n`, `${mon}\n${sat}\n`));

    const { weekMenus } = await bundle("2026-11-21T10:00");

    expect(weekMenus[0].days.slice(0, 3).map((d) => [d.date, d.dinner, d.side])).toEqual([
      ["2026-11-21", "Dahl", null],
      ["2026-11-23", "Dahl", "Naan"],
      ["2026-11-24", "Dahl", null],
    ]);
    expect(weekMenus[0].days).toHaveLength(6);
  });

  test("names the Week Menu note when a Day can't be read", async () => {
    const { run, vault } = await sandbox();
    const note = path.join(vault, "Week menus/Week 2026-11-21.md");
    await writeFile(note, (await readFile(note, "utf8")).replace("| Sun 22 Nov |", "| Day 2      |"));

    const result = await run(["bundle"], { now: "2026-11-21T10:00" });

    expect(result.code).toBe(1);
    expect(result.stderr).toContain("Week 2026-11-21.md");
    expect(result.stderr).toContain(`"Day 2"`);
    expect(result.stderr).not.toContain("    at ");
  });

  test("marks the Novel Recipe's day and the Double Recipe's cook and 2nd days", async () => {
    const { bundle } = await sandbox();

    const { weekMenus } = await bundle("2026-11-21T10:00");

    expect(weekMenus[0].days.map((d) => [d.novel, d.double])).toEqual([
      [false, null],
      [true, null],
      [false, "cook"],
      [false, "second"],
      [false, "cook"],
      [false, "second"],
      [false, null],
    ]);
  });

  test("holds only the Recipes and Sides the Week Menus use", async () => {
    const { bundle, vault } = await sandbox();
    await writeFile(path.join(vault, "Sides/Lime rice.md"), "# Lime rice\n\n## Ingredients\n\n- *200 g* basmati rice\n");

    const { recipes } = await bundle("2026-11-21T10:00");

    expect(Object.keys(recipes).sort()).toEqual(["Dahl", "Naan", "Vegetable Biryani"]);
    expect(recipes["Vegetable Biryani"].title).toBe("Vegetable Biryani");
  });

  test("gives each Recipe its ingredient list, with the italic amounts as numbers and units", async () => {
    const { bundle } = await sandbox();

    const { recipes } = await bundle("2026-11-21T10:00");

    const dahl = recipes["Dahl"].ingredients;
    expect(dahl.map((g) => g.heading)).toEqual([null, "To serve"]);
    expect(dahl[0].items[0]).toEqual({ amount: { text: "300g", quantity: 300, unit: "g" }, text: "red split lentils" });
    expect(dahl[0].items[2]).toEqual({ amount: { text: "1 large", quantity: 1, unit: "large" }, text: "onion, finely chopped" });
    expect(dahl[0].items.at(-1)).toEqual({ amount: null, text: "salt and pepper" });
    expect(dahl[1].items[0]).toEqual({ amount: { text: "4 tbsp", quantity: 4, unit: "tbsp" }, text: "sunflower oil" });

    const biryani = recipes["Vegetable Biryani"].ingredients[0].items;
    expect(biryani[5]).toEqual({ amount: { text: "2½ tsp", quantity: 2.5, unit: "tsp" }, text: "kosher salt, divided, plus more to taste" });
    expect(biryani[15]).toEqual({ amount: { text: "½ tsp", quantity: 0.5, unit: "tsp" }, text: "ground turmeric" });
    expect(biryani[26]).toEqual({ amount: { text: "1 stick (5 cm)", quantity: 1, unit: "stick (5 cm)" }, text: "cinnamon" });

    const naan = recipes["Naan"].ingredients[0].items;
    expect(naan[5]).toEqual({ amount: { text: "1/2 tsp", quantity: 0.5, unit: "tsp" }, text: "salt" });
    expect(naan[7]).toEqual({ amount: null, text: "Some oil, for greasing the skillet" });
  });
});
