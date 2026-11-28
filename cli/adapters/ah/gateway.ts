import { access, chmod, mkdir } from "node:fs/promises";
import path from "node:path";
import { inWeek } from "../../dates.ts";
import { configDir, type Config } from "../../config.ts";
import { ahdumpClient } from "./ahdump.ts";
import type { RecipePage } from "../../recipe-page.ts";
import {
  candidate,
  isFamilyDinner,
  productSuggestion,
  recipePage,
  VEGETARIAN_MAINS,
  type AllerhandeCandidate,
  type ProductSuggestion,
} from "./allerhande.ts";
import { AhError, AhLoginError, type AhBasket, type AhBasketAdditions, type AhBasketRemovals, type AhClient, type AhOrder } from "./client.ts";
import { fakeAhClient } from "./fake.ts";
import { previouslyBought, rankProducts, type Product } from "./products.ts";
import type { Measure } from "../../amount.ts";

/** An Allerhande search: free text, and Allerhande's own season and cuisine values ("winter", "italiaans"). */
export type AllerhandeSearch = { text?: string; season?: string; cuisine?: string; size?: number };

/** Mijn lijst: the Basket before checkout. */
export type Basket = {
  /** One line per product; `price` is the price of one pack now (Bonus included), null when AH doesn't say. */
  products: { id: number; title: string; quantity: number; price: number | null }[];
  /** Free-text notes. */
  notes: { description: string; quantity: number }[];
};

/** An order open for changes in the AH app, with its products as in Mijn lijst. */
export type OrderInFocus = { id: number; date: string; closes: Date | null; products: Basket["products"] };

/**
 * Everything the `food` CLI does with Albert Heijn. It never checks out.
 */
export interface AhGateway {
  /** Logs in once in a real browser and keeps the user token next to the local config, readable only by this user. */
  login(): Promise<void>;
  /** Renews the login now; fails with AhLoginError when there is none or AH refuses it. */
  refreshLogin(): Promise<void>;
  /**
   * Product search, cleaned up and ranked by unit price; `need` drops packs that would waste too much.
   * Uses the user token once logged in (it marks previously bought products), an anonymous token before.
   */
  searchProducts(query: string, options?: { need?: Measure }): Promise<Product[]>;
  /** The household's previously bought products that match, most frequently bought first. Needs the login. */
  searchPreviouslyBought(query: string): Promise<Product[]>;
  /** Mijn lijst. Needs the login. */
  readBasket(): Promise<Basket>;
  /**
   * Adds products and free-text notes to Mijn lijst; a product already there gets the quantity added to its line.
   * While an order is open for changes (`orderInFocus`), AH puts the products into that order instead.
   * Returns Mijn lijst after. Needs the login.
   */
  addToBasket(additions: AhBasketAdditions): Promise<Basket>;
  /**
   * Takes products (`quantity` packs off each line; at 0 the line goes) and notes out of Mijn lijst, skipping those
   * not there. Returns Mijn lijst after. Fails with AhError while an order is open for changes (`orderInFocus`):
   * whether AH's removals reach that order is unchecked, so it is changed in the app. Needs the login.
   */
  removeFromBasket(removals: AhBasketRemovals): Promise<Basket>;
  /**
   * A placed order (checked out, or reopened for changes) delivering in the Week Menu's week: from its Saturday
   * `weekStart` (YYYY-MM-DD) to the Friday after, so also another slot booked on the Late path. `date` is its delivery day.
   * The delivery subscription's empty orders for its slots don't count: Mijn lijst is checked out into them.
   * Null while the week's Basket is still only Mijn lijst. Needs the login.
   */
  placedOrder(weekStart: string): Promise<{ id: number; status: string; date: string } | null>;
  /**
   * The order open for changes in the AH app (picked when ordering from Mijn lijst, or reopened), or null when none
   * is. While there is one, `addToBasket` puts the products into it instead of Mijn lijst; notes still go to
   * Mijn lijst. `date` is its delivery day, `closes` when changes close (null when AH doesn't say). Needs the login.
   */
  orderInFocus(): Promise<OrderInFocus | null>;
  /** Allerhande's vegetarian main courses that match, most relevant first, without advertorials and baby food. */
  searchAllerhande(search: AllerhandeSearch): Promise<AllerhandeCandidate[]>;
  /** One Allerhande recipe by its number, in the shape `food recipe fetch` gives any recipe page. */
  allerhandeRecipe(id: number): Promise<RecipePage>;
  /** AH's product for each ingredient of an Allerhande recipe (recipeProductSuggestionsV2), in the recipe's order. */
  allerhandeSuggestions(id: number): Promise<ProductSuggestion[]>;
}

