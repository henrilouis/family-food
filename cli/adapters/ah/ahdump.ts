import { execFile, spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  AhError,
  AhLoginError,
  AhUnavailableError,
  type AhBasket,
  type AhClient,
  type AhOrder,
  type AhProduct,
  type AhRecipe,
  type AhRecipeProductSuggestion,
  type AhRecipeSummary,
} from "./client.ts";

/** Built by `npm run build:ahdump` from `ahdump/` in this repo. */
const binary = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../ahdump/ahdump");

/** ahdump's exit code when the user token is missing, or AH refused to renew it. */
const loginExitCode = 3;
/** ahdump's exit code when AH didn't answer or answered with a server error. */
const unavailableExitCode = 4;

const notBuilt = () => new AhError("The AH client isn't built. Run `npm run build:ahdump` (needs Go).");

function failure(code: number | null, stderr: string): Error {
  if (code === loginExitCode) return new AhLoginError("AH login expired. Run `food ah login` again.");
  if (code === unavailableExitCode) return new AhUnavailableError(`AH is not answering: ${stderr.trim()}`);
  return new AhError(`The AH client failed: ${stderr.trim() || `exit code ${code}`}`);
}

/** The real AH, through the Go `ahdump` tool (appie-go, pinned to the fork that fixes the November 2026 login change). */
export function ahdumpClient(tokenFile: string): AhClient {
  const ahdump = (args: string[], input?: string): Promise<string> =>
    new Promise((resolve, reject) => {
      if (process.env.VITEST) return reject(new AhError("The real AH is off in tests; use the ah fake."));
      const child = execFile(binary, ["-auth", tokenFile, ...args], { maxBuffer: 16 * 1024 * 1024 }, (error, stdout, stderr) => {
        if (!error) return resolve(stdout);
        if ((error as NodeJS.ErrnoException).code === "ENOENT") return reject(notBuilt());
        reject(failure(typeof error.code === "number" ? error.code : null, stderr));
      });
      child.stdin?.end(input ?? "");
    });

  const products = async (args: string[]): Promise<AhProduct[]> => JSON.parse(await ahdump(args));

  return {
    login: () =>
      new Promise((resolve, reject) => {
        if (process.env.VITEST) return reject(new AhError("The real AH is off in tests; use the ah fake."));
        // The person logging in sees ahdump's messages, e.g. the login URL in case the browser doesn't open.
        const child = spawn(binary, ["-auth", tokenFile, "login"], { stdio: "inherit" });
        child.on("error", (error) => reject((error as NodeJS.ErrnoException).code === "ENOENT" ? notBuilt() : error));
        child.on("exit", (code) => (code === 0 ? resolve() : reject(failure(code, ""))));
      }),
    refreshLogin: async () => {
      await ahdump(["refresh"]);
    },
    searchProducts: (query, token) => products(["search", "-token", token, "--", query]),
    searchByPurchaseFrequency: (query) =>
      products(["search", "-token", "user", "-sort", "PURCHASE_FREQUENCY", "--", query]),
    basket: async (): Promise<AhBasket> => JSON.parse(await ahdump(["basket"])),
    addToBasket: async (additions): Promise<AhBasket> => JSON.parse(await ahdump(["basket-add"], JSON.stringify(additions))),
    openOrders: async (): Promise<AhOrder[]> => JSON.parse(await ahdump(["orders"])),
    searchRecipes: async ({ text, filters, size }): Promise<AhRecipeSummary[]> => {
      const filterArgs = Object.entries(filters).flatMap(([group, values]) => values.flatMap((value) => ["-filter", `${group}=${value}`]));
      return JSON.parse(await ahdump(["recipes", "-size", String(size), ...filterArgs, "--", ...(text ? [text] : [])]));
    },
    recipe: async (id): Promise<AhRecipe | null> => JSON.parse(await ahdump(["recipe", String(id)])),
    recipeProductSuggestions: async (id): Promise<AhRecipeProductSuggestion[]> =>
      JSON.parse(await ahdump(["recipe-suggestions", String(id)])),
  };
}
