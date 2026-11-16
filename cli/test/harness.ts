import { execFile, execFileSync, spawn, type ChildProcess } from "node:child_process";
import { cp, mkdir, mkdtemp, readFile, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { DisplayBundle } from "../../bundle/bundle.ts";

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const sampleVaultDir = path.join(repo, "samples/Recipes");

/** Git without the user's own config (signing, hooks, default branch), so tests behave the same everywhere. */
const gitEnv = {
  GIT_CONFIG_GLOBAL: "/dev/null",
  GIT_CONFIG_NOSYSTEM: "1",
  GIT_AUTHOR_NAME: "Test",
  GIT_AUTHOR_EMAIL: "test@example.com",
  GIT_COMMITTER_NAME: "Test",
  GIT_COMMITTER_EMAIL: "test@example.com",
};

export type RunResult = { code: number; stdout: string; stderr: string };

/** Adapters with a local-folder fake (see `cli/adapters/`). */
export type FakeAdapter = "display-target" | "ah";

export type Sandbox = {
  /** The temp copy of the sample Recipe Vault. */
  vault: string;
  /** The local config folder (`FOOD_CONFIG_DIR`). */
  configDir: string;
  /** With `checkout`: the temp git checkout of this repo the CLI runs from, on a clean `main` pushed to `origin`. */
  checkout: string;
  /** Runs git in `dir` (the checkout by default) and returns its trimmed output. */
  git(args: string[], dir?: string): string;
  /** Points the local config at a fake for `adapter` and returns the fake's folder. */
  fake(adapter: FakeAdapter): Promise<string>;
  /** Runs the real `food` CLI. `now` is local time, e.g. "2026-11-21T10:00". */
  run(args: string[], options?: { now?: string }): Promise<RunResult>;
  /** Runs `food bundle` at local time `now` and parses the bundle it prints. */
  bundle(now: string): Promise<DisplayBundle>;
  /** Starts a long-running `food` command and resolves once it printed a line matching `ready`. */
  start(args: string[], ready: RegExp, options?: { now?: string }): Promise<{ process: ChildProcess; match: RegExpMatchArray }>;
};

/**
 * Copies this repo's files (as they are now, committed or not) into a fresh git repo on `main`,
 * pushed to a bare `origin` next to it. The CLI run from there sees a clean `main` matching `origin`.
 */
async function makeCheckout(root: string): Promise<string> {
  const checkout = path.join(root, "checkout");
  const files = execFileSync("git", ["ls-files", "--cached", "--others", "--exclude-standard", "-z"], { cwd: repo, encoding: "utf8" })
    .split("\0")
    .filter(Boolean);
  for (const file of files) {
    await mkdir(path.dirname(path.join(checkout, file)), { recursive: true });
    await cp(path.join(repo, file), path.join(checkout, file)).catch((error) => {
      // A file deleted in the working tree but not yet committed.
      if (error.code !== "ENOENT") throw error;
    });
  }
  await symlink(path.join(repo, "node_modules"), path.join(checkout, "node_modules"));
  const git = (args: string[], cwd = checkout) => execFileSync("git", args, { cwd, env: { ...process.env, ...gitEnv } });
  git(["init", "--quiet", "--bare", "--initial-branch=main", path.join(root, "origin.git")], root);
  git(["init", "--quiet", "--initial-branch=main"]);
  await writeFile(path.join(checkout, ".git/info/exclude"), "node_modules\n");
  git(["add", "--all"]);
  git(["commit", "--quiet", "--message", "Test checkout"]);
  git(["remote", "add", "origin", path.join(root, "origin.git")]);
  git(["push", "--quiet", "--set-upstream", "origin", "main"]);
  return checkout;
}

/**
 * A temp copy of the sample Recipe Vault and an empty local config, both thrown away after the test.
 * With `configured` (the default) the vault path is already set in the local config.
 * With `checkout` the CLI runs from a temp git checkout of this repo (see `makeCheckout`).
 */
export async function sandbox({ configured = true, checkout: withCheckout = false } = {}): Promise<Sandbox> {
  const root = await mkdtemp(path.join(os.tmpdir(), "food-test-"));
  const vault = path.join(root, "Recipes");
  await cp(sampleVaultDir, vault, { recursive: true });
  const checkout = withCheckout ? await makeCheckout(root) : "";
  const food = path.join(checkout || repo, "cli/food.ts");
  const configDir = path.join(root, "config");
  const env = (now?: string) => ({
    ...process.env,
    ...gitEnv,
    FOOD_CONFIG_DIR: configDir,
    ...(now ? { FOOD_NOW: now } : {}),
  });

  const git: Sandbox["git"] = (args, dir = checkout) =>
    execFileSync("git", args, { cwd: dir, env: env(), encoding: "utf8" }).trim();

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

  const bundle: Sandbox["bundle"] = async (now) => {
    const result = await run(["bundle"], { now });
    if (result.code !== 0) throw new Error(`food bundle exited with ${result.code}:\n${result.stderr}`);
    return JSON.parse(result.stdout);
  };

  if (configured) {
    const result = await run(["config", "vault", vault]);
    if (result.code !== 0) throw new Error(`could not configure the sample vault:\n${result.stderr}`);
  }
  return { vault, configDir, checkout, git, fake, run, bundle, start };
}
