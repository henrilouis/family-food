import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { AppleNotesError } from "./adapters/apple-notes/notes.ts";
import { displayTarget, DisplayTargetUnreachable } from "./adapters/display-target.ts";
import { buildBundle } from "./build-bundle.ts";
import { writeBundleFiles } from "./bundle-files.ts";
import { checkVault, formatCheck } from "./check.ts";
import { readConfig } from "./config.ts";
import { writeThisWeek } from "./this-week.ts";

export const UNREACHABLE_MESSAGE = "Kitchen Display not updated, run `food publish` at home";

/**
 * Publishes the current and upcoming Week Menus: checks what will be sent, builds the bundle and its
 * version file, and uploads them to the Kitchen Display as a new release.
 * Returns false when the vault check found errors; nothing was sent and the last good release stays.
 * An unreachable Pi is not a failure: the vault change stands and the next Publish sends everything.
 */
export async function publish(vault: string, now: Date, log: (line: string) => void): Promise<boolean> {
  const check = await checkVault(vault, { publishing: now });
  if (check.errors.length + check.warnings.length > 0) log(formatCheck(check).trimEnd());
  if (check.errors.length > 0) {
    log("Not published: fix the errors above. The Kitchen Display keeps its last release.");
    return false;
  }

  const config = await readConfig();
  const dir = await mkdtemp(path.join(os.tmpdir(), "food-release-"));
  try {
    const bundle = await buildBundle(vault, now);
    const version = await writeBundleFiles(dir, bundle);
    const release = releaseId(now);
    try {
      await displayTarget(config).publishRelease(dir, release);
      log(`Kitchen Display updated (release ${release}, version ${version.hash.slice(0, 12)}).`);
    } catch (error) {
      if (!(error instanceof DisplayTargetUnreachable)) throw error;
      log(UNREACHABLE_MESSAGE);
    }
    try {
      await writeThisWeek(config, bundle, now);
      log("This week note updated.");
    } catch (error) {
      if (!(error instanceof AppleNotesError)) throw error;
      log(`Warning: This week note not updated: ${error.message}`);
    }
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
  return true;
}

/** A release folder name that sorts by publish time, e.g. 20261121T090000Z. */
function releaseId(now: Date): string {
  return now.toISOString().replace(/[-:]/g, "").replace(/\.\d+Z$/, "Z");
}
