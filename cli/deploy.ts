import { execFile } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { displayTarget } from "./adapters/display-target.ts";
import { writePage } from "./page.ts";

const checkout = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/** Deploy stopped before touching the Kitchen Display Pi; the message says why. */
export class DeployRefused extends Error {}

const git = async (...args: string[]) => (await promisify(execFile)("git", args, { cwd: checkout })).stdout.trim();

/** Refuses unless this checkout is a clean `main` that matches `origin`. */
async function guard(): Promise<void> {
  const dirty = await git("status", "--porcelain");
  if (dirty) throw new DeployRefused(`Not deploying: the checkout has uncommitted changes.\n${dirty}`);
  const branch = await git("branch", "--show-current");
  if (branch !== "main") throw new DeployRefused(`Not deploying: the checkout is on branch ${branch || "(detached)"}, not main.`);
  await git("fetch", "--quiet", "origin", "main").catch((error) => {
    throw new DeployRefused(`Not deploying: could not fetch main from origin to compare.\n${error.stderr ?? error.message}`);
  });
  const [local, remote] = [await git("rev-parse", "HEAD"), await git("rev-parse", "origin/main")];
  if (local !== remote) {
    throw new DeployRefused(
      `Not deploying: main doesn't match origin (local ${local.slice(0, 7)}, origin ${remote.slice(0, 7)}). Push or pull first.`,
    );
  }
}

/**
 * Sets up, updates or repairs the Kitchen Display Pi from this checkout: runs `pi/setup.sh` there
 * (Caddy and its config, key-only SSH, unattended upgrades), then uploads the page.
 */
export async function deploy(log: (line: string) => void): Promise<void> {
  await guard();
  const target = await displayTarget();
  log((await target.setup(path.join(checkout, "pi"))).trimEnd());
  const page = await mkdtemp(path.join(os.tmpdir(), "food-page-"));
  try {
    await writePage(page);
    await target.uploadPage(page);
  } finally {
    await rm(page, { recursive: true, force: true });
  }
  log("Kitchen Display page uploaded.");
}
