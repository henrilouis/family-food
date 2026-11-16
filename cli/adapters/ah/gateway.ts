import { access, chmod, mkdir } from "node:fs/promises";
import path from "node:path";
import { configDir, type Config } from "../../config.ts";
import { ahdumpClient } from "./ahdump.ts";
import { AhLoginError, type AhClient } from "./client.ts";
import { fakeAhClient } from "./fake.ts";
import { previouslyBought, rankProducts, type Amount, type Product } from "./products.ts";

export { AhError, AhLoginError } from "./client.ts";
export { parseAmount, type Amount, type Product } from "./products.ts";

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
  };
}
