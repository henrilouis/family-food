// The display bundle: the contract between the `food` CLI, which builds it on the Mac, and the
// Kitchen Display page, which reads it. Changing it is an API change (ADR 0002).

export const BUNDLE_SCHEMA_VERSION = 1;

export type DisplayBundle = {
  schemaVersion: typeof BUNDLE_SCHEMA_VERSION;
  /** When the bundle was built, as an ISO timestamp. */
  publishedAt: string;
  /** Every Week Menu that ends on or after the day of publishing, oldest first. */
  weekMenus: WeekMenu[];
  /** The Recipes and Sides the Week Menus use, keyed by the name the Week Menu links to. */
  recipes: Record<string, Recipe>;
};

export type WeekMenu = {
  /** The Saturday the Week Menu starts on, as YYYY-MM-DD. */
  weekStart: string;
  /** Saturday to Friday, in order. */
  days: MenuDay[];
};

export type MenuDay = {
  /** YYYY-MM-DD */
  date: string;
  /** The Recipe's key in `recipes`; null on the Free Day. */
  dinner: string | null;
  /** The Side's key in `recipes`, if the dinner has one. */
  side: string | null;
  /** The dinner is this week's Novel Recipe. */
  novel: boolean;
  /** "cook" on the day a Double Recipe is cooked for two days; "second" on the day after, which eats it. */
  double: "cook" | "second" | null;
};

/** A Recipe or Side. */
export type Recipe = {
  title: string;
  /** The ingredient list: first the unnamed group, then any subsections such as "To serve". */
  ingredients: IngredientGroup[];
  /** The numbered Method, one entry per step. */
  method: Step[];
  /** The paragraphs after the Method, as plain text. */
  notes: string[];
  /** Where the Recipe came from (a URL); null when the note doesn't say. */
  source: string | null;
};

/** A Method step: plain text with the ingredient spans marked, in reading order. */
export type Step = (string | IngredientSpan)[];

/**
 * An italic amount in a step and the words right after it that also appear in the Recipe's ingredient
 * list, up to a joining word such as "and", "in" or "for": "*1 large* onion for 3 minutes" → 1 large + "onion".
 * The page shows it in bold, as `amount.text + " " + ingredient`.
 */
export type IngredientSpan = {
  amount: Amount;
  /** The ingredient words, e.g. "red split lentils"; "" when none follow the amount. */
  ingredient: string;
};

export type IngredientGroup = {
  heading: string | null;
  items: Ingredient[];
};

export type Ingredient = {
  /** The italic amount, which scales; null when the line has none ("salt and pepper"). */
  amount: Amount | null;
  /** The rest of the line, e.g. "onion, finely chopped". */
  text: string;
};

/** A scalable amount, as written. The page does any doubling. */
export type Amount = {
  /** Exactly as written, e.g. "2½ tsp". */
  text: string;
  /** e.g. 2.5 */
  quantity: number;
  /** Whatever follows the number, e.g. "tsp", "large", "stick (5 cm)"; "" when there is nothing. */
  unit: string;
};
