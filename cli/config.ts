import { mkdir, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

// The local config lives outside the Recipe Vault, in the user's Application Support folder.
export type Config = {
  /** Absolute path of the Recipe Vault. */
  vault?: string;
};

const configDir = () =>
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