/** The AH gateway: the fake when the local config names a folder for it in `fakes.ah`, the real AH otherwise. */
export function ahGateway(config: Config): AhGateway {
  // Never in the Recipe Vault and never synced. AH rotates the refresh token, so only this Mac may hold it.
  const tokenFile = path.join(configDir(), "ah-token.json");
  const client: AhClient = config.fakes?.ah ? fakeAhClient(config.fakes.ah, tokenFile) : ahdumpClient(tokenFile);

  const loggedIn = () => access(tokenFile).then(() => true, () => false);

  return {
    async login() {
      await mkdir(configDir(), { recursive: true });
      await client.login();
      await chmod(tokenFile, 0o600);
    },
    async refreshLogin() {
      if (!(await loggedIn())) throw new AhLoginError();
      await client.refreshLogin();
    },
    async searchProducts(query, { need } = {}) {
      const token = (await loggedIn()) ? "user" : "anonymous";
      return rankProducts(await client.searchProducts(query, token), need);
    },
    async searchPreviouslyBought(query) {
      if (!(await loggedIn())) throw new AhLoginError();
      return previouslyBought(await client.searchByPurchaseFrequency(query));
    },
    async readBasket() {
      if (!(await loggedIn())) throw new AhLoginError();
      return basket(await client.basket());
    },
    async addToBasket(additions) {
      if (!(await loggedIn())) throw new AhLoginError();
      return basket(await client.addToBasket(additions));
    },
    async removeFromBasket(removals) {
      if (!(await loggedIn())) throw new AhLoginError();
      if (await client.activeOrder()) throw new AhError("An order is open for changes in the AH app: remove items from it in the app.");
      return basket(await client.removeFromBasket(removals));
    },
    async placedOrder(weekStart) {
      if (!(await loggedIn())) throw new AhLoginError();
      // Only a total of exactly 0 counts as empty: without a total, the order stays placed and nothing is written.
      const empty = (o: AhOrder) => o.totalPrice?.totalPrice?.amount === 0;
      const order = (await client.openOrders()).find((o) => inWeek(weekStart, o.delivery?.slot?.date) && !empty(o));
      return order ? { id: order.orderId, status: order.delivery?.status ?? "OPEN", date: order.delivery!.slot!.date! } : null;
    },
    async orderInFocus() {
      if (!(await loggedIn())) throw new AhLoginError();
      const active = await client.activeOrder();
      if (!active) return null;
      const date = active.deliveryInformation?.deliveryDate;
      if (!date) throw new AhError(`AH's order ${active.id}, open for changes, has no delivery date.`);
      const closing = (await client.openOrders()).find((o) => o.orderId === active.id)?.closingDateTime;
      return {
        id: active.id,
        date,
        closes: closing ? new Date(closing) : null,
        products: (active.orderedProducts ?? []).map(({ quantity, product }) => ({
          id: product.webshopId,
          title: product.title,
          quantity,
          price: product.currentPrice ?? product.priceBeforeBonus ?? null,
        })),
      };
    },
    async searchAllerhande({ text, season, cuisine, size = 20 }) {
      const filters = { ...VEGETARIAN_MAINS, ...(season ? { seizoen: [season] } : {}), ...(cuisine ? { keuken: [cuisine] } : {}) };
      const found = await client.searchRecipes({ text, filters, size });
      return found.filter(isFamilyDinner).map(candidate);
    },
    async allerhandeRecipe(id) {
      const recipe = await client.recipe(id);
      if (!recipe) throw new AhError(`Allerhande has no recipe R-R${id}.`);
      return recipePage(recipe);
    },
    async allerhandeSuggestions(id) {
      return (await client.recipeProductSuggestions(id)).map(productSuggestion);
    },
  };
}

function basket(ah: AhBasket): Basket {
  return {
    products: (ah.itemsInList ?? []).map(({ quantity, product }) => ({
      id: product.id,
      title: product.title,
      quantity,
      price: product.priceV2?.now?.amount ?? null,
    })),
    notes: (ah.notes ?? []).map(({ description, quantity }) => ({ description, quantity })),
  };
}
