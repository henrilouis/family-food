import { execFile } from "node:child_process";
import { cp, mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const sampleVaultDir = path.join(repo, "samples/Recipes");

export type RunResult = { code: number; stdout: string; stderr: string };

/** Adapters with a local-folder fake (see `cli/adapters/`). */
export type FakeAdapter = "ah" | "apple-notes" | "obsidian";

export type Sandbox = {
  /** The temp copy of the sample Recipe Vault. */
  vault: string;
  /** The local config folder (`FOOD_CONFIG_DIR`). */
  configDir: string;
  /** Points the local config at a fake for `adapter` and returns the fake's folder. */
  fake(adapter: FakeAdapter): Promise<string>;
  /** Runs the real `food` CLI. `now` is local time, e.g. "2026-11-21T10:00". */
  run(args: string[], options?: { now?: string }): Promise<RunResult>;
};

/**
 * A temp copy of the sample Recipe Vault and an empty local config, both thrown away after the test.
 * With `configured` (the default) the vault path is already set in the local config.
 */
export async function sandbox({ configured = true } = {}): Promise<Sandbox> {
  const root = await mkdtemp(path.join(os.tmpdir(), "food-test-"));
  const vault = path.join(root, "Recipes");
  await cp(sampleVaultDir, vault, { recursive: true });
  const food = path.join(repo, "cli/food.ts");
  const configDir = path.join(root, "config");
  const env = (now?: string) => ({
    ...process.env,
    FOOD_CONFIG_DIR: configDir,
    ...(now ? { FOOD_NOW: now } : {}),
  });

  const fake: Sandbox["fake"] = async (adapter) => {
    const folder = path.join(root, "fakes", adapter);
    await mkdir(folder, { recursive: true });
    const configFile = path.join(configDir, "config.json");
    const config = JSON.parse(await readFile(configFile, "utf8").catch(() => "{}"));
    config.fakes = { ...config.fakes, [adapter]: folder };
    await mkdir(configDir, { recursive: true });
    await writeFile(configFile, JSON.stringify(config, null, 2) + "\n");
    return folder;
  };

  const run: Sandbox["run"] = (args, { now } = {}) =>
    new Promise((resolve) => {
      execFile(process.execPath, [food, ...args], { env: env(now), cwd: root }, (error, stdout, stderr) => {
        resolve({ code: error ? (typeof error.code === "number" ? error.code : 1) : 0, stdout, stderr });
      });
    });

  if (configured) {
    const result = await run(["config", "vault", vault]);
    if (result.code !== 0) throw new Error(`could not configure the sample vault:\n${result.stderr}`);
  }
  return { vault, configDir, fake, run };
}
