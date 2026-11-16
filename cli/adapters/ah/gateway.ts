import { access, chmod, mkdir } from "node:fs/promises";
import path from "node:path";
import { configDir, type Config } from "../../config.ts";
import { ahdumpClient } from "./ahdump.ts";
import { AhLoginError, type AhBasket, type AhBasketAdditions, type AhClient } from "./client.ts";
import { fakeAhClient } from "./fake.ts";
import { previouslyBought, rankProducts, type Amount, type Product } from "./products.ts";

export { AhError, AhLoginError, AhUnavailableError } from "./client.ts";
export { parseAmount, type Amount, type Product } from "./products.ts";
export type { AhBasketAdditions as BasketAdditions } from "./client.ts";

/** Mijn lijst: the Basket before checkout. */
export type Basket = {
  /** One line per product; `price` is the price of one pack now (Bonus included), null when AH doesn't say. */
  products: { id: number; title: string; quantity: number; price: number | null }[];
  /** Free-text notes. */
  notes: { description: string; quantity: number }[];
};

/**
 * Everything the `food` CLI does with Albert Heijn. It never removes items and never checks out.
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
  searchProducts(query: string, options?: { need?: Amount }): Promise<Product[]>;
  /** The household's previously bought products that match, most frequently bought first. Needs the login. */
  searchPreviouslyBought(query: string): Promise<Product[]>;
  /** Mijn lijst. Needs the login. */
  readBasket(): Promise<Basket>;
  /**
   * Adds products and free-text notes to Mijn lijst; a product already there gets the quantity added to its line.
   * Returns Mijn lijst after. Needs the login.
   */
  addToBasket(additions: AhBasketAdditions): Promise<Basket>;
  /**
   * The order for delivery on `date` (YYYY-MM-DD) once it is placed: checked out, or reopened for changes.
   * Null while that Saturday's Basket is still only Mijn lijst. Needs the login.
   */
  placedOrder(date: string): Promise<{ id: number; status: string } | null>;
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
    async placedOrder(date) {
      if (!(await loggedIn())) throw new AhLoginError();
      const order = (await client.openOrders()).find((o) => o.delivery?.slot?.date === date);
      return order ? { id: order.orderId, status: order.delivery?.status ?? "OPEN" } : null;
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
