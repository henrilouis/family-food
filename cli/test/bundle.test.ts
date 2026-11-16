import { writeFile } from "node:fs/promises";
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
    const { run } = await sandbox();

    const onFriday = JSON.parse((await run(["bundle"], { now: "2026-11-20T18:00" })).stdout);
    const onSaturday = JSON.parse((await run(["bundle"], { now: "2026-11-21T10:00" })).stdout);

    expect(onFriday.weekMenus.map((w: { weekStart: string }) => w.weekStart)).toEqual(["2026-11-14", "2026-11-21"]);
    expect(onSaturday.weekMenus.map((w: { weekStart: string }) => w.weekStart)).toEqual(["2026-11-21"]);
    expect(onSaturday.weekMenus[0].days.map((d: { date: string; dinner: string; side: string }) => [d.date, d.dinner, d.side])).toEqual([
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
    const { run } = await sandbox();

    const bundle = JSON.parse((await run(["bundle"], { now: "2026-11-21T02:30" })).stdout);

    expect(bundle.weekMenus.map((w: { weekStart: string }) => w.weekStart)).toEqual(["2026-11-14", "2026-11-21"]);
  });

  test("marks the Novel Recipe's day and the Double cook and 2nd days", async () => {
    const { run } = await sandbox();

    const { weekMenus } = JSON.parse((await run(["bundle"], { now: "2026-11-21T10:00" })).stdout);

    expect(weekMenus[0].days.map((d: { novel: boolean; double: string | null }) => [d.novel, d.double])).toEqual([
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
    const { run, vault } = await sandbox();
    await writeFile(path.join(vault, "Sides/Lime rice.md"), "# Lime rice\n\n## Ingredients\n\n- *200 g* basmati rice\n");

    const bundle = JSON.parse((await run(["bundle"], { now: "2026-11-21T10:00" })).stdout);

    expect(Object.keys(bundle.recipes).sort()).toEqual(["Dahl", "Naan", "Vegetable Biryani"]);
    expect(bundle.recipes["Vegetable Biryani"].title).toBe("Vegetable Biryani");
  });

  test("gives each Recipe its ingredient list, with the italic amounts as numbers and units", async () => {
    const { run } = await sandbox();

    const { recipes } = JSON.parse((await run(["bundle"], { now: "2026-11-21T10:00" })).stdout);

    const dahl = recipes["Dahl"].ingredients;
    expect(dahl.map((g: { heading: string | null }) => g.heading)).toEqual([null, "To serve"]);
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
