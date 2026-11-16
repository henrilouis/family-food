import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { BUNDLE_FILE, VERSION_FILE, type BundleVersion, type DisplayBundle } from "../bundle/bundle.ts";

/** The bundle's version: a hash of everything in it but the publish time. */
export function bundleVersion(bundle: DisplayBundle): BundleVersion {
  const { publishedAt: _, ...content } = bundle;
  return { hash: createHash("sha256").update(JSON.stringify(content)).digest("hex") };
}

/** Writes the bundle and its version file into `dir` (created if needed), and returns the version. */
export async function writeBundleFiles(dir: string, bundle: DisplayBundle): Promise<BundleVersion> {
  const version = bundleVersion(bundle);
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, BUNDLE_FILE), JSON.stringify(bundle, null, 2) + "\n");
  await writeFile(path.join(dir, VERSION_FILE), JSON.stringify(version) + "\n");
  return version;
}
