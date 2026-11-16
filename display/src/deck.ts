// The Kitchen Display's view logic: from a display bundle and the time, the deck of screens to show.
import type { DisplayBundle, IngredientGroup, MenuDay } from "../../bundle/bundle.ts";
import { addDays, kitchenDate } from "../../bundle/kitchen-day.ts";

export type IngredientList = {
  heading: string | null;
  items: { amount: string | null; text: string }[];
};

export type Screen = IngredientsScreen | MessageScreen;

export type IngredientsScreen = {
  kind: "ingredients";
  /** e.g. "Mon 23 Nov" */
  day: string;
  title: string;
  /** e.g. "Novel · first time", "Double: cook for Tue too" */
  tags: string[];
  /** The Side's title, if the dinner has one. */
  side: string | null;
  ingredients: IngredientList[];
  /** The Side's ingredients, the first group headed with the Side's title. */
  sideIngredients: IngredientList[];
};

/** A day with nothing to cook. */
export type MessageScreen = {
  kind: "message";
  day: string;
  message: string;
};

export type Deck = {
  screens: Screen[];
  /** The index of the screen to show. */
  current: number;
};

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function dayLabel(date: string): string {
  const d = new Date(`${date}T00:00:00Z`);
  return `${WEEKDAYS[d.getUTCDay()]} ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`;
}

const list = (groups: IngredientGroup[]): IngredientList[] =>
  groups.map((g) => ({ heading: g.heading, items: g.items.map((it) => ({ amount: it.amount?.text ?? null, text: it.text })) }));

function tags(day: MenuDay): string[] {
  const tags: string[] = [];
  if (day.novel) tags.push("Novel · first time");
  if (day.double === "cook") tags.push(`Double: cook for ${dayLabel(addDays(day.date, 1)).split(" ")[0]} too`);
  return tags;
}

export function buildDeck(bundle: DisplayBundle, now: Date): Deck {
  const today = kitchenDate(now);
  const day = bundle.weekMenus.flatMap((w) => w.days).find((d) => d.date === today);
  return { screens: [todayScreen(bundle, today, day)], current: 0 };
}

function todayScreen(bundle: DisplayBundle, today: string, day: MenuDay | undefined): Screen {
  if (!day) return { kind: "message", day: dayLabel(today), message: "No Week Menu yet" };
  if (!day.dinner) return { kind: "message", day: dayLabel(today), message: "Free Day" };
  const recipe = bundle.recipes[day.dinner];
  const side = day.side ? bundle.recipes[day.side] : null;
  const sideIngredients = side ? list(side.ingredients) : [];
  if (side && sideIngredients[0]) sideIngredients[0].heading ??= side.title;
  return {
    kind: "ingredients",
    day: dayLabel(day.date),
    title: recipe.title,
    tags: tags(day),
    side: side?.title ?? null,
    ingredients: list(recipe.ingredients),
    sideIngredients,
  };
}
