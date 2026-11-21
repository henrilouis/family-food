import { writeFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, test } from "vitest";
import { sandbox } from "./harness.ts";

// An Allerhande recipe as AH's GraphQL `recipe(id)` returns it; the fake AH's `recipes.json` holds these.
type AhRecipe = {
  id: number;
  title: string;
  href: string;
  cookTime?: number | null;
  ovenTime?: number | null;
  waitTime?: number | null;
  servings?: { number: number } | null;
  ingredients?: {
    text?: string | null;
    quantity?: number | null;
    quantityUnit?: { singular: string; plural: string } | null;
    name: { singular: string; plural: string };
  }[];
  preparation?: { steps: string[] };
  tags?: { key: string; value: string }[];
  rating?: { average: number | null; count: number | null } | null;
};

const tags = (...pairs: string[]) => pairs.map((pair) => ({ key: pair.split("=")[0], value: pair.split("=")[1] }));
const vegetarianMain = ["speciale-wensen=vegetarisch", "menugang=hoofdgerecht"];

const recipe = (r: Partial<AhRecipe> & Pick<AhRecipe, "id" | "title">): AhRecipe => ({
  href: `/allerhande/recept/R-R${r.id}/${r.title.toLowerCase().replace(/\W+/g, "-")}`,
  cookTime: 20,
  ovenTime: null,
  waitTime: null,
  servings: { number: 4 },
  ingredients: [],
  preparation: { steps: [] },
  tags: tags(...vegetarianMain),
  rating: null,
  ...r,
});

/** A sandbox whose AH is the fake, holding the Allerhande `recipes` and AH's product `suggestions` per recipe id. */
async function allerhande(recipes: AhRecipe[], suggestions: Record<string, unknown[]> = {}) {
  const box = await sandbox();
  const state = await box.fake("ah");
  await writeFile(path.join(state, "recipes.json"), JSON.stringify(recipes, null, 2));
  await writeFile(path.join(state, "recipe-suggestions.json"), JSON.stringify(suggestions, null, 2));
  return { ...box, state };
}

describe("food ah recipes", () => {
  test("lists Allerhande's vegetarian main courses as Novel Recipe candidates, rated like food recipe fetch", async () => {
    const { run } = await allerhande([
      recipe({
        id: 1302900,
        title: "Witte-koolorzo met feta",
        cookTime: 25,
        ovenTime: 15,
        waitTime: 5,
        tags: tags(...vegetarianMain, "seizoen=winter", "keuken=italiaans"),
        rating: { average: 4.26, count: 57 },
      }),
      recipe({ id: 2, title: "Kipcurry", tags: tags("menugang=hoofdgerecht") }),
      recipe({ id: 3, title: "Linzensoep", tags: tags("speciale-wensen=vegetarisch", "menugang=voorgerecht") }),
      recipe({ id: 4, title: "Pompoenrisotto", rating: { average: 4, count: 0 } }),
    ]);

    const result = await run(["ah", "recipes"]);

    expect(result.stderr).toBe("");
    expect(result.code).toBe(0);
    expect(JSON.parse(result.stdout)).toEqual([
      {
        url: "https://www.ah.nl/allerhande/recept/R-R1302900/witte-koolorzo-met-feta",
        title: "Witte-koolorzo met feta",
        servings: 4,
        activeMinutes: 25,
        totalMinutes: 45,
        tags: ["vegetarisch", "hoofdgerecht", "winter", "italiaans"],
        rating: { value: 4.3, count: 57 },
      },
      expect.objectContaining({ title: "Pompoenrisotto", rating: null }),
    ]);
  });

  test("narrows by search text, season and cuisine", async () => {
    const { run } = await allerhande([
      recipe({ id: 1, title: "Pompoencurry met kikkererwten", tags: tags(...vegetarianMain, "seizoen=herfst", "keuken=indiaas") }),
      recipe({ id: 2, title: "Bloemkoolcurry", tags: tags(...vegetarianMain, "seizoen=winter", "keuken=indiaas") }),
      recipe({ id: 3, title: "Pompoensoep", tags: tags(...vegetarianMain, "seizoen=herfst", "keuken=nederlands") }),
      recipe({ id: 4, title: "Pompoenlasagne", tags: tags(...vegetarianMain, "seizoen=herfst", "keuken=italiaans") }),
    ]);

    const result = await run(["ah", "recipes", "pompoen", "--season", "herfst", "--cuisine", "indiaas"]);

    expect(result.code).toBe(0);
    expect(JSON.parse(result.stdout).map((r: { title: string }) => r.title)).toEqual(["Pompoencurry met kikkererwten"]);
  });

  test("leaves out advertorials and baby food", async () => {
    const { run } = await allerhande([
      recipe({ id: 1, title: "Groentelasagne (advertorial)" }),
      recipe({ id: 2, title: "Groentepuree met linzen - 12+ maanden" }),
      recipe({ id: 3, title: "Groentecurry" }),
    ]);

    const result = await run(["ah", "recipes"]);

    expect(JSON.parse(result.stdout).map((r: { title: string }) => r.title)).toEqual(["Groentecurry"]);
  });
});

