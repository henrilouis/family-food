// The Kitchen Display's view logic: from a display bundle and the time, the deck of screens to show.
import type { Amount, DisplayBundle, IngredientGroup, MenuDay, Recipe, Step, WeekMenu } from "../../bundle/bundle.ts";
import { addDays, dayLabel, timeLabel, weekdayName } from "../../bundle/dates.ts";
import { kitchenDate } from "../../bundle/kitchen-day.ts";

export type IngredientList = {
  heading: string | null;
  items: { amount: string | null; text: string }[];
};

/** A Method step as plain text and bold ingredient spans ("300g" + "red split lentils"). */
export type StepText = (string | { amount: string; ingredient: string })[];

export type Screen =
  | WeekScreen
  | IngredientsScreen
  | StepScreen
  | NotesScreen
  | DoubleSecondDayScreen
  | FreeDayScreen
  | RecipeGoneScreen
  | MessageScreen;

/** The Week Menu that covers today, one press back from today's ingredients. */
export type WeekScreen = {
  kind: "week";
  days: WeekRow[];
  /** When the bundle was published, e.g. "Fri 20 Nov 18:00". */
  published: string;
};

/** A day of the Week Menu at a glance. */
export type WeekRow = {
  /** e.g. "Mon 23 Nov" */
  day: string;
  today: boolean;
  /** The dinner's title, "<name> (deleted)" when its Recipe is gone from the Recipe Vault; null on the Free Day. */
  dinner: string | null;
  side: string | null;
  /** A Double's 2nd day, which eats the day before's dinner. */
  doubleSecondDay: boolean;
  /** "New" on the Novel Recipe, "×2" on a Double cook day. */
  tags: string[];
};

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

/** A Double's 2nd day: nothing to cook, the day before's dinner is reheated. */
export type DoubleSecondDayScreen = {
  kind: "double-second-day";
  day: string;
  /** The dinner's title. */
  title: string;
  message: string;
  /** Tomorrow's dinner; null when no Week Menu covers tomorrow yet. */
  tomorrow: WeekRow | null;
};

/** The Free Day: nothing planned tonight. */
export type FreeDayScreen = {
  kind: "free-day";
  day: string;
  title: string;
  message: string;
};

/** Tonight's dinner has no Recipe: a 👎 Novel Recipe deleted from the Recipe Vault. */
export type RecipeGoneScreen = {
  kind: "recipe-gone";
  day: string;
  /** The dinner as the Week Menu names it. */
  title: string;
  message: string;
};

/** No Week Menu covers today. */
export type MessageScreen = {
  kind: "message";
  day: string;
  message: string;
};

export type Deck = {
  screens: Screen[];
  current: number;
};

const FRACTIONS: [string, number][] = [["½", 1 / 2], ["¼", 1 / 4], ["¾", 3 / 4], ["⅓", 1 / 3], ["⅔", 2 / 3], ["⅛", 1 / 8]];

/** A quantity as a cook writes it: "3", "1½", "⅔", "0.6". */
function quantityText(quantity: number): string {
  const whole = Math.floor(quantity + 1e-9);
  const rest = quantity - whole;
  if (rest < 1e-6) return String(whole);
  const fraction = FRACTIONS.find(([, value]) => Math.abs(value - rest) < 1e-6);
  if (fraction) return `${whole || ""}${fraction[0]}`;
  return String(Math.round(quantity * 100) / 100);
}

/** An amount as written, or `times` as much with its unit as written: "2½ tsp" × 2 → "5 tsp". */
function amountText(amount: Amount, times: number): string {
  if (times === 1) return amount.text;
  const number = amount.text.slice(0, amount.text.length - amount.unit.length);
  return quantityText(amount.quantity * times) + (/\s$/.test(number) ? " " : "") + amount.unit;
}

const ingredientLists = (groups: IngredientGroup[], times: number): IngredientList[] =>
  groups.map((g) => ({ heading: g.heading, items: g.items.map((it) => ({ amount: it.amount && amountText(it.amount, times), text: it.text })) }));

const stepText = (step: Step, times: number): StepText =>
  step.map((part) => (typeof part === "string" ? part : { amount: amountText(part.amount, times), ingredient: part.ingredient }));

