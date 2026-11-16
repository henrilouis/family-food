import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { AhClient, AhProduct } from "./client.ts";

/**
 * The fake AH. Its state is plain JSON in `folder`, so tests can seed it:
 * - `products.json`: the catalogue, as AH's REST search returns products
 * - `previously-bought.json`: webshop ids the household bought before, most frequently bought first
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
  };
}
