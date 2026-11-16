import { readFile } from "node:fs/promises";
import path from "node:path";
import type { AhClient, AhProduct } from "./client.ts";

/**
 * The fake AH. Its state is plain JSON in `folder`, so tests can seed it:
 * - `products.json`: the catalogue, as AH's REST search returns products
 * - `previously-bought.json`: webshop ids the household bought before, most frequently bought first
 */
export function fakeAhClient(folder: string): AhClient {
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
      throw new Error("not built yet");
    },
    async refreshLogin() {
      throw new Error("not built yet");
    },
    async searchProducts(query) {
      return search(query);
    },
    async searchByPurchaseFrequency() {
      throw new Error("not built yet");
    },
  };
}