const tags = (day: MenuDay): string[] => [
  ...(day.novel ? ["Novel · first time"] : []),
  ...(day.double === "cook" ? [`Double · cook for ${weekdayName(addDays(day.date, 1))} too`] : []),
];

export function buildDeck(bundle: DisplayBundle, now: Date): Deck {
  const today = kitchenDate(now);
  const week = bundle.weekMenus.find((w) => w.days.some((d) => d.date === today));
  const day = week?.days.find((d) => d.date === today);
  if (!week || !day) return { screens: [{ kind: "message", day: dayLabel(today), message: "No Week Menu yet" }], current: 0 };
  const weekAtAGlance = weekScreen(bundle, week, today);
  if (!day.dinner && day.unlinkedDinner) {
    const gone: RecipeGoneScreen = {
      kind: "recipe-gone",
      day: dayLabel(today),
      title: day.unlinkedDinner,
      message: "This Recipe isn't in the Recipe Vault any more",
    };
    return { screens: [weekAtAGlance, gone], current: 1 };
  }
  if (!day.dinner) {
    const freeDay: FreeDayScreen = { kind: "free-day", day: dayLabel(today), title: "Free Day", message: "Nothing planned tonight" };
    return { screens: [weekAtAGlance, freeDay], current: 1 };
  }
  if (day.double === "second") return { screens: [weekAtAGlance, doubleSecondDayScreen(bundle, day, day.dinner)], current: 1 };
  const recipe = bundle.recipes[day.dinner];
  const side = day.side ? bundle.recipes[day.side] : null;
  return {
    screens: [weekAtAGlance, ingredientsScreen(day, recipe, side), ...stepScreens([recipe, side], timesFor(day)), notesScreen([recipe, side])],
    current: 1,
  };
}

function doubleSecondDayScreen(bundle: DisplayBundle, day: MenuDay, dinner: string): DoubleSecondDayScreen {
  const tomorrow = bundle.weekMenus.flatMap((w) => w.days).find((d) => d.date === addDays(day.date, 1));
  return {
    kind: "double-second-day",
    day: dayLabel(day.date),
    title: bundle.recipes[dinner].title,
    message: `2nd day of the Double, leftovers from ${weekdayName(addDays(day.date, -1))}, reheat gently`,
    tomorrow: tomorrow ? weekRow(bundle, tomorrow, day.date) : null,
  };
}

function weekScreen(bundle: DisplayBundle, week: WeekMenu, today: string): WeekScreen {
  return { kind: "week", days: week.days.map((d) => weekRow(bundle, d, today)), published: timeLabel(new Date(bundle.publishedAt)) };
}

function weekRow(bundle: DisplayBundle, day: MenuDay, today: string): WeekRow {
  return {
    day: dayLabel(day.date),
    today: day.date === today,
    dinner: day.dinner ? bundle.recipes[day.dinner].title : day.unlinkedDinner ? `${day.unlinkedDinner} (deleted)` : null,
    side: day.side && bundle.recipes[day.side].title,
    doubleSecondDay: day.double === "second",
    tags: [...(day.novel ? ["New"] : []), ...(day.double === "cook" ? ["×2"] : [])],
  };
}

/** How many times the written amounts to cook: twice on a Double cook day, for tonight and tomorrow. */
const timesFor = (day: MenuDay): number => (day.double === "cook" ? 2 : 1);

function ingredientsScreen(day: MenuDay, recipe: Recipe, side: Recipe | null): IngredientsScreen {
  const times = timesFor(day);
  return {
    kind: "ingredients",
    day: dayLabel(day.date),
    title: recipe.title,
    tags: tags(day),
    side: side && { title: side.title, ingredients: ingredientLists(side.ingredients, times) },
    ingredients: ingredientLists(recipe.ingredients, times),
  };
}

function stepScreens(recipes: (Recipe | null)[], times: number): StepScreen[] {
  const all = recipes
    .filter((r) => r !== null)
    .flatMap((r) => r.method.map((step, k) => ({ recipe: r.title, step: k + 1, steps: r.method.length, text: stepText(step, times) })));
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
