import { mkdir, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

// The local config lives outside the Recipe Vault, in the user's Application Support folder.
export type Config = {
  vault?: string;
  /** Adapters replaced by their local-folder fake, by adapter name (see `cli/adapters/`). No key → the real adapter. */
  fakes?: { ah?: string; "apple-notes"?: string; obsidian?: string };
};

/**
 * Set for every test, and the CLI processes they start, by `vitest.config.ts`: the real AH, Apple Notes and recipe
 * sites off this Mac refuse, so a test that forgets its fake can't reach the household's accounts or the web.
 * The Obsidian check counts the app as running.
 */
export const fakesOnly = () => process.env.FOOD_FAKES_ONLY === "1";

export const configDir = () =>
  process.env.FOOD_CONFIG_DIR ?? path.join(os.homedir(), "Library/Application Support/family-food");
const configFile = () => path.join(configDir(), "config.json");

export async function readConfig(): Promise<Config> {
  try {
    return JSON.parse(await readFile(configFile(), "utf8"));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return {};
    throw error;
  }
}

export async function writeConfig(config: Config): Promise<void> {
  await mkdir(configDir(), { recursive: true });
  await writeFile(configFile(), JSON.stringify(config, null, 2) + "\n");
}
