// The CLI's reading of the Recipe Vault: Week Menus and the parts of a Recipe the commands use.

export type WeekMenu = {
  /** The Saturday the Week Menu starts on, as YYYY-MM-DD. */
  weekStart: string;
  /** Saturday to Friday, in order. */
  days: MenuDay[];
};

export type MenuDay = {
  /** YYYY-MM-DD */
  date: string;
  /** The name of the Recipe the dinner links to; null on the Free Day, and for a dinner without a Recipe (`unlinkedDinner`). */
  dinner: string | null;
  /**
   * The dinner as the Week Menu writes it when that is plain text instead of a link to a Recipe: a 👎 Novel Recipe
   * deleted from the Recipe Vault. Left out on other days.
   */
  unlinkedDinner?: string;
  /** The name of the Side the dinner links to, if it has one. */
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

/** A scalable amount, as written. */
export type Amount = {
  /** Exactly as written, e.g. "2½ tsp". */
  text: string;
  /** e.g. 2.5 */
  quantity: number;
  /** Whatever follows the number, e.g. "tsp", "large", "stick (5 cm)"; "" when there is nothing. */
  unit: string;
};
