import { describe, expect, test } from "vitest";
import type { DisplayBundle, MenuDay } from "../../bundle/bundle.ts";
import sample from "../../samples/bundles/published-2026-11-20.json" with { type: "json" };
import { buildDeck, press, type Deck, type IngredientsScreen, type Screen, type StepScreen } from "../src/deck.ts";

const sampleBundle = sample as DisplayBundle;
const at = (iso: string) => new Date(iso);
const shown = (now: Date, bundle = sampleBundle): Screen => {
  const deck = buildDeck(bundle, now);
  return deck.screens[deck.current];
};
/** The sample bundle with one Menu Day changed. */
const withDay = (date: string, change: Partial<MenuDay>, bundle = sampleBundle): DisplayBundle => ({
  ...bundle,
  weekMenus: bundle.weekMenus.map((w) => ({ ...w, days: w.days.map((d) => (d.date === date ? { ...d, ...change } : d)) })),
});
const ingredientsShown = (now: Date, bundle = sampleBundle): IngredientsScreen => {
  const screen = shown(now, bundle);
  if (screen.kind !== "ingredients") throw new Error(`expected the ingredients screen, got ${screen.kind}`);
  return screen;
};

describe("days without a dinner to cook", () => {
  test("says so when no Week Menu covers today", () => {
    expect(shown(at("2026-12-01T18:00"))).toEqual({ kind: "message", day: "Tue 1 Dec", message: "No Week Menu yet" });
  });

  test("says so on the Free Day, after the week", () => {
    const deck = buildDeck(sampleBundle, at("2026-11-27T18:00"));

    expect(outline(deck)).toEqual(["week", "Free Day"]);
    expect(deck.screens[deck.current]).toEqual({ kind: "free-day", day: "Fri 27 Nov", title: "Free Day", message: "Nothing planned tonight" });
  });
});