describe("food ah suggestions", () => {
  test("lists AH's product for each ingredient of an Allerhande recipe", async () => {
    const { run } = await allerhande([recipe({ id: 1302900, title: "Witte-koolorzo met feta" })], {
      "1302900": [
        {
          optional: false,
          ingredient: { name: "volkorenorzo", completeText: "300 g biologische volkorenorzo" },
          productSuggestion: {
            quantity: 1,
            product: { id: 595034, title: "AH Biologisch Orzo volkoren", salesUnitSize: "500 g", priceV2: { now: { amount: 1.89 } } },
          },
        },
        {
          optional: true,
          ingredient: { name: "peterselie", completeText: "15 g verse peterselie (optioneel)" },
          productSuggestion: { quantity: 1, product: { id: 4021, title: "AH Peterselie", salesUnitSize: "15 g", priceV2: null } },
        },
        { optional: false, ingredient: { name: "peper", completeText: "peper" }, productSuggestion: null },
      ],
    });

    const result = await run(["ah", "suggestions", "https://www.ah.nl/allerhande/recept/R-R1302900/witte-koolorzo-met-feta"]);

    expect(result.stderr).toBe("");
    expect(result.code).toBe(0);
    expect(JSON.parse(result.stdout)).toEqual([
      { ingredient: "300 g biologische volkorenorzo", optional: false, product: { id: 595034, title: "AH Biologisch Orzo volkoren", size: "500 g", price: 1.89 }, packs: 1 },
      { ingredient: "15 g verse peterselie (optioneel)", optional: true, product: { id: 4021, title: "AH Peterselie", size: "15 g", price: null }, packs: 1 },
      { ingredient: "peper", optional: false, product: null, packs: null },
    ]);
  });

  test("takes only Allerhande recipe addresses", async () => {
    const { run } = await allerhande([]);

    const result = await run(["ah", "suggestions", "https://www.loveandlemons.com/dal/"]);

    expect(result.code).toBe(1);
    expect(result.stderr).toMatch(/Allerhande recipe/);
  });
});

describe("food recipe fetch on Allerhande", () => {
  const orzo = recipe({
    id: 1302900,
    title: "Witte-koolorzo met feta ",
    href: "/allerhande/recept/R-R1302900/witte-koolorzo-met-feta",
    cookTime: 25,
    ovenTime: 15,
    waitTime: null,
    servings: { number: 4 },
    ingredients: [
      { text: "1,2 kg biologische witte kool", quantity: 1.2, quantityUnit: { singular: "kg", plural: "kg" }, name: { singular: "biologische witte kool", plural: "biologische witte kool" } },
      { text: "", quantity: 2, quantityUnit: null, name: { singular: "ui", plural: "uien" } },
      { text: "in blokjes", quantity: 200, quantityUnit: { singular: "g", plural: "g" }, name: { singular: "feta", plural: "feta" } },
      { text: null, quantity: null, quantityUnit: null, name: { singular: "peper", plural: "peper" } },
    ],
    preparation: { steps: ["Verwarm de oven voor op 200 °C.", " Snijd de kool in reepjes. "] },
    tags: tags(...vegetarianMain, "seizoen=winter", "keuken=italiaans"),
    rating: { average: 4.26, count: 57 },
  });

  test("reads the recipe through AH's app API, in the same shape as an open site's page", async () => {
    const { run } = await allerhande([orzo]);

    const result = await run(["recipe", "fetch", "https://www.ah.nl/allerhande/recept/R-R1302900/witte-koolorzo-met-feta"]);

    expect(result.stderr).toBe("");
    expect(result.code).toBe(0);
    expect(JSON.parse(result.stdout)).toEqual({
      url: "https://www.ah.nl/allerhande/recept/R-R1302900/witte-koolorzo-met-feta",
      title: "Witte-koolorzo met feta",
      servings: 4,
      yield: ["4"],
      prepMinutes: 25,
      cookMinutes: 15,
      totalMinutes: 40,
      cuisine: "italiaans",
      category: "hoofdgerecht",
      diets: ["vegetarisch"],
      language: "nl",
      rating: { value: 4.3, count: 57 },
      ingredients: ["1,2 kg biologische witte kool", "2 uien", "200 g feta, in blokjes", "peper"],
      steps: [
        { section: null, text: "Verwarm de oven voor op 200 °C." },
        { section: null, text: "Snijd de kool in reepjes." },
      ],
    });
  });

  test("finds the recipe by its number, whatever the rest of the address", async () => {
    const { run } = await allerhande([orzo]);

    const result = await run(["recipe", "fetch", "https://ah.nl/allerhande/recept/R-R1302900?utm_source=app"]);

    expect(result.code).toBe(0);
    expect(JSON.parse(result.stdout).title).toBe("Witte-koolorzo met feta");
  });

  test("says so when Allerhande has no such recipe", async () => {
    const { run } = await allerhande([orzo]);

    const result = await run(["recipe", "fetch", "https://www.ah.nl/allerhande/recept/R-R999/weg"]);

    expect(result.code).toBe(1);
    expect(result.stderr).toMatch(/Allerhande has no recipe R-R999/);
  });

  test("refuses other ah.nl pages (exit 2): only Allerhande recipes are read, through the app API", async () => {
    const { run } = await allerhande([orzo]);

    const result = await run(["recipe", "fetch", "https://www.ah.nl/allerhande/recepten-zoeken?query=orzo"]);

    expect(result.code).toBe(2);
    expect(result.stderr).toMatch(/paste/i);
  });
});
