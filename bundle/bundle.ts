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
