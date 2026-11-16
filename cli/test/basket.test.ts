import { readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, test } from "vitest";
import { sandbox } from "./harness.ts";

const repo = path.resolve(import.meta.dirname, "../..");

// A product as AH's REST search returns it; the fake AH's catalogue holds these.
type AhProduct = { webshopId: number; title: string; priceBeforeBonus: number; currentPrice?: number };

/** One line of the fill-basket skill's list: an ingredient line of a Recipe and the AH product it matched. */
type Match = { recipe: string; line: string; product?: number | null; packFraction?: number; kind?: string; title?: string };

type FakeBasket = { products: { id: number; quantity: number }[]; notes: { description: string; quantity: number }[] };

const WEEK = "2026-11-28";
const DAYS = ["Sat 28 Nov", "Sun 29 Nov", "Mon 30 Nov", "Tue 1 Dec", "Wed 2 Dec", "Thu 3 Dec", "Fri 4 Dec"];

/**
 * A sandbox with the fake AH (logged in, holding `catalogue`) and no Staples, so a test sees only what it sets up.
 */
async function basketBox(catalogue: AhProduct[]) {
  const box = await sandbox();
  const ah = await box.fake("ah");
  await writeFile(
    path.join(ah, "products.json"),
    JSON.stringify(catalogue.map((p) => ({ brand: "AH", salesUnitSize: "1 st", isOrderable: true, isSponsored: false, ...p }))),
  );
  const login = await box.run(["ah", "login"]);
  if (login.code !== 0) throw new Error(`food ah login failed:\n${login.stderr}`);
  await rm(path.join(box.vault, "Staples.md"));

  /** Writes a Meal with these ingredient lines (markdown list items without the "- "). */
  const recipe = (name: string, lines: string[]) =>
    writeFile(
      path.join(box.vault, "Meals", `${name}.md`),
      `---\nserves: 4\ndouble: true\n---\n# ${name}\n\n## Ingredients\n\n${lines.map((l) => `- ${l}`).join("\n")}\n\n## Method\n\n1. Cook.\n`,
    );

  /** Writes the Week Menu of Sat 28 Nov: one [dinner, side, note] row per day from Saturday, and its Staples section. */
  const weekMenu = (rows: [string, string, string][], staplesThisWeek: string[] = []) => {
    const cell = (name: string) => (name && name !== "Free Day" ? `[[${name}]]` : name);
    const table = rows.map(([dinner, side, note], i) => `| ${DAYS[i]} | ${cell(dinner)} | ${cell(side)} | ${note} |`);
    const staples = staplesThisWeek.length ? `\n## Staples this week\n${staplesThisWeek.map((s) => `- ${s}`).join("\n")}\n` : "";
    return writeFile(
      weekMenuFile(),
      `---\nweek_start: ${WEEK}\n---\n# Week Menu ${WEEK}\n\n| Day | Dinner | Side | Note |\n|---|---|---|---|\n${table.join("\n")}\n${staples}`,
    );
  };
  const weekMenuFile = () => path.join(box.vault, "Week menus", `Week ${WEEK}.md`);

  const staples = (rows: [string, string, number, string][]) =>
    writeFile(
      path.join(box.vault, "Staples.md"),
      `# Staples\n\n| Staple | AH product | Quantity | Kind |\n|---|---|---|---|\n${rows.map((r) => `| ${r.join(" | ")} |`).join("\n")}\n`,
    );

  /** Seeds Mijn lijst in the fake AH. */
  const seedBasket = (basket: Partial<FakeBasket>) =>
    writeFile(path.join(ah, "basket.json"), JSON.stringify({ products: [], notes: [], ...basket }));
  const basket = async (): Promise<FakeBasket> => JSON.parse(await readFile(path.join(ah, "basket.json"), "utf8"));

  /** Every write the fake AH received, in order; [] when none. */
  const requests = async (): Promise<{ add: FakeBasket }[]> =>
    JSON.parse(await readFile(path.join(ah, "basket-requests.json"), "utf8").catch(() => "[]"));

  /** Sets the fake AH's mode: "order placed", "login expired" or "AH down". */
  const mode = (state: Record<string, unknown>) => writeFile(path.join(ah, "mode.json"), JSON.stringify(state));

  /** Runs `food basket fill` for the week of 28 Nov with the skill's matches. */
  const fill = async (matches: Match[], haveAtHome: number[] = []) => {
    const input = path.join(box.configDir, "..", "matches.json");
    await writeFile(input, JSON.stringify({ lines: matches, haveAtHome }));
    return box.run(["basket", "fill", "--week", WEEK, input], { now: "2026-11-26T20:00" });
  };

  /** The Week Menu's `## Basket` section, up to the end of the note. */
  const basketSection = async () => {
    const note = await readFile(weekMenuFile(), "utf8");
    return note.slice(note.indexOf("## Basket"));
  };

  /** Changes the Week Menu's days by hand after a fill, keeping its `## Basket` section. */
  const changeMenu = async (rows: [string, string, string][]) => {
    const section = await basketSection();
    await weekMenu(rows);
    await writeFile(weekMenuFile(), `${await readFile(weekMenuFile(), "utf8")}\n${section}`);
  };

  return { ...box, ah, recipe, weekMenu, changeMenu, weekMenuFile, staples, seedBasket, basket, requests, mode, fill, basketSection };
}

const quantities = (basket: FakeBasket) => Object.fromEntries(basket.products.map((p) => [p.id, p.quantity]));

