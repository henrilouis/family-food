import { readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, test } from "vitest";
import { sandbox } from "./harness.ts";

// The sample vault's Week Menu of Sat 21 Nov: Dahl on Saturday and as two Doubles (with Naan), Vegetable Biryani on Sunday.
const WEEK = "2026-11-21";

type Line = {
  recipe: string;
  line: string;
  ingredient: string;
  times: number;
  optional: boolean;
  pinned: { ingredient: string; product: number | null; title: string | null; pack: string; kind: string } | null;
  match: Record<string, unknown> | null;
};

async function lines(box: Awaited<ReturnType<typeof sandbox>>): Promise<Line[]> {
  const result = await box.run(["basket", "lines", "--week", WEEK]);
  expect(result.stderr).toBe("");
  expect(result.code).toBe(0);
  return JSON.parse(result.stdout).lines;
}

describe("food basket lines", () => {
  test("lists every ingredient line of the Recipes bought this week, with how many dinners each covers", async () => {
    const box = await sandbox();

    const all = await lines(box);

    expect(all.filter((l) => l.recipe === "Dahl")).toHaveLength(25);
    expect(all.filter((l) => l.recipe === "Naan")).toHaveLength(9);
    expect(all.filter((l) => l.recipe === "Vegetable Biryani")).toHaveLength(31);
    expect(all[0]).toMatchObject({ recipe: "Dahl", line: "*300g* red split lentils", ingredient: "red split lentils", times: 5, optional: false });
    expect(all.find((l) => l.recipe === "Naan")).toMatchObject({ line: "*1 tsp* sugar", times: 4 });
    expect(all.find((l) => l.line === "*1 large* onion, finely chopped")).toMatchObject({ ingredient: "onion" });
    expect(all.find((l) => l.line === "salt and pepper")).toMatchObject({ ingredient: "salt and pepper" });
  });

  test("gives each line its Pinned Product from Products.md, also when the line says it in the plural", async () => {
    const box = await sandbox();

    const all = await lines(box);

    expect(all.find((l) => l.line === "*300g* red split lentils")?.pinned).toEqual({
      ingredient: "red split lentils",
      product: 4011,
      title: "AH Rode splitlinzen 400 g",
      pack: "400 g",
      kind: "Cupboard Ingredient",
    });
    expect(all.find((l) => l.line === "*1 large* onion, finely chopped")?.pinned).toMatchObject({ ingredient: "onion", product: 4012 });
    expect(all.find((l) => l.line === "*2 large* yellow or white onions, halved and thinly sliced")?.pinned).toBeNull();
    expect(all.find((l) => l.line === "*2* tomatoes, diced")?.pinned).toBeNull();
  });

  test("reads Products.md with the webshop id in its own AH id column", async () => {
    const box = await sandbox();
    await writeFile(
      path.join(box.vault, "Products.md"),
      "# Products\n\n| Ingredient | AH product | AH id | Pack | Kind |\n|---|---|---|---|---|\n" +
        "| tomato | AH Trostomaten 500 g | 4028 | 500 g ≈ 6 tomatoes | Fresh |\n" +
        "| salt | | | | Always in House |\n",
    );

    const all = await lines(box);

    expect(all.find((l) => l.line === "*2* tomatoes, diced")?.pinned).toEqual({
      ingredient: "tomato",
      product: 4028,
      title: "AH Trostomaten 500 g",
      pack: "500 g ≈ 6 tomatoes",
      kind: "Fresh",
    });
    expect(all.find((l) => l.line === "*1/2 tsp* salt")?.pinned).toEqual({
      ingredient: "salt",
      product: null,
      title: null,
      pack: "",
      kind: "Always in House",
    });
    expect(all.find((l) => l.line === "*300g* red split lentils")?.pinned).toBeNull();
  });

  test("gives each pinned line its match for food basket fill, with the share of a pack worked out from the Pack", async () => {
    const box = await sandbox();
    await writeFile(
      path.join(box.vault, "Products.md"),
      "# Products\n\n| Ingredient | AH product | AH id | Pack | Kind |\n|---|---|---|---|---|\n" +
        "| red split lentils | AH Rode splitlinzen 400 g | 4011 | 400 g | Cupboard Ingredient |\n" +
        "| onion | AH Uien 1 kg | 4012 | 1 kg ≈ 8 onions | Fresh |\n" +
        "| coconut milk | AH Kokosmelk 400 ml | 4014 | 400 ml | Cupboard Ingredient |\n" +
        "| semi-skimmed yoghurt | AH Halfvolle yoghurt 1 l | 4031 | 1 l | Fresh |\n" +
        "| red pepper | AH Rode paprika | 4025 | 1 st | Fresh |\n" +
        "| fresh ginger | AH Gember 100 g | 4023 | 100 g | Fresh |\n" +
        "| sunflower oil | AH Zonnebloemolie 1 l | 4015 | 1 l | Always in House |\n" +
        "| lime leaves | | | | Fresh |\n",
    );

    const all = await lines(box);
    const match = (line: string) => all.find((l) => l.line === line)?.match;

    const lentils = { recipe: "Dahl", line: "*300g* red split lentils", product: 4011, title: "AH Rode splitlinzen 400 g", kind: "Cupboard Ingredient" };
    expect(match("*300g* red split lentils")).toEqual({ ...lentils, packFraction: 0.75 });
    expect(match("*1 large* onion, finely chopped")).toMatchObject({ product: 4012, packFraction: 0.125 });
    expect(match("*250ml* coconut milk")).toMatchObject({ product: 4014, packFraction: 0.625 });
    expect(match("*4 tbsp* semi-skimmed yoghurt")).toMatchObject({ product: 4031, packFraction: 0.06 });
    expect(match("*1* red pepper, deseeded and finely chopped")).toMatchObject({ product: 4025, packFraction: 1 });
    expect(match("*4cm* fresh ginger, grated")).toEqual({
      recipe: "Dahl",
      line: "*4cm* fresh ginger, grated",
      product: 4023,
      title: "AH Gember 100 g",
      kind: "Fresh",
      packFraction: null,
    });
    expect(match("*1 tbsp* sunflower oil")).toEqual({ recipe: "Dahl", line: "*1 tbsp* sunflower oil", product: 4015, title: "AH Zonnebloemolie 1 l", kind: "Always in House" });
    expect(match("*10* lime leaves")).toEqual({ recipe: "Dahl", line: "*10* lime leaves", product: null, kind: "Fresh" });
    expect(match("*2* tomatoes, diced")).toBeNull();
  });

  test("names a line bought in tins as tinned, counts its tins by the size in brackets, and gives optional lines no match", async () => {
    const box = await sandbox();
    const dahl = path.join(box.vault, "Meals", "Dahl.md");
    const extra = "- *2 tins (400 g)* chickpeas, drained\n- *1 tin (400 g)* tomatoes\n- *8* tortilla wraps (optional)\n";
    await writeFile(dahl, (await readFile(dahl, "utf8")).replace("- salt and pepper\n", `- salt and pepper\n${extra}`));
    await writeFile(
      path.join(box.vault, "Products.md"),
      "| Ingredient | AH product | Pack | Kind |\n|---|---|---|---|\n" +
        "| chickpeas | AH Kikkererwten gedroogd 500 g (4072) | 500 g | Cupboard Ingredient |\n" +
        "| tinned chickpeas | AH Kikkererwten 400 g (4070) | 400 g | Cupboard Ingredient |\n" +
        "| tomatoes | AH Trostomaten 500 g (4028) | 500 g ≈ 5 tomatoes | Fresh |\n" +
        "| tortilla wraps | AH Tortilla wraps 8 stuks (4071) | 8 stuks | Fresh |\n",
    );

    const all = await lines(box);

    expect(all.find((l) => l.line === "*2 tins (400 g)* chickpeas, drained")).toMatchObject({ ingredient: "tinned chickpeas", match: { product: 4070, packFraction: 2 } });
    expect(all.find((l) => l.line === "*1 tin (400 g)* tomatoes")).toMatchObject({ ingredient: "tinned tomatoes", pinned: null });
    expect(all.find((l) => l.line === "*2* tomatoes, diced")?.pinned).toMatchObject({ product: 4028 });
    expect(all.find((l) => l.line === "*8* tortilla wraps (optional)")).toMatchObject({ optional: true, match: null });
  });

  test("a line pinned with food products pin has its Pinned Product on the next run", async () => {
    const box = await sandbox();
    const unpinned = (all: Line[]) => all.filter((l) => !l.pinned && !l.optional).length;
    const before = await lines(box);
    const pins = path.join(box.configDir, "..", "pins.json");
    await writeFile(pins, JSON.stringify([{ ingredient: "tomato", product: 4028, title: "AH Trostomaten 500 g", pack: "500 g ≈ 6 tomatoes", kind: "Fresh" }]));

    expect((await box.run(["products", "pin", pins])).code).toBe(0);
    const after = await lines(box);

    expect(unpinned(after)).toBe(unpinned(before) - 1);
    expect(after.find((l) => l.line === "*2* tomatoes, diced")?.match).toMatchObject({ product: 4028, packFraction: 0.333 });
  });

  test("names the ingredient without remarks in brackets, and finds its pin by that name", async () => {
    const box = await sandbox();
    const dahl = path.join(box.vault, "Meals", "Dahl.md");
    await writeFile(dahl, (await readFile(dahl, "utf8")).replace("- salt and pepper\n", "- salt and pepper\n- *30 g* whole cashew nuts (about 15)\n- *1 tsp* jaggery or sugar (optional, to balance)\n"));
    await writeFile(
      path.join(box.vault, "Products.md"),
      "| Ingredient | AH product | AH id | Pack | Kind |\n|---|---|---|---|---|\n| whole cashew nuts | AH Cashewnoten 200 g | 5021 | 200 g | Cupboard Ingredient |\n",
    );

    const all = await lines(box);

    expect(all.find((l) => l.line === "*30 g* whole cashew nuts (about 15)")).toMatchObject({ ingredient: "whole cashew nuts", match: { product: 5021, packFraction: 0.15 } });
    expect(all.find((l) => l.line.startsWith("*1 tsp* jaggery"))).toMatchObject({ ingredient: "jaggery or sugar", optional: true });
  });

  test("its matches are what food basket fill takes", async () => {
    const box = await sandbox();
    const ah = await box.fake("ah");
    await writeFile(
      path.join(ah, "products.json"),
      JSON.stringify(
        [
          { webshopId: 1, title: "AH Spaghetti 500 g", priceBeforeBonus: 1.29 },
          { webshopId: 2, title: "AH Passata 500 g", priceBeforeBonus: 0.99 },
        ].map((p) => ({ brand: "AH", salesUnitSize: "500 g", isOrderable: true, isSponsored: false, ...p })),
      ),
    );
    expect((await box.run(["ah", "login"])).code).toBe(0);
    await rm(path.join(box.vault, "Staples.md"));
    await writeFile(path.join(box.vault, "Meals", "Pasta.md"), "# Pasta\n\n## Ingredients\n\n- *300g* spaghetti\n- *700g* passata\n- salt\n\n## Method\n\n1. Cook.\n");
    await writeFile(
      path.join(box.vault, "Week menus", "Week 2026-11-28.md"),
      "---\nweek_start: 2026-11-28\n---\n| Day | Dinner | Side | Note |\n|---|---|---|---|\n| Sat 28 Nov | [[Pasta]] | | |\n| Fri 4 Dec | Free Day | | |\n",
    );
    await writeFile(
      path.join(box.vault, "Products.md"),
      "| Ingredient | AH product | AH id | Pack | Kind |\n|---|---|---|---|---|\n" +
        "| spaghetti | AH Spaghetti 500 g | 1 | 500 g | Cupboard Ingredient |\n" +
        "| passata | AH Passata 500 g | 2 | 500 g | Cupboard Ingredient |\n" +
        "| salt | | | | Always in House |\n",
    );

    const listed = await box.run(["basket", "lines", "--week", "2026-11-28"]);
    const matches = path.join(box.configDir, "..", "matches.json");
    await writeFile(matches, JSON.stringify({ lines: JSON.parse(listed.stdout).lines.map((l: Line) => l.match) }));
    const result = await box.run(["basket", "fill", "--week", "2026-11-28", matches]);

    expect(result.stderr).toBe("");
    expect(result.code).toBe(0);
    expect(JSON.parse(await readFile(path.join(ah, "basket.json"), "utf8")).products).toEqual([
      { id: 1, quantity: 1 },
      { id: 2, quantity: 2 },
    ]);
  });
});
