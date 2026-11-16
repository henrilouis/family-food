import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { AhError, type AhBasket, type AhBasketAdditions, type AhClient, type AhProduct } from "./client.ts";

/** The fake's Mijn lijst in `basket.json`: products by webshop id, and free-text notes. */
type FakeBasket = AhBasketAdditions;

/**
 * The fake AH. Its state is plain JSON in `folder`, so tests can seed it:
 * - `products.json`: the catalogue, as AH's REST search returns products
 * - `previously-bought.json`: webshop ids the household bought before, most frequently bought first
 * - `basket.json`: Mijn lijst, `{ products: [{ id, quantity }], notes: [{ description, quantity }] }`;
 *   titles and prices come from the catalogue
 * - `basket-requests.json`: every write it received, in order (`{ add: { products, notes } }`), so tests can
 *   check that nothing was ever removed
 * Logging in needs no browser: it writes a made-up token to the token file, as the real login would,
 * and each renewal rotates the made-up refresh token.
 */
export function fakeAhClient(folder: string, tokenFile: string): AhClient {
  const state = async <T>(file: string, empty: T): Promise<T> => {
    try {
      return JSON.parse(await readFile(path.join(folder, file), "utf8"));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return empty;
      throw error;
    }
  };

  const search = async (query: string): Promise<AhProduct[]> => {
    const words = query.toLowerCase().split(/\s+/).filter(Boolean);
    const catalogue = await state<AhProduct[]>("products.json", []);
    return catalogue.filter((p) => words.every((word) => p.title.toLowerCase().includes(word)));
  };

  const readBasket = () => state<FakeBasket>("basket.json", { products: [], notes: [] });

  const asAh = async (basket: FakeBasket): Promise<AhBasket> => {
    const catalogue = await state<AhProduct[]>("products.json", []);
    return {
      itemsInList: basket.products.map(({ id, quantity }) => {
        const product = catalogue.find((p) => p.webshopId === id);
        const price = product ? (product.currentPrice ?? product.priceBeforeBonus) : undefined;
        return {
          quantity,
          product: { id, title: product?.title ?? `Product ${id}`, priceV2: price === undefined ? null : { now: { amount: price } } },
        };
      }),
      notes: basket.notes,
    };
  };

  return {
    async login() {
      await writeFile(tokenFile, JSON.stringify({ access_token: "fake-access", refresh_token: "fake-refresh-1" }));
    },
    async refreshLogin() {
      const token = JSON.parse(await readFile(tokenFile, "utf8"));
      const renewals = Number(String(token.refresh_token).split("-").pop()) || 0;
      await writeFile(tokenFile, JSON.stringify({ ...token, refresh_token: `fake-refresh-${renewals + 1}` }));
    },
    async searchProducts(query, token) {
      const bought = token === "user" ? await state<number[]>("previously-bought.json", []) : [];
      return (await search(query)).map((p) => ({ ...p, isPreviouslyBought: bought.includes(p.webshopId) }));
    },
    async searchByPurchaseFrequency(query) {
      const bought = await state<number[]>("previously-bought.json", []);
      const rank = (p: AhProduct) => (bought.includes(p.webshopId) ? bought.indexOf(p.webshopId) : Infinity);
      return (await search(query))
        .map((p) => ({ ...p, isPreviouslyBought: bought.includes(p.webshopId) }))
        .sort((a, b) => rank(a) - rank(b));
    },
    async basket() {
      return asAh(await readBasket());
    },
    async addToBasket(additions) {
      const catalogue = await state<AhProduct[]>("products.json", []);
      const unknown = additions.products.filter(({ id }) => !catalogue.some((p) => p.webshopId === id));
      if (unknown.length) throw new AhError(`AH doesn't know product ${unknown.map((p) => p.id).join(", ")}`);
      const requests = await state<unknown[]>("basket-requests.json", []);
      await writeFile(path.join(folder, "basket-requests.json"), JSON.stringify([...requests, { add: additions }], null, 2));
      const basket = await readBasket();
      for (const { id, quantity } of additions.products) {
        const line = basket.products.find((p) => p.id === id);
        if (line) line.quantity += quantity;
        else basket.products.push({ id, quantity });
      }
      basket.notes.push(...additions.notes);
      await writeFile(path.join(folder, "basket.json"), JSON.stringify(basket, null, 2));
      return asAh(basket);
    },
  };
}
