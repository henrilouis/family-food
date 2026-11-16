import { describe, expect, test } from "vitest";
import type { DisplayBundle } from "../../bundle/bundle.ts";
import sample from "../../samples/bundles/published-2026-11-20.json" with { type: "json" };
import { buildDeck, type IngredientsScreen, type Screen } from "../src/deck.ts";

const sampleBundle = sample as DisplayBundle;
const at = (iso: string) => new Date(iso);
const shown = (now: Date, bundle = sampleBundle): Screen => {
  const deck = buildDeck(bundle, now);
  return deck.screens[deck.current];
};
const ingredientsShown = (now: Date, bundle = sampleBundle): IngredientsScreen => {
  const screen = shown(now, bundle);
  if (screen.kind !== "ingredients") throw new Error(`expected the ingredients screen, got ${screen.kind}`);
  return screen;
};

describe("days without a dinner to cook", () => {
  test("says so when no Week Menu covers today", () => {
    expect(shown(at("2026-12-01T18:00"))).toEqual({ kind: "message", day: "Tue 1 Dec", message: "No Week Menu yet" });
  });

  test("says so on the Free Day", () => {
    expect(shown(at("2026-11-27T18:00"))).toEqual({ kind: "message", day: "Fri 27 Nov", message: "Free Day" });
  });
});

describe("today's ingredients", () => {
  test("from 03:00 the deck opens on that day's dinner", () => {
    const screen = ingredientsShown(at("2026-11-23T03:00"));

    expect(screen.day).toBe("Mon 23 Nov");
    expect(screen.title).toBe("Dahl");
    expect(screen.side?.title).toBe("Naan");
  });

  test("just before 03:00 it is still the previous day's dinner", () => {
    const screen = ingredientsShown(at("2026-11-23T02:59"));

    expect(screen.day).toBe("Sun 22 Nov");
    expect(screen.title).toBe("Vegetable Biryani");
    expect(screen.side).toBeNull();
  });

  test("lists the dinner's ingredients by group, amounts as written, then the Side's", () => {
    const screen = ingredientsShown(at("2026-11-23T18:00"));

    expect(screen.ingredients.map((g) => g.heading)).toEqual([null, "To serve"]);
    expect(screen.ingredients[0].items[0]).toEqual({ amount: "300g", text: "red split lentils" });
    expect(screen.ingredients[0].items.at(-1)).toEqual({ amount: null, text: "salt and pepper" });
    expect(screen.side).toEqual({
      title: "Naan",
      ingredients: [
        {
          heading: null,
          items: [
            { amount: "1 tsp", text: "sugar" },
            { amount: "120ml", text: "warm water" },
            { amount: "7g", text: "active dry yeast" },
            { amount: "270g", text: "all-purpose flour" },
            { amount: "125g", text: "plain yoghurt" },
            { amount: "1/2 tsp", text: "salt" },
            { amount: "1 tbsp", text: "oil" },
            { amount: null, text: "Some oil, for greasing the skillet" },
            { amount: "3 tbsp", text: "melted butter, to brush with" },
          ],
        },
      ],
    });
  });

  test("keeps the Side's title when its ingredients start with a subsection", () => {
    const naan = sampleBundle.recipes["Naan"];
    const bundle: DisplayBundle = {
      ...sampleBundle,
      recipes: { ...sampleBundle.recipes, Naan: { ...naan, ingredients: [{ ...naan.ingredients[0], heading: "Dough" }] } },
    };

    const screen = ingredientsShown(at("2026-11-23T18:00"), bundle);

    expect(screen.side?.title).toBe("Naan");
    expect(screen.side?.ingredients.map((g) => g.heading)).toEqual(["Dough"]);
  });

  test("tags the Novel Recipe", () => {
    expect(ingredientsShown(at("2026-11-22T18:00")).tags).toEqual(["Novel · first time"]);
    expect(ingredientsShown(at("2026-11-21T18:00")).tags).toEqual([]);
  });
});
