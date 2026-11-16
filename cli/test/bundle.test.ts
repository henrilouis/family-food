import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, test } from "vitest";
import type { Step } from "../../bundle/bundle.ts";
import { sandbox } from "./harness.ts";

/** A Method step with each marked span in brackets: "Rinse [300g red split lentils] under …". */
const marked = (step: Step) => step.map((part) => (typeof part === "string" ? part : `[${[part.amount.text, part.ingredient].filter(Boolean).join(" ")}]`)).join("");

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

  test("includes next week's Week Menu, with its markers, once it is Locked", async () => {
    const { bundle, vault } = await sandbox();
    const thisWeek = await readFile(path.join(vault, "Week menus/Week 2026-11-21.md"), "utf8");
    const nextWeek = thisWeek
      .replace("week_start: 2026-11-21", "week_start: 2026-11-28")
      .replace(/\| (Sat|Sun|Mon|Tue|Wed|Thu|Fri) \d+ Nov/g, "| $1");
    await writeFile(path.join(vault, "Week menus/Week 2026-11-28.md"), nextWeek);

    const { weekMenus } = await bundle("2026-11-26T18:00");

    expect(weekMenus.map((w) => w.weekStart)).toEqual(["2026-11-21", "2026-11-28"]);
    expect(weekMenus[1].days.map((d) => [d.date, d.novel, d.double])).toEqual([
      ["2026-11-28", false, null],
      ["2026-11-29", true, null],
      ["2026-11-30", false, "cook"],
      ["2026-12-01", false, "second"],
      ["2026-12-02", false, "cook"],
      ["2026-12-03", false, "second"],
      ["2026-12-04", false, null],
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

  test("gives each Recipe its Method steps, marking each amount and the ingredient words after it", async () => {
    const { bundle } = await sandbox();

    const { recipes } = await bundle("2026-11-21T10:00");

    const dahl = recipes["Dahl"].method.map(marked);
    expect(dahl).toHaveLength(3);
    expect(dahl[1]).toBe(
      "Heat [4 tbsp sunflower oil] in a small frying pan and fry [10 lime leaves] and [1 tsp mustard seeds] for 1 minute. " +
        "Remove from heat and set aside. Warm [1 naan] according to package instructions.",
    );
    expect(dahl[0]).toMatch(/^Rinse \[300g red split lentils\] under running water and drain well\. Heat \[1 tbsp sunflower oil\] in a pan/);
    expect(dahl[0]).toContain("fry [1 large onion] for 3–4 minutes. Add [2 tsp garam masala], [2 tsp curry powder], [1 tsp paprika],");
    expect(dahl[0]).toContain("[2 garlic cloves], [1 red pepper], [1 green pepper], [1 carrot] and [2 tomatoes] and fry");
  });

  test("marks the steps of every sample Recipe and Side", async () => {
    const { bundle } = await sandbox();

    const { recipes } = await bundle("2026-11-21T10:00");

    const biryani = recipes["Vegetable Biryani"].method.map(marked);
    expect(biryani).toHaveLength(7);
    expect(biryani[0]).toBe("Warm [60 ml milk] until steaming. Grind half of [20 strands saffron], add all the saffron to the milk, cover and steep.");
    expect(biryani[4]).toBe(
      "Boil the rice with [960 ml water], [60 ml lemon juice], [1½ tsp salt], [3 cardamom pods], [1 stick cinnamon], [4 cloves], " +
        "[2 large bay leaves] and [5 ml ghee] for 2 minutes. Drain; it should be only partly cooked.",
    );
    const naan = recipes["Naan"].method.map(marked);
    expect(naan).toHaveLength(4);
    expect(naan[0]).toMatch(/^In a small bowl, stir \[1 tsp sugar\], \[120ml warm water\] and \[7g yeast\] together\./);
    expect(naan[0]).toContain("Put [270g flour] on a flat surface");
    expect(naan[0]).toContain("Add the yeast mixture, [125g yoghurt], [1/2 tsp salt] and [1 tbsp oil], and knead");
    expect(naan[1]).toBe('Divide the dough into 8 equal portions. Roll each into an 8" circle with a rolling pin.');
    expect(naan[3]).toBe("Brush the naan with [3 tbsp melted butter] and serve warm.");
  });

  test("keeps the amounts in a step as numbers and units, for doubling", async () => {
    const { bundle } = await sandbox();

    const { recipes } = await bundle("2026-11-21T10:00");

    expect(recipes["Vegetable Biryani"].method[3].filter((part) => typeof part !== "string").slice(3, 5)).toEqual([
      { amount: { text: "1½ tsp", quantity: 1.5, unit: "tsp" }, ingredient: "garam masala" },
      { amount: { text: "1", quantity: 1, unit: "" }, ingredient: "star anise" },
    ]);
  });

  test("ends an ingredient span at a joining word or a word the ingredient list doesn't have", async () => {
    const { bundle, vault } = await sandbox();
    await writeFile(
      path.join(vault, "Sides/Lime rice.md"),
      [
        "# Lime rice",
        "",
        "## Ingredients",
        "",
        "- *200 g* basmati rice, rinsed in cold water",
        "- *1* lime, zest and juice",
        "- *1 tsp* salt, for the water",
        "- *2* spring onions",
        "",
        "## Method",
        "",
        "1. Boil *200 g* basmati rice in water with *1 tsp* salt for the pan, 12 minutes.",
        "2. Stir in the zest of *1* lime and the juice, then *2* spring onion sliced thin",
        "   and serve.",
        "",
      ].join("\n"),
    );
    const menu = path.join(vault, "Week menus/Week 2026-11-21.md");
    await writeFile(menu, (await readFile(menu, "utf8")).replace("| [[Naan]] |", "| [[Lime rice]] |"));

    const { recipes } = await bundle("2026-11-21T10:00");

    expect(recipes["Lime rice"].method.map(marked)).toEqual([
      "Boil [200 g basmati rice] in water with [1 tsp salt] for the pan, 12 minutes.",
      "Stir in the zest of [1 lime] and the juice, then [2 spring onion] sliced thin and serve.",
    ]);
  });

  test("marks an ingredient in a step whether it says it in the singular or the plural", async () => {
    const { bundle, vault } = await sandbox();
    await writeFile(
      path.join(vault, "Sides/Aubergine bake.md"),
      [
        "# Aubergine bake",
        "",
        "## Ingredients",
        "",
        "- *2* aubergines",
        "- *3* garlic cloves",
        "- *50 g* olives",
        "- *100 g* cherry tomatoes",
        "- *1 tbsp* berries",
        "",
        "## Method",
        "",
        "1. Slice *1* aubergine with *1* garlic clove and *2* garlic cloves.",
        "2. Add *1* olive, *49 g* olives, *1* cherry tomato and *1 tsp* berry.",
        "",
      ].join("\n"),
    );
    const menu = path.join(vault, "Week menus/Week 2026-11-21.md");
    await writeFile(menu, (await readFile(menu, "utf8")).replace("| [[Naan]] |", "| [[Aubergine bake]] |"));

    const { recipes } = await bundle("2026-11-21T10:00");

    expect(recipes["Aubergine bake"].method.map(marked)).toEqual([
      "Slice [1 aubergine] with [1 garlic clove] and [2 garlic cloves].",
      "Add [1 olive], [49 g olives], [1 cherry tomato] and [1 tsp berry].",
    ]);
  });

  test("gives each Recipe its notes and source", async () => {
    const { bundle } = await sandbox();

    const { recipes } = await bundle("2026-11-21T10:00");

    expect(recipes["Dahl"].notes).toEqual([
      "Variations: you can vary endlessly by using different vegetables or spices. Replace the spinach with roughly chopped kale " +
        "or cavolo nero for more bite. Also try brown lentils or yellow split peas instead of dried red split lentils for a different flavour.",
    ]);
    expect(recipes["Dahl"].source).toBeNull();
    expect(recipes["Vegetable Biryani"].notes).toEqual([]);
    expect(recipes["Vegetable Biryani"].source).toBe("https://www.seriouseats.com/vegetable-biryani-5324853");
    expect(recipes["Naan"].source).toBeNull();
  });

  test("names the Recipe and the step when a step's italic amount doesn't start with a number", async () => {
    const { run, vault } = await sandbox();
    const dahl = path.join(vault, "Meals/Dahl.md");
    await writeFile(dahl, (await readFile(dahl, "utf8")).replace("*400g* spinach", "*a handful of* spinach"));

    const result = await run(["bundle"], { now: "2026-11-21T10:00" });

    expect(result.code).toBe(1);
    expect(result.stderr).toContain("Dahl.md");
    expect(result.stderr).toContain(`"a handful of"`);
    expect(result.stderr).not.toContain("    at ");
  });
});
