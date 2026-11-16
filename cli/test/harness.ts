import { execFile, spawn, type ChildProcess } from "node:child_process";
import { cp, mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const food = path.join(repo, "cli/food.ts");
const sampleVaultDir = path.join(repo, "samples/Recipes");

export type RunResult = { code: number; stdout: string; stderr: string };

export type Sandbox = {
  /** The temp copy of the sample Recipe Vault. */
  vault: string;
  /** Runs the real `food` CLI. `now` is local time, e.g. "2026-11-21T10:00". */
  run(args: string[], options?: { now?: string }): Promise<RunResult>;
  /** Starts a long-running `food` command and resolves once it printed a line matching `ready`. */
  start(args: string[], ready: RegExp, options?: { now?: string }): Promise<{ process: ChildProcess; match: RegExpMatchArray }>;
};

/**
 * A temp copy of the sample Recipe Vault and an empty local config, both thrown away after the test.
 * With `configured` (the default) the vault path is already set in the local config.
 */
export async function sandbox({ configured = true } = {}): Promise<Sandbox> {
  const root = await mkdtemp(path.join(os.tmpdir(), "food-test-"));
  const vault = path.join(root, "Recipes");
  await cp(sampleVaultDir, vault, { recursive: true });
  const env = (now?: string) => ({
    ...process.env,
    FOOD_CONFIG_DIR: path.join(root, "config"),
    ...(now ? { FOOD_NOW: now } : {}),
  });

  const run: Sandbox["run"] = (args, { now } = {}) =>
    new Promise((resolve) => {
      execFile(process.execPath, [food, ...args], { env: env(now), cwd: root }, (error, stdout, stderr) => {
        resolve({ code: error ? (typeof error.code === "number" ? error.code : 1) : 0, stdout, stderr });
      });
    });

  const start: Sandbox["start"] = (args, ready, { now } = {}) =>
    new Promise((resolve, reject) => {
      const child = spawn(process.execPath, [food, ...args], { env: env(now), cwd: root });
      let out = "";
      child.stdout.on("data", (chunk) => {
        out += chunk;
        const match = out.match(ready);
        if (match) resolve({ process: child, match });
      });
      child.stderr.on("data", (chunk) => (out += chunk));
      child.on("exit", (code) => reject(new Error(`food ${args.join(" ")} exited with ${code}:\n${out}`)));
    });

  if (configured) {
    const result = await run(["config", "vault", vault]);
    if (result.code !== 0) throw new Error(`could not configure the sample vault:\n${result.stderr}`);
  }
  return { vault, run, start };
}
