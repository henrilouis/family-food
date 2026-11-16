import path from "node:path";
import { configDir, type Config } from "../../config.ts";
import { ahdumpClient } from "./ahdump.ts";
import type { AhClient } from "./client.ts";
import { fakeAhClient } from "./fake.ts";
import { rankProducts, type Amount, type Product } from "./products.ts";

export { AhError, AhLoginError } from "./client.ts";
export { parseAmount, type Amount, type Product } from "./products.ts";

/**
 * Everything the `food` CLI does with Albert Heijn. It never removes items and never checks out.
 */
export interface AhGateway {
  /** Product search, cleaned up and ranked by unit price; `need` drops packs that would waste too much. */
  searchProducts(query: string, options?: { need?: Amount }): Promise<Product[]>;
}

/** The AH gateway: the fake when the local config names a folder for it in `fakes.ah`, the real AH otherwise. */
export function ahGateway(config: Config): AhGateway {
  const tokenFile = path.join(configDir(), "ah-token.json");
  const client: AhClient = config.fakes?.ah ? fakeAhClient(config.fakes.ah) : ahdumpClient(tokenFile);

  return {
    async searchProducts(query, { need } = {}) {
      return rankProducts(await client.searchProducts(query, "anonymous"), need);
    },
  };
}