describe("a dinner whose Recipe is gone from the Recipe Vault", () => {
  const bundle = withDay("2026-11-22", { dinner: null, unlinkedDinner: "Vegetable Biryani" });

  test("is named as deleted on the week screen", () => {
    const deck = press(buildDeck(bundle, at("2026-11-22T18:00")), "PageUp");
    const week = deck.screens[deck.current];

    expect(week.kind === "week" && week.days[1]).toMatchObject({ dinner: "Vegetable Biryani (deleted)", tags: ["New"] });
  });

  test("shows a short screen saying so instead of a recipe", () => {
    const deck = buildDeck(bundle, at("2026-11-22T18:00"));

    expect(outline(deck)).toEqual(["week", "Vegetable Biryani"]);
    expect(deck.screens[deck.current]).toEqual({
      kind: "recipe-gone",
      day: "Sun 22 Nov",
      title: "Vegetable Biryani",
      message: "This Recipe isn't in the Recipe Vault any more",
    });
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
    const screen = ingredientsShown(at("2026-11-23T18:00"), withDay("2026-11-23", { double: null }));

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
    if (s.kind === "week") return "week";
    if (s.kind === "leftovers") return `leftovers: ${s.title}`;
    if (s.kind === "free-day" || s.kind === "recipe-gone") return s.title;
    return s.message;
  });

describe("the cooking deck", () => {
  test("runs from the week and today's ingredients through the main Recipe's steps and the Side's steps to the notes and source", () => {
    const deck = buildDeck(sampleBundle, at("2026-11-23T18:00"));

    expect(outline(deck)).toEqual([
      "week",
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
    expect(deck.current).toBe(1);
  });
});

describe("the week screen", () => {
  const weekShown = (now: Date) => {
    const deck = press(buildDeck(sampleBundle, now), "PageUp");
    const screen = deck.screens[deck.current];
    if (screen.kind !== "week") throw new Error(`expected the week screen, got ${screen.kind}`);
    return screen;
  };

  test("is one press back from today's ingredients", () => {
    expect(weekShown(at("2026-11-23T18:00")).kind).toBe("week");
  });

  test("has a row per day of today's Week Menu, marking today, leftovers, the Free Day, the Novel Recipe and Double cook days", () => {
    expect(weekShown(at("2026-11-23T18:00")).days).toEqual([
      { day: "Sat 21 Nov", today: false, dinner: "Dahl", side: null, leftovers: false, tags: [] },
      { day: "Sun 22 Nov", today: false, dinner: "Vegetable Biryani", side: null, leftovers: false, tags: ["New"] },
      { day: "Mon 23 Nov", today: true, dinner: "Dahl", side: "Naan", leftovers: false, tags: ["×2"] },
      { day: "Tue 24 Nov", today: false, dinner: "Dahl", side: null, leftovers: true, tags: [] },
      { day: "Wed 25 Nov", today: false, dinner: "Dahl", side: "Naan", leftovers: false, tags: ["×2"] },
      { day: "Thu 26 Nov", today: false, dinner: "Dahl", side: null, leftovers: true, tags: [] },
      { day: "Fri 27 Nov", today: false, dinner: null, side: null, leftovers: false, tags: [] },
    ]);
  });

  test("shows the Week Menu that covers today, not the next one", () => {
    const days = weekShown(at("2026-11-20T18:00")).days;

    expect(days[0].day).toBe("Sat 14 Nov");
    expect(days.at(-1)).toMatchObject({ day: "Fri 20 Nov", today: true, leftovers: true });
  });

  test("says when the bundle was published", () => {
    expect(weekShown(at("2026-11-23T18:00")).published).toBe("Fri 20 Nov 18:00");
  });
});

describe("a step screen", () => {
  const stepScreen = (deck: Deck, index: number): StepScreen => {
    const screen = deck.screens[index];
    if (screen.kind !== "step") throw new Error(`expected a step screen, got ${screen.kind}`);
    return screen;
  };
  const deck = buildDeck(withDay("2026-11-23", { double: null }), at("2026-11-23T18:00"));

  test("shows the step with its amounts and ingredient words as bold spans", () => {
    const screen = stepScreen(deck, 3);

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
    const screen = stepScreen(deck, 3);

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
    expect(stepScreen(deck, 8).upcoming).toEqual([]);
  });

  test("tracks progress through all of tonight's steps", () => {
    expect([2, 4, 5, 8].map((i) => stepScreen(deck, i).progress)).toEqual([
      { at: 1, of: 7 },
      { at: 3, of: 7 },
      { at: 4, of: 7 },
      { at: 7, of: 7 },
    ]);
  });

  test("runs straight to the notes when there is no Side", () => {
    const biryani = buildDeck(sampleBundle, at("2026-11-22T18:00"));

    expect(outline(biryani).slice(-2)).toEqual(["Vegetable Biryani · Step 7 of 7", "notes: Vegetable Biryani"]);
    expect(stepScreen(biryani, 8).upcoming).toEqual([]);
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
  const start = deck.current;

  test("PageDown, ArrowDown and ArrowRight move one screen forward", () => {
    expect(pressAll(["PageDown"]).current).toBe(start + 1);
    expect(pressAll(["ArrowDown"]).current).toBe(start + 1);
    expect(pressAll(["ArrowRight"]).current).toBe(start + 1);
    expect(pressAll(["PageDown", "ArrowDown", "ArrowRight"]).current).toBe(start + 3);
  });

  test("PageUp, ArrowUp and ArrowLeft move one screen back", () => {
    const fourth = pressAll(["PageDown", "PageDown", "PageDown", "PageDown"]);

    expect(pressAll(["PageUp"], fourth).current).toBe(start + 3);
    expect(pressAll(["ArrowUp"], fourth).current).toBe(start + 3);
    expect(pressAll(["ArrowLeft"], fourth).current).toBe(start + 3);
    expect(pressAll(["PageUp", "ArrowUp", "ArrowLeft"], fourth).current).toBe(start + 1);
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
    const empty = buildDeck(sampleBundle, at("2026-12-01T18:00"));

    expect(pressAll(["PageDown", "ArrowRight", "PageUp"], empty).current).toBe(0);
  });
});

describe("a Double cook day", () => {
  const amounts = (screen: IngredientsScreen) => screen.ingredients.flatMap((g) => g.items.map((it) => it.amount));

  test("tags the dinner as cooked for tomorrow too", () => {
    expect(ingredientsShown(at("2026-11-23T18:00")).tags).toEqual(["Double · cook for Tuesday too"]);
  });

  test("doubles every amount in the dinner's ingredient list and the Side's", () => {
    const screen = ingredientsShown(at("2026-11-23T18:00"));

    expect(amounts(screen)).toEqual([
      ...["600g", "2 tbsp", "2 large", "4 tsp", "4 tsp", "2 tsp", "2 tsp", "2 tsp", "2", "8cm", "4", "2", "2", "2", "4", "1000ml", "500ml", "800g", null],
      ...["8 tbsp", "20", "2 tsp", "2", "8 tbsp", null],
    ]);
    expect(screen.side?.ingredients[0].items.map((it) => it.amount)).toEqual(["2 tsp", "240ml", "14g", "540g", "250g", "1 tsp", "2 tbsp", null, "6 tbsp"]);
  });

  test("doubles fractions and keeps the unit as written", () => {
    const screen = ingredientsShown(at("2026-11-22T18:00"), withDay("2026-11-22", { double: "cook" }));
    const items = screen.ingredients[0].items;

    expect(items.slice(0, 2).map((it) => it.amount)).toEqual(["120 ml", "40 strands"]);
    expect(items[5]).toEqual({ amount: "5 tsp", text: "kosher salt, divided, plus more to taste" });
    expect(items[12].amount).toBe("3 tsp");
    expect(items[15].amount).toBe("1 tsp");
    expect(items[26]).toEqual({ amount: "2 stick (5 cm)", text: "cinnamon" });
  });

  test("writes doubled fractions the way a cook would", () => {
    const recipe = sampleBundle.recipes["Dahl"];
    const amount = (text: string, quantity: number, unit: string) => ({ amount: { text, quantity, unit }, text: "flour" });
    const bundle: DisplayBundle = {
      ...sampleBundle,
      recipes: {
        ...sampleBundle.recipes,
        Dahl: {
          ...recipe,
          ingredients: [
            { heading: null, items: [amount("¾ cup", 0.75, "cup"), amount("⅓ tsp", 1 / 3, "tsp"), amount("1/4 tsp", 0.25, "tsp"), amount("1 1/2 tsp", 1.5, "tsp"), amount("0.3 l", 0.3, "l")] },
          ],
        },
      },
    };

    expect(amounts(ingredientsShown(at("2026-11-23T18:00"), bundle))).toEqual(["1½ cup", "⅔ tsp", "½ tsp", "3 tsp", "0.6 l"]);
  });
});

describe("a step on a Double cook day", () => {
  const deck = buildDeck(sampleBundle, at("2026-11-23T18:00"));
  const steps = deck.screens.filter((s) => s.kind === "step");

  test("doubles every amount in its ingredient spans and leaves times and sizes as written", () => {
    expect(steps[1].text).toEqual([
      "Heat ",
      { amount: "8 tbsp", ingredient: "sunflower oil" },
      " in a small frying pan and fry ",
      { amount: "20", ingredient: "lime leaves" },
      " and ",
      { amount: "2 tsp", ingredient: "mustard seeds" },
      " for 1 minute. Remove from heat and set aside. Warm ",
      { amount: "2", ingredient: "naan" },
      " according to package instructions.",
    ]);
    expect(steps[4].text).toEqual(['Divide the dough into 8 equal portions. Roll each into an 8" circle with a rolling pin.']);
  });

  test("doubles the Side's steps and the steps still to come", () => {
    expect(steps[0].upcoming.at(-1)?.text).toEqual(["Brush the naan with ", { amount: "6 tbsp", ingredient: "melted butter" }, " and serve warm."]);
    expect(steps.at(-1)?.text).toEqual(["Brush the naan with ", { amount: "6 tbsp", ingredient: "melted butter" }, " and serve warm."]);
  });
});

describe("a Double 2nd day", () => {
  test("shows the leftovers and tomorrow's dinner instead of a recipe", () => {
    const deck = buildDeck(sampleBundle, at("2026-11-24T18:00"));

    expect(outline(deck)).toEqual(["week", "leftovers: Dahl"]);
    expect(deck.screens[deck.current]).toEqual({
      kind: "leftovers",
      day: "Tue 24 Nov",
      title: "Dahl",
      message: "2nd day of the Double, leftovers from Monday, reheat gently",
      tomorrow: { day: "Wed 25 Nov", today: false, dinner: "Dahl", side: "Naan", leftovers: false, tags: ["×2"] },
    });
  });

  test("finds tomorrow's dinner in next week's Week Menu", () => {
    expect(shown(at("2026-11-20T18:00"))).toMatchObject({
      kind: "leftovers",
      message: "2nd day of the Double, leftovers from Thursday, reheat gently",
      tomorrow: { day: "Sat 21 Nov", dinner: "Dahl" },
    });
  });

  test("leaves tomorrow out when no Week Menu covers it yet", () => {
    const bundle = withDay("2026-11-27", { dinner: "Dahl", double: "second" });

    expect(shown(at("2026-11-27T18:00"), bundle)).toMatchObject({ kind: "leftovers", tomorrow: null });
  });
});
