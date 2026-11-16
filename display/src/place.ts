// Keeping the cook's place across a reload: which step of which Recipe is showing, saved by the page
// (in localStorage) and found again in the reloaded deck.
import { kitchenDate } from "../../bundle/kitchen-day.ts";
import type { Deck, Screen } from "./deck.ts";

/** A step of tonight's dinner or its Side, or the notes screen, on the kitchen date it was shown. */
export type Place = {
  /** YYYY-MM-DD */
  date: string;
  /** The title of the Recipe or Side; for the notes, the dinner's. */
  recipe: string;
  /** The step's number in its Recipe, from 1, or "notes". */
  step: number | "notes";
};

/** The place to keep while `deck` is showing, or null when it shows neither a step nor the notes. */
export function placeOf(deck: Deck, now: Date): Place | null {
  const screen = deck.screens[deck.current];
  const date = kitchenDate(now);
  if (screen.kind === "step") return { date, recipe: screen.recipe, step: screen.step };
  if (screen.kind === "notes") return { date, recipe: screen.recipes[0].title, step: "notes" };
  return null;
}

/** `deck` turned to the saved place, if it still has that step today; otherwise `deck` as it is. */
export function restorePlace(deck: Deck, place: Place | null, now: Date): Deck {
  if (!place || place.date !== kitchenDate(now)) return deck;
  const at = deck.screens.findIndex((s) => isPlace(s, place));
  return at < 0 ? deck : { ...deck, current: at };
}

function isPlace(screen: Screen, place: Place): boolean {
  if (screen.kind === "step") return screen.recipe === place.recipe && screen.step === place.step;
  if (screen.kind === "notes") return screen.recipes[0].title === place.recipe && place.step === "notes";
  return false;
}
