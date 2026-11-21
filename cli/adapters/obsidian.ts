import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fakesOnly, type Config } from "../config.ts";

/**
 * The Obsidian app on this Mac. Obsidian Sync carries the Recipe Vault between the Mac, the iPhone and the Boox
 * only while the app runs (ADR 0003), so without it the CLI reads a vault that may miss the other devices' edits.
 */
export interface ObsidianApp {
  running(): Promise<boolean>;
}

export const OBSIDIAN_NOT_RUNNING =
  "Warning: Obsidian isn't running on this Mac. Obsidian Sync only syncs the Recipe Vault while it runs, so the vault " +
  "may miss edits made on other devices, and changes made here won't reach them. Open Obsidian and let it sync.";

/**
 * The Obsidian app the local config asks for: the fake when `fakes.obsidian` names a folder (its `fake.json`
 * `{ "running": false }` plays a closed app), else the real one. Under tests without the fake it counts as running.
 */
export function obsidianApp(config: Config): ObsidianApp {
  const fake = config.fakes?.obsidian;
  if (fake) {
    return {
      async running() {
        const state = JSON.parse(await readFile(path.join(fake, "fake.json"), "utf8").catch(() => "{}"));
        return state.running !== false;
      },
    };
  }
  if (fakesOnly()) return { running: async () => true };
  return {
    running: () =>
      new Promise((resolve) => {
        // pgrep exits 1 when no process matches; anything else (it failing) is no reason to warn.
        execFile("pgrep", ["-xq", "Obsidian"], (error) => resolve(error?.code !== 1));
      }),
  };
}

/** The warning to show when Obsidian isn't running on this Mac; null when it is. */
export async function obsidianWarning(config: Config): Promise<string | null> {
  return (await obsidianApp(config).running()) ? null : OBSIDIAN_NOT_RUNNING;
}
