import { readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  AhError,
  AhLoginError,
  AhUnavailableError,
  type AhBasket,
  type AhBasketAdditions,
  type AhClient,
  type AhOrder,
  type AhProduct,
  type AhRecipe,
  type AhRecipeProductSuggestion,
  type AhRecipeSummary,
} from "./client.ts";

/** The fake's Mijn lijst in `basket.json`: products by webshop id, and free-text notes. */
type FakeBasket = AhBasketAdditions;

type Mode =
  | { mode: "order placed"; date: string; status?: string }
  | { mode: "login expired"; loginFixesIt?: boolean }
  | { mode: "AH down" };

/**
 * The fake AH. Its state is plain JSON in `folder`, so tests can seed it:
 * - `products.json`: the catalogue, as AH's REST search returns products
 * - `previously-bought.json`: webshop ids the household bought before, most frequently bought first
 * - `basket.json`: Mijn lijst, `{ products: [{ id, quantity }], notes: [{ description, quantity }] }`;
 *   titles and prices come from the catalogue
 * - `basket-requests.json`: every write it received, in order (`{ add: { products, notes } }`), so tests can
 *   check that nothing was ever removed
 * - `mode.json`: how AH behaves; missing means all is well.
 *   `{ "mode": "order placed", "date": "2026-11-28", "status": "SUBMITTED" }`: the order for delivery on `date`
 *   is checked out (`status` defaults to SUBMITTED; REOPENED means reopened for changes)
 *   `{ "mode": "login expired" }`: AH refuses the user token; logging in again doesn't help, unless
 *   `"loginFixesIt": true`, when a login ends this mode
 *   `{ "mode": "AH down" }`: every request fails as when AH's ordering is down
 * - `logins.json`: how many times someone logged in
 * - `recipes.json`: Allerhande, as AH's GraphQL `recipe(id)` returns recipes. Search finds those with every query
 *   word in the title and, per filter group, a tag `{ key: <group>, value: <one of the values> }`
 * - `recipe-suggestions.json`: AH's product suggestions by recipe id, as `recipeProductSuggestionsV2` returns them
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

  const mode = () => state<Mode | null>("mode.json", null);

  /** Fails like AH does in the current mode; `user` for a request with the user token. */
  const request = async (user: boolean) => {
    const current = (await mode())?.mode;
    if (current === "AH down") throw new AhUnavailableError("AH is not answering: 503 Service Unavailable (fake)");
    if (user && current === "login expired") throw new AhLoginError("AH login expired. Run `food ah login` again.");
  };
  const asUser = () => request(true);

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

  const recipes = () => state<AhRecipe[]>("recipes.json", []);

  const summary = (r: AhRecipe): AhRecipeSummary => ({
    id: r.id,
    title: r.title,
    slug: r.href?.split("/").pop() || null,
    time: { cook: r.cookTime, oven: r.ovenTime, wait: r.waitTime },
    serving: { number: r.servings?.number },
    rating: r.rating,
    tags: r.tags,
  });

  return {
    async login() {
      await request(false);
      const current = await mode();
      if (current?.mode === "login expired" && current.loginFixesIt) await rm(path.join(folder, "mode.json"));
      await writeFile(path.join(folder, "logins.json"), String((await state<number>("logins.json", 0)) + 1));
      await writeFile(tokenFile, JSON.stringify({ access_token: "fake-access", refresh_token: "fake-refresh-1" }));
    },
    async refreshLogin() {
      await asUser();
      const token = JSON.parse(await readFile(tokenFile, "utf8"));
      const renewals = Number(String(token.refresh_token).split("-").pop()) || 0;
      await writeFile(tokenFile, JSON.stringify({ ...token, refresh_token: `fake-refresh-${renewals + 1}` }));
    },
    async searchProducts(query, token) {
      await request(token === "user");
      const bought = token === "user" ? await state<number[]>("previously-bought.json", []) : [];
      return (await search(query)).map((p) => ({ ...p, isPreviouslyBought: bought.includes(p.webshopId) }));
    },
    async searchByPurchaseFrequency(query) {
      await asUser();
      const bought = await state<number[]>("previously-bought.json", []);
      const rank = (p: AhProduct) => (bought.includes(p.webshopId) ? bought.indexOf(p.webshopId) : Infinity);
      return (await search(query))
        .map((p) => ({ ...p, isPreviouslyBought: bought.includes(p.webshopId) }))
        .sort((a, b) => rank(a) - rank(b));
    },
    async basket() {
      await asUser();
      return asAh(await readBasket());
    },
    async addToBasket(additions) {
      await asUser();
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
    async openOrders(): Promise<AhOrder[]> {
      await asUser();
      const current = await mode();
      if (current?.mode !== "order placed") return [];
      return [{ orderId: 1, delivery: { status: current.status ?? "SUBMITTED", slot: { date: current.date } } }];
    },
    async searchRecipes({ text, filters, size }) {
      await request(false);
      const words = (text ?? "").toLowerCase().split(/\s+/).filter(Boolean);
      const tagged = (r: AhRecipe, group: string, values: string[]) =>
        (r.tags ?? []).some((tag) => tag.key === group && values.includes(tag.value));
      return (await recipes())
        .filter((r) => words.every((word) => r.title.toLowerCase().includes(word)))
        .filter((r) => Object.entries(filters).every(([group, values]) => tagged(r, group, values)))
        .slice(0, size)
        .map(summary);
    },
    async recipe(id) {
      await request(false);
      return (await recipes()).find((r) => r.id === id) ?? null;
    },
    async recipeProductSuggestions(id) {
      await request(false);
      return (await state<Record<string, AhRecipeProductSuggestion[]>>("recipe-suggestions.json", {}))[id] ?? [];
    },
  };
}
