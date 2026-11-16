import { describe, expect, test } from "vitest";
import type { DisplayBundle } from "../../bundle/bundle.ts";
import sample from "../../samples/bundles/published-2026-11-20.json" with { type: "json" };
import { buildDeck, press, type Deck, type Screen } from "../src/deck.ts";
import { placeOf, restorePlace } from "../src/place.ts";

const sampleBundle = sample as DisplayBundle;
const at = (iso: string) => new Date(iso);
const shown = (deck: Deck): Screen => deck.screens[deck.current];
const pressed = (deck: Deck, key: string, times: number) => Array.from({ length: times }).reduce<Deck>((d) => press(d, key), deck);

/** The deck on Monday 23 Nov (Dahl with Naan), paged forward `pages` times from the ingredients. */
const mondayAfter = (pages: number, now = at("2026-11-23T18:00")) => pressed(buildDeck(sampleBundle, now), "PageDown", pages);

describe("keeping my place across a reload", () => {
  test("a saved step is restored on the same screen", () => {
    const before = mondayAfter(5);
    const place = placeOf(before, at("2026-11-23T18:00"));

    const after = restorePlace(buildDeck(sampleBundle, at("2026-11-23T18:05")), place, at("2026-11-23T18:05"));

    expect(shown(after)).toMatchObject({ kind: "step", recipe: "Naan", step: 2 });
    expect(after.current).toBe(before.current);
  });

  test("a step that no longer exists falls back to today's ingredients", () => {
    const place = placeOf(mondayAfter(3), at("2026-11-23T18:00"));
    const dahl = sampleBundle.recipes["Dahl"];
    const shorter: DisplayBundle = { ...sampleBundle, recipes: { ...sampleBundle.recipes, Dahl: { ...dahl, method: dahl.method.slice(0, 2) } } };

    const after = restorePlace(buildDeck(shorter, at("2026-11-23T18:05")), place, at("2026-11-23T18:05"));

    expect(shown(after)).toMatchObject({ kind: "ingredients", title: "Dahl" });
  });

  test("a step of a dinner that is no longer tonight's falls back to today's ingredients", () => {
    const place = placeOf(mondayAfter(2), at("2026-11-23T18:00"));
    const swapped: DisplayBundle = {
      ...sampleBundle,
      weekMenus: sampleBundle.weekMenus.map((w) => ({
        ...w,
        days: w.days.map((d) => (d.date === "2026-11-23" ? { ...d, dinner: "Vegetable Biryani", side: null } : d)),
      })),
    };

    const after = restorePlace(buildDeck(swapped, at("2026-11-23T18:05")), place, at("2026-11-23T18:05"));

    expect(shown(after)).toMatchObject({ kind: "ingredients", title: "Vegetable Biryani" });
  });

  test("a place saved on an earlier day is not restored", () => {
    // Wednesday cooks Dahl with Naan too, but Monday's step 2 is not Wednesday's.
    const place = placeOf(mondayAfter(2), at("2026-11-23T18:00"));

    const after = restorePlace(buildDeck(sampleBundle, at("2026-11-25T18:00")), place, at("2026-11-25T18:00"));

    expect(shown(after)).toMatchObject({ kind: "ingredients", day: "Wed 25 Nov" });
  });

  test("the notes screen is restored too", () => {
    const before = mondayAfter(8);
    expect(shown(before).kind).toBe("notes");

    const after = restorePlace(buildDeck(sampleBundle, at("2026-11-23T18:05")), placeOf(before, at("2026-11-23T18:00")), at("2026-11-23T18:05"));

    expect(shown(after).kind).toBe("notes");
  });

  test("today's ingredients keep no place", () => {
    expect(placeOf(mondayAfter(0), at("2026-11-23T18:00"))).toBeNull();
  });
});