describe("food basket fill", () => {
  test("adds each matched product to Mijn lijst, rounded up to whole packs", async () => {
    const box = await basketBox([
      { webshopId: 1, title: "AH Spaghetti 500 g", priceBeforeBonus: 1.29 },
      { webshopId: 2, title: "AH Passata 500 g", priceBeforeBonus: 0.99 },
    ]);
    await box.recipe("Pasta", ["*300g* spaghetti", "*700g* passata"]);
    await box.weekMenu([["Pasta", "", ""], ["Free Day", "", ""]]);

    const result = await box.fill([
      { recipe: "Pasta", line: "300g spaghetti", product: 1, packFraction: 0.6, kind: "Cupboard Ingredient" },
      { recipe: "Pasta", line: "700g passata", product: 2, packFraction: 1.4, kind: "Cupboard Ingredient" },
    ]);

    expect(result.stderr).toBe("");
    expect(result.code).toBe(0);
    expect(quantities(await box.basket())).toEqual({ 1: 1, 2: 2 });
  });

  test("buys a Recipe ×2 on a Double cook day and nothing for a Double 2nd day or the Free Day", async () => {
    const box = await basketBox([
      { webshopId: 1, title: "AH Spaghetti 500 g", priceBeforeBonus: 1.29 },
      { webshopId: 2, title: "AH Kokosmelk 400 ml", priceBeforeBonus: 1.49 },
      { webshopId: 3, title: "AH Basmati rijst 1 kg", priceBeforeBonus: 2.99 },
    ]);
    await box.recipe("Pasta", ["*500g* spaghetti"]);
    await box.recipe("Curry", ["*400ml* coconut milk"]);
    await box.recipe("Rice", ["*1 kg* basmati rice"]);
    await box.weekMenu([
      ["Pasta", "", ""],
      ["Free Day", "", ""],
      ["Curry", "Rice", "Double: cook"],
      ["Curry", "", "Double: 2nd day"],
      ["Curry", "", "Double: cook"],
      ["Curry", "", "Double: 2nd day"],
    ]);

    const result = await box.fill([
      { recipe: "Pasta", line: "500g spaghetti", product: 1, packFraction: 1, kind: "Cupboard Ingredient" },
      { recipe: "Curry", line: "400ml coconut milk", product: 2, packFraction: 1, kind: "Cupboard Ingredient" },
      { recipe: "Rice", line: "1 kg basmati rice", product: 3, packFraction: 1, kind: "Cupboard Ingredient" },
    ]);

    expect(result.code).toBe(0);
    expect(quantities(await box.basket())).toEqual({ 1: 1, 2: 4, 3: 2 });
  });

  test("sums a product across the week's Recipes before rounding up to whole packs", async () => {
    const box = await basketBox([{ webshopId: 1, title: "AH Rode linzen 500 g", priceBeforeBonus: 1.79 }]);
    await box.recipe("Dahl", ["*200g* red lentils"]);
    await box.recipe("Soup", ["*200g* red lentils"]);
    await box.weekMenu([["Dahl", "", ""], ["Soup", "", ""]]);

    const result = await box.fill([
      { recipe: "Dahl", line: "200g red lentils", product: 1, packFraction: 0.4, kind: "Cupboard Ingredient" },
      { recipe: "Soup", line: "200g red lentils", product: 1, packFraction: 0.4, kind: "Cupboard Ingredient" },
    ]);

    expect(result.code).toBe(0);
    expect(quantities(await box.basket())).toEqual({ 1: 1 });
  });

  test("rounds Fresh items down when no more than 10% over a whole pack, and everything else up", async () => {
    const box = await basketBox([
      { webshopId: 1, title: "AH Spinazie 400 g", priceBeforeBonus: 2.19 },
      { webshopId: 2, title: "AH Uien 1 kg", priceBeforeBonus: 1.39 },
      { webshopId: 3, title: "AH Kokosmelk 400 ml", priceBeforeBonus: 1.49 },
    ]);
    await box.recipe("Saag", ["*432g* spinach", "*3 large* onions", "*420ml* coconut milk"]);
    await box.weekMenu([["Saag", "", ""]]);

    const result = await box.fill([
      { recipe: "Saag", line: "432g spinach", product: 1, packFraction: 1.08, kind: "Fresh" },
      { recipe: "Saag", line: "3 large onions", product: 2, packFraction: 1.2, kind: "Fresh" },
      { recipe: "Saag", line: "420ml coconut milk", product: 3, packFraction: 1.05, kind: "Cupboard Ingredient" },
    ]);

    expect(result.code).toBe(0);
    expect(quantities(await box.basket())).toEqual({ 1: 1, 2: 2, 3: 2 });
  });

  test("adds the Weekly Staples and this week's Staple changes, summed with the Recipes before rounding", async () => {
    const box = await basketBox([
      { webshopId: 1, title: "AH Halfvolle melk 1 l", priceBeforeBonus: 1.15 },
      { webshopId: 2, title: "AH Eieren 10 stuks", priceBeforeBonus: 3.49 },
      { webshopId: 3, title: "AH Griekse yoghurt 1 kg", priceBeforeBonus: 3.99 },
      { webshopId: 4, title: "AH Pindakaas 1 kg", priceBeforeBonus: 5.49 },
      { webshopId: 5, title: "AH Havermout 1 kg", priceBeforeBonus: 1.89 },
      { webshopId: 6, title: "AH Croissants", priceBeforeBonus: 2.49 },
    ]);
    await box.staples([
      ["Milk", "AH Halfvolle melk 1 l (1)", 3, "Weekly"],
      ["Eggs", "AH Eieren 10 stuks (2)", 1, "Weekly"],
      ["Greek yoghurt", "AH Griekse yoghurt 1 kg (3)", 2, "Weekly"],
      ["Peanut butter", "AH Pindakaas 1 kg (4)", 1, "Ask"],
      ["Oats", "AH Havermout 1 kg (5)", 1, "Ask"],
      ["Croissants", "AH Croissants (6)", 1, "Ask"],
    ]);
    await box.recipe("Shakshuka", ["*1* egg"]);
    await box.weekMenu(
      [["Shakshuka", "", ""]],
      ["Skip: milk ×1", "Skip: greek yoghurt", "Extra: eggs ×1", "Ask Staples: peanut butter, oats ×2"],
    );

    const result = await box.fill([{ recipe: "Shakshuka", line: "1 egg", product: 2, packFraction: 0.05, kind: "Fresh" }]);

    expect(result.stderr).toBe("");
    expect(result.code).toBe(0);
    expect(quantities(await box.basket())).toEqual({ 1: 2, 2: 2, 4: 1, 5: 2 });
  });

  test("reads Staples with the webshop id in its own AH id column, as the Recipe Vault keeps them", async () => {
    const box = await basketBox([
      { webshopId: 1, title: "AH Halfvolle melk 1 l", priceBeforeBonus: 1.15 },
      { webshopId: 2, title: "AH Eieren 10 stuks", priceBeforeBonus: 3.49 },
    ]);
    await writeFile(
      path.join(box.vault, "Staples.md"),
      [
        "| Staple | AH product | AH id | Quantity | Kind |",
        "|---|---|---|---|---|",
        "| Milk | AH Halfvolle melk 1 l | 1 | 2 | Weekly |",
        "| Eggs | AH Eieren 10 stuks | 2 | 1 | Ask |",
        "| Tea | | | 1 | Ask |",
        "",
      ].join("\n"),
    );
    await box.recipe("Shakshuka", ["*1* egg"]);
    const match = { recipe: "Shakshuka", line: "1 egg", product: 2, packFraction: 0.05, kind: "Fresh" };

    await box.weekMenu([["Shakshuka", "", ""]], ["Ask Staples: eggs"]);
    const result = await box.fill([match]);

    expect(result.stderr).toBe("");
    expect(quantities(await box.basket())).toEqual({ 1: 2, 2: 1 });
  });

  test("adds a chosen Staple without an AH product to Mijn lijst as a free-text note and reports it", async () => {
    const box = await basketBox([{ webshopId: 1, title: "AH Halfvolle melk 1 l", priceBeforeBonus: 1.15 }]);
    await box.staples([
      ["Milk", "AH Halfvolle melk 1 l (1)", 2, "Weekly"],
      ["Tea", "", 1, "Ask"],
      ["Baby pouches", "", 6, "Weekly"],
    ]);
    await box.recipe("Toast", ["bread"]);
    await box.weekMenu([["Toast", "", ""]], ["Ask Staples: tea ×2"]);

    const result = await box.fill([{ recipe: "Toast", line: "bread", product: null }]);

    expect(result.stderr).toBe("");
    expect(result.code).toBe(0);
    expect(quantities(await box.basket())).toEqual({ 1: 2 });
    expect((await box.basket()).notes).toEqual([
      { description: "bread", quantity: 1 },
      { description: "Baby pouches (Staple ×6)", quantity: 1 },
      { description: "Tea (Staple ×2)", quantity: 1 },
    ]);
    expect(result.stdout).toContain("Unmatched, added as notes:\n- bread\n- Baby pouches (Staple ×6)\n- Tea (Staple ×2)\n");
    expect(await box.basketSection()).toContain("- Note: Baby pouches (Staple ×6)\n- Note: Tea (Staple ×2)\n");
  });

  test("lists a chosen Staple without an AH product as unmatched when nothing can be written to AH", async () => {
    const box = await basketBox([{ webshopId: 1, title: "AH Halfvolle melk 1 l", priceBeforeBonus: 1.15 }]);
    await box.staples([["Milk", "AH Halfvolle melk 1 l (1)", 2, "Weekly"], ["Tea", "", 1, "Ask"]]);
    await box.recipe("Toast", ["*1* egg"]);
    await box.weekMenu([["Toast", "", ""]], ["Ask Staples: tea"]);
    await box.mode({ mode: "AH down" });

    const result = await box.fill([{ recipe: "Toast", line: "1 egg", product: null }]);

    expect(result.code).toBe(2);
    expect(result.stdout).toContain("Staples:\n- 2 × AH Halfvolle melk 1 l: Milk (Staple)\nUnmatched:\n- egg (1)\n- Tea (Staple ×1)\n");
  });

  test("leaves out Always in House items and the Cupboard Ingredients the household has at home", async () => {
    const box = await basketBox([
      { webshopId: 1, title: "AH Spinazie 400 g", priceBeforeBonus: 2.19 },
      { webshopId: 2, title: "AH Zonnebloemolie 1 l", priceBeforeBonus: 2.99 },
      { webshopId: 3, title: "AH Kokosmelk 400 ml", priceBeforeBonus: 1.49 },
      { webshopId: 4, title: "AH Rode linzen 500 g", priceBeforeBonus: 1.79 },
    ]);
    await box.recipe("Dahl", ["*400g* spinach", "*1 tbsp* sunflower oil", "*250ml* coconut milk", "*300g* red lentils", "salt"]);
    await box.weekMenu([["Dahl", "", ""]]);

    const result = await box.fill(
      [
        { recipe: "Dahl", line: "400g spinach", product: 1, packFraction: 1, kind: "Fresh" },
        { recipe: "Dahl", line: "1 tbsp sunflower oil", product: 2, packFraction: 0.02, kind: "Always in House" },
        { recipe: "Dahl", line: "250ml coconut milk", product: 3, packFraction: 0.6, kind: "Cupboard Ingredient" },
        { recipe: "Dahl", line: "300g red lentils", product: 4, packFraction: 0.6, kind: "Cupboard Ingredient" },
        { recipe: "Dahl", line: "salt", kind: "Always in House" },
      ],
      [3],
    );

    expect(result.stderr).toBe("");
    expect(result.code).toBe(0);
    expect(quantities(await box.basket())).toEqual({ 1: 1, 4: 1 });
  });

  test("adds on top of Mijn lijst, merging into lines already there and never removing anything", async () => {
    const box = await basketBox([
      { webshopId: 1, title: "AH Spaghetti 500 g", priceBeforeBonus: 1.29 },
      { webshopId: 2, title: "AH Passata 500 g", priceBeforeBonus: 0.99 },
      { webshopId: 9, title: "AH Afwasmiddel", priceBeforeBonus: 1.99 },
    ]);
    await box.recipe("Pasta", ["*500g* spaghetti", "*500g* passata"]);
    await box.weekMenu([["Pasta", "", ""]]);
    await box.seedBasket({
      products: [{ id: 1, quantity: 2 }, { id: 9, quantity: 1 }],
      notes: [{ description: "wc-papier", quantity: 1 }],
    });

    const result = await box.fill([
      { recipe: "Pasta", line: "500g spaghetti", product: 1, packFraction: 1, kind: "Cupboard Ingredient" },
      { recipe: "Pasta", line: "500g passata", product: 2, packFraction: 1, kind: "Cupboard Ingredient" },
    ]);

    expect(result.code).toBe(0);
    const basket = await box.basket();
    expect(basket.products).toEqual([{ id: 1, quantity: 3 }, { id: 9, quantity: 1 }, { id: 2, quantity: 1 }]);
    expect(basket.notes).toEqual([{ description: "wc-papier", quantity: 1 }]);
    const requests = JSON.parse(await readFile(path.join(box.ah, "basket-requests.json"), "utf8"));
    expect(requests).toEqual([{ add: { products: [{ id: 1, quantity: 1 }, { id: 2, quantity: 1 }], notes: [] } }]);
  });

  test("adds unmatched ingredients to Mijn lijst as free-text notes and reports them", async () => {
    const box = await basketBox([{ webshopId: 1, title: "AH Rode linzen 500 g", priceBeforeBonus: 1.79 }]);
    await box.recipe("Dahl", ["*300g* red lentils", "*10* lime leaves, torn"]);
    await box.recipe("Chili", ["*2* adobo peppers", "*5* lime leaves"]);
    await box.weekMenu([
      ["Dahl", "", "Double: cook"],
      ["Dahl", "", "Double: 2nd day"],
      ["Chili", "", ""],
    ]);

    const result = await box.fill([
      { recipe: "Dahl", line: "300g red lentils", product: 1, packFraction: 0.6, kind: "Cupboard Ingredient" },
      { recipe: "Dahl", line: "10 lime leaves, torn", product: null, kind: "Fresh" },
      { recipe: "Chili", line: "2 adobo peppers" },
      { recipe: "Chili", line: "5 lime leaves" },
    ]);

    expect(result.stderr).toBe("");
    expect(result.code).toBe(0);
    expect((await box.basket()).notes).toEqual([
      { description: "lime leaves (25)", quantity: 1 },
      { description: "adobo peppers (2)", quantity: 1 },
    ]);
    expect(result.stdout).toContain("Unmatched, added as notes:\n- lime leaves (25)\n- adobo peppers (2)\n");
  });

  test("doesn't buy optional lines but lists them", async () => {
    const box = await basketBox([
      { webshopId: 1, title: "AH Avocado", priceBeforeBonus: 1.29 },
      { webshopId: 2, title: "AH Tortilla wraps 8 stuks", priceBeforeBonus: 1.99 },
    ]);
    await box.recipe("Tacos", ["*1* avocado", "*8* tortilla wraps (optional)", "sour cream if you like"]);
    await box.weekMenu([["Tacos", "", ""]]);

    const result = await box.fill([
      { recipe: "Tacos", line: "1 avocado", product: 1, packFraction: 1, kind: "Fresh" },
      { recipe: "Tacos", line: "8 tortilla wraps (optional)", product: 2, packFraction: 1, kind: "Cupboard Ingredient" },
    ]);

    expect(result.stderr).toBe("");
    expect(result.code).toBe(0);
    expect(quantities(await box.basket())).toEqual({ 1: 1 });
    expect(result.stdout).toContain("Optional, not added:\n- Tacos: 8 tortilla wraps (optional)\n- Tacos: sour cream if you like\n");
  });

  test("reports what was added, already there, unmatched and optional, the estimated total, and the checkout reminder", async () => {
    const box = await basketBox([
      { webshopId: 1, title: "AH Spaghetti 500 g", priceBeforeBonus: 1.29 },
      { webshopId: 2, title: "AH Passata 500 g", priceBeforeBonus: 1.19, currentPrice: 0.99 },
      { webshopId: 3, title: "AH Pijnboompitten 100 g", priceBeforeBonus: 3.49 },
      { webshopId: 9, title: "AH Afwasmiddel", priceBeforeBonus: 1.99 },
    ]);
    await box.recipe("Pasta", ["*1 kg* spaghetti", "*500g* passata", "*50g* pine nuts", "*10* basil leaves", "chilli flakes (optional)"]);
    await box.weekMenu([["Pasta", "", ""]]);
    await box.seedBasket({ products: [{ id: 2, quantity: 1 }, { id: 9, quantity: 1 }] });

    const result = await box.fill(
      [
        { recipe: "Pasta", line: "1 kg spaghetti", product: 1, packFraction: 2, kind: "Cupboard Ingredient" },
        { recipe: "Pasta", line: "500g passata", product: 2, packFraction: 1, kind: "Cupboard Ingredient" },
        { recipe: "Pasta", line: "50g pine nuts", product: 3, packFraction: 0.5, kind: "Cupboard Ingredient" },
        { recipe: "Pasta", line: "10 basil leaves", product: null },
      ],
      [3],
    );

    expect(result.stderr).toBe("");
    expect(result.code).toBe(0);
    expect(result.stdout).toBe(
      [
        "Added to Mijn lijst:",
        "- 2 × AH Spaghetti 500 g (€1.29 each)",
        "Already in Mijn lijst, added on top:",
        "- AH Passata 500 g: 1 + 1 = 2",
        "No longer needed, remove these from Mijn lijst by hand: none",
        "Unmatched, added as notes:",
        "- basil leaves (10)",
        "Optional, not added:",
        "- Pasta: chilli flakes (optional)",
        "Have at home: pine nuts",
        "Estimated total: €6.55",
        "",
        "Check out into the Saturday slot before Friday 12:00.",
        "",
      ].join("\n"),
    );
  });

  test("records what it added in the Week Menu's Basket section, which the display bundle ignores", async () => {
    const box = await basketBox([
      { webshopId: 1, title: "AH Spaghetti 500 g", priceBeforeBonus: 1.29 },
      { webshopId: 2, title: "AH Eieren 10 stuks", priceBeforeBonus: 3.49 },
      { webshopId: 3, title: "AH Pijnboompitten 100 g", priceBeforeBonus: 3.49 },
    ]);
    await box.staples([["Eggs", "AH Eieren 10 stuks (2)", 1, "Weekly"]]);
    await box.recipe("Carbonara", ["*500g* spaghetti, broken in half", "*3* eggs", "*50g* pine nuts", "*10* basil leaves"]);
    await box.weekMenu([["Carbonara", "", "Double: cook"], ["Carbonara", "", "Double: 2nd day"]], ["Extra: eggs ×1"]);
    const bundleBefore = await box.run(["bundle"], { now: "2026-11-28T10:00" });

    const result = await box.fill(
      [
        { recipe: "Carbonara", line: "500g spaghetti, broken in half", product: 1, packFraction: 1, kind: "Cupboard Ingredient" },
        { recipe: "Carbonara", line: "3 eggs", product: 2, packFraction: 0.3, kind: "Fresh" },
        { recipe: "Carbonara", line: "50g pine nuts", product: 3, packFraction: 0.5, kind: "Cupboard Ingredient" },
        { recipe: "Carbonara", line: "10 basil leaves", product: null },
      ],
      [3],
    );

    expect(result.code).toBe(0);
    const note = await readFile(box.weekMenuFile(), "utf8");
    expect(note).toMatch(/\n## Staples this week\n- Extra: eggs ×1\n\n## Basket\n/);
    expect(note.slice(note.indexOf("## Basket"))).toBe(
      [
        "## Basket",
        "- AH Spaghetti 500 g (id 1) ×2: spaghetti",
        "- AH Eieren 10 stuks (id 2) ×3: eggs, Eggs (Staple)",
        "- Note: basil leaves (20)",
        "Have at home: pine nuts",
        "",
      ].join("\n"),
    );
    expect(await box.run(["bundle"], { now: "2026-11-28T10:00" })).toEqual(bundleBefore);
  });

  test("refuses a list that misses an ingredient line or names one that isn't on the Week Menu, and writes nothing", async () => {
    const box = await basketBox([{ webshopId: 1, title: "AH Spaghetti 500 g", priceBeforeBonus: 1.29 }]);
    await box.recipe("Pasta", ["*500g* spaghetti", "*500g* passata"]);
    await box.recipe("Soup", ["*1* leek"]);
    await box.weekMenu([["Pasta", "", ""]]);
    const noteBefore = await readFile(box.weekMenuFile(), "utf8");

    const result = await box.fill([
      { recipe: "Pasta", line: "*500g* spaghetti", product: 1, packFraction: 1, kind: "Cupboard Ingredient" },
      { recipe: "Soup", line: "1 leek", product: 1, packFraction: 1, kind: "Fresh" },
    ]);

    expect(result.code).toBe(1);
    expect(result.stderr).toContain('Pasta: no match for "500g passata"');
    expect(result.stderr).toContain('Soup: "1 leek" is not an ingredient line of a Recipe bought this week');
    expect(await readFile(path.join(box.ah, "basket-requests.json"), "utf8").catch(() => null)).toBeNull();
    expect(await readFile(box.weekMenuFile(), "utf8")).toBe(noteBefore);
  });

  test("fills the Basket for the sample Week Menu from the sample matches", async () => {
    const box = await sandbox();
    const ah = await box.fake("ah");
    const matches = path.join(repo, "samples/basket/matches-2026-11-21.json");
    const { lines } = JSON.parse(await readFile(matches, "utf8")) as { lines: Match[] };
    const staples = [...(await readFile(path.join(box.vault, "Staples.md"), "utf8")).matchAll(/\((\d+)\) *\|/g)].map((m) => Number(m[1]));
    const ids = new Set([...lines.flatMap((l) => (l.product ? [l.product] : [])), ...staples]);
    const catalogue = [...ids].map((id) => ({ webshopId: id, title: `Product ${id}`, priceBeforeBonus: 1, isOrderable: true }));
    await writeFile(path.join(ah, "products.json"), JSON.stringify(catalogue));
    await box.run(["ah", "login"]);

    const result = await box.run(["basket", "fill", "--week", "2026-11-21", matches], { now: "2026-11-19T21:00" });

    expect(result.stderr).toBe("");
    expect(result.code).toBe(0);
    const basket: FakeBasket = JSON.parse(await readFile(path.join(ah, "basket.json"), "utf8"));
    expect(quantities(basket)).toMatchObject({
      450535: 2, // Milk: 3 Weekly, "Skip: milk ×1", plus 60 ml for the Biryani rounded down (Fresh)
      216237: 4, // Greek yoghurt: 3 Weekly plus the Dahl, the Naan on two Double cook days and the Biryani
      479791: 1, // Peanut butter: an Ask Staple chosen this week
      569945: 2, // Oats: "oats ×2"
      4011: 4, // Red split lentils: 0.75 a pack, Dahl once and twice on each Double cook day
      4012: 1, // Onions: 1.05 bags, Fresh
    });
    expect(Object.keys(quantities(basket))).not.toContain("4021"); // cardamom, at home
    expect(basket.notes.map((n) => n.description)).toEqual(["lime leaves (50)", "pandan (kewra) water (10 ml)"]);
    expect(result.stdout).toMatch(/Check out into the Saturday slot before Friday 12:00\.\n$/);
    expect(await readFile(path.join(box.vault, "Week menus/Week 2026-11-21.md"), "utf8")).toContain(
      "- Product 216237 (id 216237) ×4: semi-skimmed yoghurt, plain unsweetened yogurt, plain yoghurt, Greek yoghurt (Staple)\n",
    );
    expect((await box.run(["vault", "check"])).code).toBe(0);
  });
});

describe("food basket fill again", () => {
  const catalogue = [
    { webshopId: 1, title: "AH Spaghetti 500 g", priceBeforeBonus: 1.29 },
    { webshopId: 2, title: "AH Passata 500 g", priceBeforeBonus: 0.99 },
    { webshopId: 3, title: "AH Risottorijst 500 g", priceBeforeBonus: 2.49 },
  ];
  const pasta: Match[] = [
    { recipe: "Pasta", line: "500g spaghetti", product: 1, packFraction: 1, kind: "Cupboard Ingredient" },
    { recipe: "Pasta", line: "500g passata", product: 2, packFraction: 1, kind: "Cupboard Ingredient" },
    { recipe: "Pasta", line: "5 basil leaves", product: null },
  ];
  const risotto: Match[] = [
    { recipe: "Risotto", line: "300g risotto rice", product: 3, packFraction: 0.6, kind: "Cupboard Ingredient" },
    { recipe: "Risotto", line: "10 sage leaves", product: null },
  ];

  async function filledOnce() {
    const box = await basketBox(catalogue);
    await box.recipe("Pasta", ["*500g* spaghetti", "*500g* passata", "*5* basil leaves"]);
    await box.recipe("Risotto", ["*300g* risotto rice", "*10* sage leaves"]);
    await box.weekMenu([["Pasta", "", ""], ["Risotto", "", ""]]);
    const first = await box.fill([...pasta, ...risotto]);
    if (first.code !== 0) throw new Error(`the first fill failed:\n${first.stderr}`);
    return box;
  }

  test("after a menu change adds only the difference and lists what is no longer needed, removing nothing", async () => {
    const box = await filledOnce();
    await box.changeMenu([["Pasta", "", ""], ["Pasta", "", ""]]);

    const result = await box.fill(pasta);

    expect(result.stderr).toBe("");
    expect(result.code).toBe(0);
    expect((await box.requests()).slice(1)).toEqual([
      { add: { products: [{ id: 1, quantity: 1 }, { id: 2, quantity: 1 }], notes: [{ description: "basil leaves (10)", quantity: 1 }] } },
    ]);
    expect(quantities(await box.basket())).toEqual({ 1: 2, 2: 2, 3: 1 });
    expect(result.stdout).toContain(
      [
        "No longer needed, remove these from Mijn lijst by hand:",
        "- 1 × AH Risottorijst 500 g",
        "- Note: basil leaves (5)",
        "- Note: sage leaves (10)",
        "",
      ].join("\n"),
    );
    expect(result.stdout).toContain("Already in Mijn lijst, added on top:\n- AH Spaghetti 500 g: 1 + 1 = 2\n- AH Passata 500 g: 1 + 1 = 2\n");
    expect(await box.basketSection()).toBe(
      [
        "## Basket",
        "- AH Spaghetti 500 g (id 1) ×2: spaghetti",
        "- AH Passata 500 g (id 2) ×2: passata",
        "- Note: basil leaves (10)",
        "Have at home: none",
        "",
      ].join("\n"),
    );
  });

  test("with no menu change adds nothing", async () => {
    const box = await filledOnce();

    const result = await box.fill([...pasta, ...risotto]);

    expect(result.stderr).toBe("");
    expect(result.code).toBe(0);
    expect(await box.requests()).toHaveLength(1);
    expect(quantities(await box.basket())).toEqual({ 1: 1, 2: 1, 3: 1 });
    expect(result.stdout).toContain("Added to Mijn lijst: none\n");
    expect(result.stdout).toContain("No longer needed, remove these from Mijn lijst by hand: none\n");
    expect(result.stdout).toContain(
      "Added on an earlier run, unchanged:\n- 1 × AH Spaghetti 500 g\n- 1 × AH Passata 500 g\n- 1 × AH Risottorijst 500 g\n- Note: basil leaves (5)\n- Note: sage leaves (10)\n",
    );
  });

  test("doesn't list as no longer needed what was already taken out of Mijn lijst", async () => {
    const box = await filledOnce();
    await box.seedBasket({ products: [{ id: 1, quantity: 1 }, { id: 2, quantity: 1 }], notes: [{ description: "basil leaves (5)", quantity: 1 }] });
    await box.changeMenu([["Pasta", "", ""]]);

    const result = await box.fill(pasta);

    expect(result.code).toBe(0);
    expect(result.stdout).toContain("No longer needed, remove these from Mijn lijst by hand: none\n");
  });
});

describe("food basket fill once the order is placed", () => {
  test("writes nothing to AH and gives add-multiple links of 25 products each", async () => {
    const ids = Array.from({ length: 30 }, (_, i) => i + 1);
    const box = await basketBox(ids.map((id) => ({ webshopId: id, title: `AH Product ${id}`, priceBeforeBonus: 1 })));
    await box.recipe("Feast", ids.map((id) => `*${id}* thing ${id}`));
    await box.weekMenu([["Feast", "", ""]]);
    await box.mode({ mode: "order placed", date: WEEK });

    const result = await box.fill(
      ids.map((id) => ({ recipe: "Feast", line: `${id} thing ${id}`, product: id, packFraction: id === 7 ? 2 : 1, kind: "Fresh" })),
    );

    expect(result.stderr).toBe("");
    expect(result.code).toBe(2);
    expect(await box.requests()).toEqual([]);
    const links = result.stdout.match(/https:\/\/\S+/g);
    expect(links).toEqual([
      `https://www.ah.nl/mijnlijst/add-multiple?${ids.slice(0, 25).map((id) => `p=${id}:${id === 7 ? 2 : 1}`).join("&")}`,
      "https://www.ah.nl/mijnlijst/add-multiple?p=26:1&p=27:1&p=28:1&p=29:1&p=30:1",
    ]);
    expect(result.stdout).toMatch(/^The order for Saturday 28 Nov is already placed, so nothing was added to Mijn lijst\.\n/);
  });

  test("also gives a shopping list grouped into Fresh, Cupboard Ingredients, Staples and unmatched items", async () => {
    const box = await basketBox([
      { webshopId: 1, title: "AH Spaghetti 500 g", priceBeforeBonus: 1.29 },
      { webshopId: 2, title: "AH Spinazie 400 g", priceBeforeBonus: 2.19 },
      { webshopId: 3, title: "AH Halfvolle melk 1 l", priceBeforeBonus: 1.15 },
    ]);
    await box.staples([["Milk", "AH Halfvolle melk 1 l (3)", 2, "Weekly"]]);
    await box.recipe("Pasta", ["*500g* spaghetti", "*400g* spinach", "*10* basil leaves", "chilli flakes (optional)"]);
    await box.weekMenu([["Pasta", "", "Double: cook"], ["Pasta", "", "Double: 2nd day"]]);
    await box.mode({ mode: "order placed", date: WEEK });

    const result = await box.fill([
      { recipe: "Pasta", line: "500g spaghetti", product: 1, packFraction: 1, kind: "Cupboard Ingredient", title: "AH Spaghetti 500 g" },
      { recipe: "Pasta", line: "400g spinach", product: 2, packFraction: 1, kind: "Fresh" },
      { recipe: "Pasta", line: "10 basil leaves", product: null },
    ]);

    expect(result.code).toBe(2);
    expect(await box.requests()).toEqual([]);
    expect(result.stdout).toContain(
      [
        "Shopping list:",
        "Fresh:",
        "- 2 × spinach",
        "Cupboard Ingredients:",
        "- 2 × AH Spaghetti 500 g: spaghetti",
        "Staples:",
        "- 2 × AH Halfvolle melk 1 l: Milk (Staple)",
        "Unmatched:",
        "- basil leaves (20)",
        "Optional, not added:",
        "- Pasta: chilli flakes (optional)",
        "Have at home: none",
        "",
      ].join("\n"),
    );
    expect(await readFile(box.weekMenuFile(), "utf8")).not.toContain("## Basket");
  });

  test("after the menu changed post-checkout, gives an add-and-remove list for Mijn bestellingen instead", async () => {
    const box = await basketBox([
      { webshopId: 1, title: "AH Spaghetti 500 g", priceBeforeBonus: 1.29 },
      { webshopId: 2, title: "AH Passata 500 g", priceBeforeBonus: 0.99 },
      { webshopId: 3, title: "AH Risottorijst 500 g", priceBeforeBonus: 2.49 },
    ]);
    await box.recipe("Pasta", ["*500g* spaghetti", "*500g* passata", "*5* basil leaves"]);
    await box.recipe("Risotto", ["*300g* risotto rice", "*10* sage leaves"]);
    await box.weekMenu([["Pasta", "", ""], ["Risotto", "", ""]]);
    const pasta: Match[] = [
      { recipe: "Pasta", line: "500g spaghetti", product: 1, packFraction: 1, kind: "Cupboard Ingredient" },
      { recipe: "Pasta", line: "500g passata", product: 2, packFraction: 1, kind: "Cupboard Ingredient" },
      { recipe: "Pasta", line: "5 basil leaves", product: null },
    ];
    await box.fill([
      ...pasta,
      { recipe: "Risotto", line: "300g risotto rice", product: 3, packFraction: 0.6, kind: "Cupboard Ingredient" },
      { recipe: "Risotto", line: "10 sage leaves", product: null },
    ]);
    await box.mode({ mode: "order placed", date: WEEK });
    await box.changeMenu([["Pasta", "", ""], ["Pasta", "", ""]]);
    const noteBefore = await readFile(box.weekMenuFile(), "utf8");

    const result = await box.fill(pasta);

    expect(result.stderr).toBe("");
    expect(result.code).toBe(2);
    expect(await box.requests()).toHaveLength(1);
    expect(result.stdout).toBe(
      [
        "The order for Saturday 28 Nov is already placed, so nothing was changed in AH.",
        "The Week Menu changed since the Basket was filled. Change the order in Mijn bestellingen:",
        "Add to the order:",
        "- 1 × AH Spaghetti 500 g: spaghetti",
        "- 1 × AH Passata 500 g: passata",
        "Remove from the order:",
        "- 1 × AH Risottorijst 500 g",
        "Unmatched, buy these yourself:",
        "- basil leaves (10)",
        "Unmatched, no longer needed:",
        "- basil leaves (5)",
        "- sage leaves (10)",
        "",
      ].join("\n"),
    );
    expect(await readFile(box.weekMenuFile(), "utf8")).toBe(noteBefore);
  });

  test("says there is nothing to change when the placed order already matches the Week Menu", async () => {
    const box = await basketBox([{ webshopId: 1, title: "AH Spaghetti 500 g", priceBeforeBonus: 1.29 }]);
    await box.recipe("Pasta", ["*500g* spaghetti"]);
    await box.weekMenu([["Pasta", "", ""]]);
    const pasta: Match[] = [{ recipe: "Pasta", line: "500g spaghetti", product: 1, packFraction: 1, kind: "Cupboard Ingredient" }];
    await box.fill(pasta);
    await box.mode({ mode: "order placed", date: WEEK, status: "REOPENED" });

    const result = await box.fill(pasta);

    expect(result.code).toBe(0);
    expect(result.stdout).toBe("The order for Saturday 28 Nov is already placed and has what the Week Menu needs: nothing to change.\n");
    expect(await box.requests()).toHaveLength(1);
  });

  test("also writes nothing to AH when the placed order delivers on another day of the Week Menu's week", async () => {
    const box = await basketBox([{ webshopId: 1, title: "AH Spaghetti 500 g", priceBeforeBonus: 1.29 }]);
    await box.recipe("Pasta", ["*500g* spaghetti"]);
    await box.weekMenu([["Free Day", "", ""], ["Free Day", "", ""], ["Pasta", "", ""]]);
    await box.mode({ mode: "order placed", date: "2026-11-30" });

    const result = await box.fill([{ recipe: "Pasta", line: "500g spaghetti", product: 1, packFraction: 1, kind: "Cupboard Ingredient" }]);

    expect(result.code).toBe(2);
    expect(await box.requests()).toEqual([]);
    expect(result.stdout).toMatch(/^The order for Monday 30 Nov is already placed, so nothing was added to Mijn lijst\.\n/);
  });

  test("fills Mijn lijst as usual when the placed order is for another week", async () => {
    const box = await basketBox([{ webshopId: 1, title: "AH Spaghetti 500 g", priceBeforeBonus: 1.29 }]);
    await box.recipe("Pasta", ["*500g* spaghetti"]);
    await box.weekMenu([["Pasta", "", ""]]);
    await box.mode({ mode: "order placed", date: "2026-11-21" });

    const result = await box.fill([{ recipe: "Pasta", line: "500g spaghetti", product: 1, packFraction: 1, kind: "Cupboard Ingredient" }]);

    expect(result.code).toBe(0);
    expect(quantities(await box.basket())).toEqual({ 1: 1 });
  });
});

describe("food basket fill when AH fails", () => {
  const catalogue = [
    { webshopId: 1, title: "AH Spaghetti 500 g", priceBeforeBonus: 1.29 },
    { webshopId: 2, title: "AH Spinazie 400 g", priceBeforeBonus: 2.19 },
  ];
  const matches: Match[] = [
    { recipe: "Pasta", line: "500g spaghetti", product: 1, packFraction: 1, kind: "Cupboard Ingredient", title: "AH Spaghetti 500 g" },
    { recipe: "Pasta", line: "400g spinach", product: 2, packFraction: 1, kind: "Fresh", title: "AH Spinazie 400 g" },
    { recipe: "Pasta", line: "10 basil leaves", product: null },
  ];
  async function pastaWeek() {
    const box = await basketBox(catalogue);
    await box.recipe("Pasta", ["*500g* spaghetti", "*400g* spinach", "*10* basil leaves"]);
    await box.weekMenu([["Pasta", "", ""]]);
    return box;
  }
  const logins = async (box: { ah: string }) => Number(await readFile(path.join(box.ah, "logins.json"), "utf8"));

  test("with the login expired, prompts one re-login, then gives add-multiple links and the shopping list", async () => {
    const box = await pastaWeek();
    await box.mode({ mode: "login expired" });
    const loginsBefore = await logins(box);

    const result = await box.fill(matches);

    expect(result.stderr).toBe("");
    expect(result.code).toBe(2);
    expect((await logins(box)) - loginsBefore).toBe(1);
    expect(await box.requests()).toEqual([]);
    expect(result.stdout).toMatch(/^AH login expired: log in again in the browser window that opens\.\n/);
    expect(result.stdout).toContain("The AH login failed again, so nothing was added to Mijn lijst.\n");
    expect(result.stdout).toContain("Links:\n- https://www.ah.nl/mijnlijst/add-multiple?p=1:1&p=2:1\n");
    expect(result.stdout).toContain(
      "Shopping list:\nFresh:\n- 1 × AH Spinazie 400 g: spinach\nCupboard Ingredients:\n- 1 × AH Spaghetti 500 g: spaghetti\nUnmatched:\n- basil leaves (10)\n",
    );
    expect(await readFile(box.weekMenuFile(), "utf8")).not.toContain("## Basket");
  });

  test("fills Mijn lijst once the re-login works", async () => {
    const box = await pastaWeek();
    await box.mode({ mode: "login expired", loginFixesIt: true });

    const result = await box.fill(matches);

    expect(result.stderr).toBe("");
    expect(result.code).toBe(0);
    expect(result.stdout).toMatch(/^AH login expired: log in again in the browser window that opens\.\nAdded to Mijn lijst:\n/);
    expect(quantities(await box.basket())).toEqual({ 1: 1, 2: 1 });
  });

  test("with AH ordering down, writes the grouped shopping list without ids into the Basket section", async () => {
    const box = await pastaWeek();
    await box.mode({ mode: "AH down" });

    const result = await box.fill(matches);

    expect(result.stderr).toBe("");
    expect(result.code).toBe(2);
    expect(result.stdout).toBe(
      [
        "AH ordering is down, so nothing was added to Mijn lijst. The shopping list is in the Week Menu's ## Basket section:",
        "Fresh:",
        "- 1 × AH Spinazie 400 g: spinach",
        "Cupboard Ingredients:",
        "- 1 × AH Spaghetti 500 g: spaghetti",
        "Unmatched:",
        "- basil leaves (10)",
        "Optional, not added: none",
        "Have at home: none",
        "",
      ].join("\n"),
    );
    expect(await box.basketSection()).toBe(
      [
        "## Basket",
        "Not in Mijn lijst, AH ordering was down:",
        "Fresh:",
        "- 1 × AH Spinazie 400 g: spinach",
        "Cupboard Ingredients:",
        "- 1 × AH Spaghetti 500 g: spaghetti",
        "Unmatched:",
        "- basil leaves (10)",
        "Have at home: none",
        "",
      ].join("\n"),
    );
    expect((await box.run(["vault", "check"])).code).toBe(0);
  });

  test("with AH ordering down on a re-run, keeps what was added before and lists only the difference", async () => {
    const box = await pastaWeek();
    await box.fill(matches);
    await box.changeMenu([["Pasta", "", ""], ["Pasta", "", ""]]);
    await box.mode({ mode: "AH down" });

    const down = await box.fill(matches);

    expect(down.code).toBe(2);
    expect(await box.basketSection()).toBe(
      [
        "## Basket",
        "- AH Spaghetti 500 g (id 1) ×1: spaghetti",
        "- AH Spinazie 400 g (id 2) ×1: spinach",
        "- Note: basil leaves (10)",
        "Not in Mijn lijst, AH ordering was down:",
        "Fresh:",
        "- 1 × AH Spinazie 400 g: spinach",
        "Cupboard Ingredients:",
        "- 1 × AH Spaghetti 500 g: spaghetti",
        "Unmatched:",
        "- basil leaves (20)",
        "Have at home: none",
        "",
      ].join("\n"),
    );

    await rm(path.join(box.ah, "mode.json"));
    const again = await box.fill(matches);

    expect(again.code).toBe(0);
    expect((await box.requests()).slice(1)).toEqual([
      { add: { products: [{ id: 1, quantity: 1 }, { id: 2, quantity: 1 }], notes: [{ description: "basil leaves (20)", quantity: 1 }] } },
    ]);
  });
});
