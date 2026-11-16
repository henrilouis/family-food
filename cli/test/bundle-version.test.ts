import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, test } from "vitest";
import { sandbox, type Sandbox } from "./harness.ts";

async function writeBundle({ run }: Sandbox, now: string) {
  const out = await mkdtemp(path.join(os.tmpdir(), "food-bundle-"));
  const result = await run(["bundle", "--out", out], { now });
  if (result.code !== 0) throw new Error(`food bundle --out exited with ${result.code}:\n${result.stderr}`);
  return {
    bundle: JSON.parse(await readFile(path.join(out, "bundle.json"), "utf8")),
    version: JSON.parse(await readFile(path.join(out, "version.json"), "utf8")),
  };
}

describe("food bundle --out", () => {
  test("writes the bundle and, next to it, a version file holding a content hash", async () => {
    const box = await sandbox();

    const { bundle, version } = await writeBundle(box, "2026-11-21T10:00");

    expect(bundle.schemaVersion).toBe(1);
    expect(bundle.recipes["Dahl"].title).toBe("Dahl");
    expect(version).toEqual({ hash: expect.stringMatching(/^[0-9a-f]{16,}$/) });
  });

  test("keeps the same hash when nothing changed but the publish time", async () => {
    const box = await sandbox();

    const first = await writeBundle(box, "2026-11-21T10:00");
    const second = await writeBundle(box, "2026-11-21T16:30");

    expect(second.bundle.publishedAt).not.toBe(first.bundle.publishedAt);
    expect(second.version.hash).toBe(first.version.hash);
  });

  test("changes the hash when a Recipe on the Week Menu changes", async () => {
    const box = await sandbox();
    const before = await writeBundle(box, "2026-11-21T10:00");

    const dahl = path.join(box.vault, "Meals/Dahl.md");
    await writeFile(dahl, (await readFile(dahl, "utf8")).replace("# Dahl", "# Red lentil dahl"));
    const after = await writeBundle(box, "2026-11-21T10:00");

    expect(after.version.hash).not.toBe(before.version.hash);
  });

  test("still prints the bundle without --out", async () => {
    const { run } = await sandbox();

    const result = await run(["bundle"], { now: "2026-11-21T10:00" });

    expect(JSON.parse(result.stdout).schemaVersion).toBe(1);
  });
});
