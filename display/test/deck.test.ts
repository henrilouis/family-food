import { describe, expect, test } from "vitest";
import type { DisplayBundle } from "../../bundle/bundle.ts";
import sample from "../../samples/bundles/published-2026-11-20.json" with { type: "json" };
import { buildDeck, press, type Deck, type IngredientsScreen, type Screen, type StepScreen } from "../src/deck.ts";

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

/** One line per screen, enough to tell the deck's order. */
const outline = (deck: Deck): string[] =>
  deck.screens.map((s) => {
    if (s.kind === "step") return `${s.recipe} · Step ${s.step} of ${s.steps}`;
    if (s.kind === "ingredients") return `ingredients: ${s.title}`;
    if (s.kind === "notes") return `notes: ${s.recipes.map((r) => r.title).join(", ")}`;
    return s.message;
  });

describe("the cooking deck", () => {
  test("runs from today's ingredients through the main Recipe's steps and the Side's steps to the notes and source", () => {
    const deck = buildDeck(sampleBundle, at("2026-11-23T18:00"));

    expect(outline(deck)).toEqual([
      "ingredients: Dahl",
      "Dahl · Step 1 of 3",
      "Dahl · Step 2 of 3",
      "Dahl · Step 3 of 3",
      "Naan · Step 1 of 4",
      "Naan · Step 2 of 4",
      "Naan · Step 3 of 4",
      "Naan · Step 4 of 4",
      "notes: Dahl, Naan",
    ]);
    expect(deck.current).toBe(0);
  });
});

describe("a step screen", () => {
  const stepScreen = (deck: Deck, index: number): StepScreen => {
    const screen = deck.screens[index];
    if (screen.kind !== "step") throw new Error(`expected a step screen, got ${screen.kind}`);
    return screen;
  };
  const deck = buildDeck(sampleBundle, at("2026-11-23T18:00"));

  test("shows the step with its amounts and ingredient words as bold spans", () => {
    const screen = stepScreen(deck, 2);

    expect(screen.text).toEqual([
      "Heat ",
      { amount: "4 tbsp", ingredient: "sunflower oil" },
      " in a small frying pan and fry ",
      { amount: "10", ingredient: "lime leaves" },
      " and ",
      { amount: "1 tsp", ingredient: "mustard seeds" },
      " for 1 minute. Remove from heat and set aside. Warm ",
      { amount: "1", ingredient: "naan" },
      " according to package instructions.",
    ]);
  });

  test("lists the steps still to come, the Side's under its name", () => {
    const screen = stepScreen(deck, 2);

    expect(screen.upcoming.map((u) => [u.heading, u.step])).toEqual([
      [null, 3],
      ["Naan", 1],
      [null, 2],
      [null, 3],
      [null, 4],
    ]);
    expect(screen.upcoming[4].text).toEqual(["Brush the naan with ", { amount: "3 tbsp", ingredient: "melted butter" }, " and serve warm."]);
  });

  test("has nothing to come on the last step", () => {
    expect(stepScreen(deck, 7).upcoming).toEqual([]);
  });

  test("tracks progress through all of tonight's steps", () => {
    expect([1, 3, 4, 7].map((i) => stepScreen(deck, i).progress)).toEqual([
      { at: 1, of: 7 },
      { at: 3, of: 7 },
      { at: 4, of: 7 },
      { at: 7, of: 7 },
    ]);
  });

  test("runs straight to the notes when there is no Side", () => {
    const biryani = buildDeck(sampleBundle, at("2026-11-22T18:00"));

    expect(outline(biryani).slice(-2)).toEqual(["Vegetable Biryani · Step 7 of 7", "notes: Vegetable Biryani"]);
    expect(stepScreen(biryani, 7).upcoming).toEqual([]);
  });
});

describe("the notes screen", () => {
  test("holds the notes and source of the dinner and its Side", () => {
    const deck = buildDeck(sampleBundle, at("2026-11-22T18:00"));

    expect(deck.screens.at(-1)).toEqual({
      kind: "notes",
      recipes: [{ title: "Vegetable Biryani", notes: [], source: "https://www.seriouseats.com/vegetable-biryani-5324853" }],
    });
    const withSide = buildDeck(sampleBundle, at("2026-11-23T18:00")).screens.at(-1);
    expect(withSide).toMatchObject({ kind: "notes", recipes: [{ title: "Dahl", source: null }, { title: "Naan", notes: [], source: null }] });
    expect(withSide?.kind === "notes" && withSide.recipes[0].notes[0]).toMatch(/^Variations: you can vary endlessly/);
  });
});

describe("paging", () => {
  const deck = buildDeck(sampleBundle, at("2026-11-23T18:00"));
  const pressAll = (keys: string[], from = deck) => keys.reduce(press, from);
  const last = deck.screens.length - 1;

  test("PageDown, ArrowDown and ArrowRight move one screen forward", () => {
    expect(pressAll(["PageDown"]).current).toBe(1);
    expect(pressAll(["ArrowDown"]).current).toBe(1);
    expect(pressAll(["ArrowRight"]).current).toBe(1);
    expect(pressAll(["PageDown", "ArrowDown", "ArrowRight"]).current).toBe(3);
  });

  test("PageUp, ArrowUp and ArrowLeft move one screen back", () => {
    const fourth = pressAll(["PageDown", "PageDown", "PageDown", "PageDown"]);

    expect(pressAll(["PageUp"], fourth).current).toBe(3);
    expect(pressAll(["ArrowUp"], fourth).current).toBe(3);
    expect(pressAll(["ArrowLeft"], fourth).current).toBe(3);
    expect(pressAll(["PageUp", "ArrowUp", "ArrowLeft"], fourth).current).toBe(1);
  });

  test("stops at the first and the last screen", () => {
    expect(pressAll(["PageUp", "ArrowUp"]).current).toBe(0);
    expect(pressAll(Array(last + 5).fill("PageDown")).current).toBe(last);
    expect(pressAll([...Array(last + 5).fill("PageDown"), "PageUp"]).current).toBe(last - 1);
  });

  test("ignores every other key", () => {
    const second = press(deck, "PageDown");

    for (const key of ["Enter", " ", "Home", "End", "a", "Backspace"]) expect(press(second, key)).toBe(second);
  });

  test("a deck with one screen stays put", () => {
    const free = buildDeck(sampleBundle, at("2026-11-27T18:00"));

    expect(pressAll(["PageDown", "ArrowRight", "PageUp"], free).current).toBe(0);
  });
});
