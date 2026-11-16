// The Kitchen Display's view logic: from a display bundle and the time, the deck of screens to show.
import type { DisplayBundle, IngredientGroup, MenuDay, Recipe, Step } from "../../bundle/bundle.ts";
import { kitchenDate } from "../../bundle/kitchen-day.ts";

export type IngredientList = {
  heading: string | null;
  items: { amount: string | null; text: string }[];
};

/** A Method step as plain text and bold ingredient spans ("300g" + "red split lentils"). */
export type StepText = (string | { amount: string; ingredient: string })[];

export type Screen = IngredientsScreen | StepScreen | NotesScreen | MessageScreen;

export type IngredientsScreen = {
  kind: "ingredients";
  /** e.g. "Mon 23 Nov" */
  day: string;
  title: string;
  /** e.g. "Novel · first time" */
  tags: string[];
  side: { title: string; ingredients: IngredientList[] } | null;
  ingredients: IngredientList[];
};

/** One Method step of tonight's dinner or its Side. */
export type StepScreen = {
  kind: "step";
  /** The title of the Recipe or Side the step belongs to. */
  recipe: string;
  /** The step's number in its Recipe, from 1. */
  step: number;
  /** How many steps its Recipe has. */
  steps: number;
  text: StepText;
  /** The steps after this one, the Side's included; `heading` names the Side at its first step. */
  upcoming: { heading: string | null; step: number; text: StepText }[];
  /** This step's place among all of tonight's steps, from 1. */
  progress: { at: number; of: number };
};

/** The last screen: the notes and source of tonight's dinner and its Side. */
export type NotesScreen = {
  kind: "notes";
  recipes: { title: string; notes: string[]; source: string | null }[];
};

/** A day with nothing to cook. */
export type MessageScreen = {
  kind: "message";
  day: string;
  message: string;
};

export type Deck = {
  screens: Screen[];
  current: number;
};

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function dayLabel(date: string): string {
  const d = new Date(`${date}T00:00:00Z`);
  return `${WEEKDAYS[d.getUTCDay()]} ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`;
}

const ingredientLists = (groups: IngredientGroup[]): IngredientList[] =>
  groups.map((g) => ({ heading: g.heading, items: g.items.map((it) => ({ amount: it.amount?.text ?? null, text: it.text })) }));

const stepText = (step: Step): StepText =>
  step.map((part) => (typeof part === "string" ? part : { amount: part.amount.text, ingredient: part.ingredient }));

// The Double tag waits for doubled amounts (#20): without them it would tell the cook to cook for two days from a single list.
const tags = (day: MenuDay): string[] => (day.novel ? ["Novel · first time"] : []);

export function buildDeck(bundle: DisplayBundle, now: Date): Deck {
  const today = kitchenDate(now);
  const day = bundle.weekMenus.flatMap((w) => w.days).find((d) => d.date === today);
  if (!day) return { screens: [{ kind: "message", day: dayLabel(today), message: "No Week Menu yet" }], current: 0 };
  if (!day.dinner) return { screens: [{ kind: "message", day: dayLabel(today), message: "Free Day" }], current: 0 };
  const recipe = bundle.recipes[day.dinner];
  const side = day.side ? bundle.recipes[day.side] : null;
  return { screens: [ingredientsScreen(day, recipe, side), ...stepScreens([recipe, side]), notesScreen([recipe, side])], current: 0 };
}

function ingredientsScreen(day: MenuDay, recipe: Recipe, side: Recipe | null): IngredientsScreen {
  return {
    kind: "ingredients",
    day: dayLabel(day.date),
    title: recipe.title,
    tags: tags(day),
    side: side && { title: side.title, ingredients: ingredientLists(side.ingredients) },
    ingredients: ingredientLists(recipe.ingredients),
  };
}

function stepScreens(recipes: (Recipe | null)[]): StepScreen[] {
  const all = recipes
    .filter((r) => r !== null)
    .flatMap((r) => r.method.map((step, k) => ({ recipe: r.title, step: k + 1, steps: r.method.length, text: stepText(step) })));
  return all.map((s, j) => ({
    kind: "step",
    ...s,
    upcoming: all.slice(j + 1).map((u, q) => ({
      heading: u.recipe !== all[j + q].recipe ? u.recipe : null,
      step: u.step,
      text: u.text,
    })),
    progress: { at: j + 1, of: all.length },
  }));
}

function notesScreen(recipes: (Recipe | null)[]): NotesScreen {
  return {
    kind: "notes",
    recipes: recipes.filter((r) => r !== null).map((r) => ({ title: r.title, notes: r.notes, source: r.source })),
  };
}

const NEXT = new Set(["PageDown", "ArrowDown", "ArrowRight"]);
const PREVIOUS = new Set(["PageUp", "ArrowUp", "ArrowLeft"]);

/** Whether `key` turns pages: PageDown/PageUp (the Boox's buttons) or an arrow key. */
export const isPageKey = (key: string): boolean => NEXT.has(key) || PREVIOUS.has(key);

/** The deck after pressing `key`: the page-turn keys move one screen, stopping at either end; other keys do nothing. */
export function press(deck: Deck, key: string): Deck {
  const step = NEXT.has(key) ? 1 : PREVIOUS.has(key) ? -1 : 0;
  const current = Math.min(deck.screens.length - 1, Math.max(0, deck.current + step));
  return current === deck.current ? deck : { ...deck, current };
}
