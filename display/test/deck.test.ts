import { describe, expect, test } from "vitest";
import type { DisplayBundle } from "../../bundle/bundle.ts";
import sample from "../../samples/bundles/published-2026-11-20.json" with { type: "json" };
import { buildDeck, type Screen } from "../src/deck.ts";

const bundle = sample as DisplayBundle;
const at = (iso: string) => new Date(iso);
const shown = (now: Date): Screen => {
  const deck = buildDeck(bundle, now);
  return deck.screens[deck.current];
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
    const screen = shown(at("2026-11-23T03:00"));

    expect(screen.kind).toBe("ingredients");
    expect(screen).toMatchObject({ day: "Mon 23 Nov", title: "Dahl", side: "Naan" });
  });

  test("just before 03:00 it is still the previous day's dinner", () => {
    const screen = shown(at("2026-11-23T02:59"));

    expect(screen).toMatchObject({ kind: "ingredients", day: "Sun 22 Nov", title: "Vegetable Biryani", side: null });
  });

  test("lists the dinner's ingredients by group, amounts as written, then the Side's under its own heading", () => {
    const screen = shown(at("2026-11-23T18:00"));
    if (screen.kind !== "ingredients") throw new Error(`expected the ingredients screen, got ${screen.kind}`);

    expect(screen.ingredients.map((g) => g.heading)).toEqual([null, "To serve"]);
    expect(screen.ingredients[0].items[0]).toEqual({ amount: "300g", text: "red split lentils" });
    expect(screen.ingredients[0].items.at(-1)).toEqual({ amount: null, text: "salt and pepper" });
    expect(screen.sideIngredients).toEqual([
      {
        heading: "Naan",
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
    ]);
  });

  test("a dinner without a Side has no Side ingredients", () => {
    const screen = shown(at("2026-11-22T18:00"));

    expect(screen).toMatchObject({ kind: "ingredients", sideIngredients: [] });
  });

  test("tags the Novel Recipe and a Double cook day", () => {
    expect(shown(at("2026-11-22T18:00"))).toMatchObject({ tags: ["Novel · first time"] });
    expect(shown(at("2026-11-23T18:00"))).toMatchObject({ tags: ["Double: cook for Tue too"] });
    expect(shown(at("2026-11-21T18:00"))).toMatchObject({ tags: [] });
  });
});
