import { UserError } from "../../user-error.ts";

/** A product as AH's REST search (`/mobile-services/product/search/v2`) returns it. Only the fields the gateway reads. */
export type AhProduct = {
  webshopId: number;
  title: string;
  brand?: string;
  salesUnitSize?: string;
  priceBeforeBonus?: number;
  /** Only set while the product is on Bonus. */
  currentPrice?: number;
  isBonus?: boolean;
  bonusMechanism?: string;
  isOrderable?: boolean;
  isSponsored?: boolean;
  /** Only set with the user token. */
  isPreviouslyBought?: boolean;
};

/** Mijn lijst (the Basket) as AH's GraphQL `basket` query returns it. Only the fields the gateway reads. */
export type AhBasket = {
  itemsInList?: {
    quantity: number;
    product: { id: number; title: string; priceV2?: { now?: { amount: number } | null } | null };
  }[] | null;
  notes?: { description: string; quantity: number }[] | null;
};

/**
 * An open order as AH's GraphQL `orderFulfillments(status: OPEN)` returns it: checked out, reopened for changes, or
 * an empty order the delivery subscription made for its slot. Only the fields the gateway reads.
 */
export type AhOrder = {
  orderId: number;
  /** Made by the delivery subscription for its recurring slot; it stays empty until Mijn lijst is checked out into it. */
  isSubscriptionOrder?: boolean | null;
  /** When changes close, as an ISO time ("2026-11-20T11:00:00Z"). */
  closingDateTime?: string | null;
  /** What the order costs; 0 while it holds no products. */
  totalPrice?: { totalPrice?: { amount?: number | null } | null } | null;
  /** Delivery status, e.g. "SUBMITTED" or "REOPENED", and the slot's date ("2026-11-28"). */
  delivery?: { status?: string; slot?: { date?: string } | null } | null;
};

/**
 * The order open for changes in the AH app (`/mobile-services/order/v1/summaries/active`): picked when ordering
 * from Mijn lijst, or reopened. While there is one, products added go into it instead of Mijn lijst; notes don't.
 * Only the fields the gateway reads.
 */
export type AhActiveOrder = {
  id: number;
  state?: string;
  deliveryInformation?: { deliveryDate?: string | null } | null;
  orderedProducts?: {
    quantity: number;
    product: { webshopId: number; title: string; priceBeforeBonus?: number | null; currentPrice?: number | null };
  }[] | null;
};

/** An Allerhande recipe's rating; `average` is in stars out of 5. */
export type AhRecipeRating = { average?: number | null; count?: number | null };

export type AhRecipeTag = { key: string; value: string };

/** An Allerhande recipe in search results, as AH's GraphQL `recipeSearchV2` returns it. Only the fields the gateway reads. */
export type AhRecipeSummary = {
  id: number;
  title: string;
  slug?: string | null;
  /** Minutes: `cook` is the hands-on time (bereidingstijd), `oven` and `wait` come on top. */
  time?: { cook?: number | null; oven?: number | null; wait?: number | null } | null;
  serving?: { number?: number | null } | null;
  rating?: AhRecipeRating | null;
  tags?: AhRecipeTag[] | null;
};

/** An Allerhande recipe as AH's GraphQL `recipe(id)` returns it. Only the fields the gateway reads. */
export type AhRecipe = {
  id: number;
  title: string;
  /** The web page's path: "/allerhande/recept/R-R1302900/witte-koolorzo". */
  href?: string | null;
  cookTime?: number | null;
  ovenTime?: number | null;
  waitTime?: number | null;
  servings?: { number?: number | null } | null;
  ingredients?: {
    text?: string | null;
    quantity?: number | null;
    quantityUnit?: { singular?: string | null; plural?: string | null } | null;
    name?: { singular?: string | null; plural?: string | null } | null;
  }[] | null;
  preparation?: { steps?: string[] | null } | null;
  tags?: AhRecipeTag[] | null;
  rating?: AhRecipeRating | null;
};

/** One ingredient of an Allerhande recipe with the product AH suggests for it (GraphQL `recipeProductSuggestionsV2`). */
export type AhRecipeProductSuggestion = {
  optional?: boolean | null;
  ingredient?: { name?: string | null; completeText?: string | null } | null;
  productSuggestion?: {
    quantity?: number | null;
    product?: { id: number; title: string; salesUnitSize?: string | null; priceV2?: { now?: { amount: number } | null } | null } | null;
  } | null;
};

/** Allerhande recipe search: free text and filter values by group, e.g. `{ "speciale-wensen": ["vegetarisch"] }`. */
export type AhRecipeQuery = { text?: string; filters: Record<string, string[]>; size: number };

/** What to add to Mijn lijst: products by webshop id, and free-text notes. Quantities are added to what is there. */
export type AhBasketAdditions = {
  products: { id: number; quantity: number }[];
  notes: { description: string; quantity: number }[];
};

/**
 * AH's unofficial app API, as raw as AH returns it: the part of the AH gateway that is swapped for a fake.
 * The real one runs the Go `ahdump` tool; the fake keeps its state in JSON files.
 * Both read and write the user token in the token file they were made with.
 */
export interface AhClient {
  /** Runs the browser login and writes the user token to the token file. */
  login(): Promise<void>;
  /** Renews the user token now (AH rotates the refresh token on every renewal). */
  refreshLogin(): Promise<void>;
  /** Product search in AH's relevance order, with an anonymous token or the user token. */
  searchProducts(query: string, token: "anonymous" | "user"): Promise<AhProduct[]>;
  /** Product search with the user token, most frequently bought first (`sortOn=PURCHASE_FREQUENCY`). */
  searchByPurchaseFrequency(query: string): Promise<AhProduct[]>;
  /** Mijn lijst, with the user token. */
  basket(): Promise<AhBasket>;
  /** Adds products (GraphQL `basketItemsAdd`, which adds to the quantity already there) and free-text notes; returns Mijn lijst. */
  addToBasket(additions: AhBasketAdditions): Promise<AhBasket>;
  /** The open orders (GraphQL `orderFulfillments(status: OPEN)`), with the user token. */
  openOrders(): Promise<AhOrder[]>;
  /** The order open for changes in the AH app, with the user token; null when none is. */
  activeOrder(): Promise<AhActiveOrder | null>;
  /** Allerhande recipe search (GraphQL `recipeSearchV2`, most relevant first), with an anonymous token. */
  searchRecipes(query: AhRecipeQuery): Promise<AhRecipeSummary[]>;
  /** One Allerhande recipe (GraphQL `recipe(id)`), with an anonymous token; null when AH has none with that id. */
  recipe(id: number): Promise<AhRecipe | null>;
  /** AH's product for each ingredient of an Allerhande recipe (GraphQL `recipeProductSuggestionsV2`), with an anonymous token. */
  recipeProductSuggestions(id: number): Promise<AhRecipeProductSuggestion[]>;
}

/** A problem with AH that the person running `food` can act on. */
export class AhError extends UserError {}

/** AH doesn't answer, or answers with a server error: its ordering is down (as for 12 days in October 2026). */
export class AhUnavailableError extends AhError {
  constructor(message = "AH is not answering. Its online ordering may be down; try again later.") {
    super(message);
  }
}

export class AhLoginError extends AhError {
  constructor(message = "Not logged in to AH. Run `food ah login` first.") {
    super(message);
  }
}
