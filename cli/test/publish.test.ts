import { readdir, readFile, readlink } from "node:fs/promises";
import path from "node:path";
import { describe, expect, test } from "vitest";
import type { BundleVersion, DisplayBundle } from "../../bundle/bundle.ts";
import { sandbox } from "./harness.ts";

const releases = (pi: string) => readdir(path.join(pi, "releases")).then((names) => names.sort());
const current = (pi: string) => readlink(path.join(pi, "current"));
const readJson = async <T>(file: string): Promise<T> => JSON.parse(await readFile(file, "utf8"));

describe("food publish", () => {
  test("uploads the bundle into a new release folder and points current at it", async () => {
    const { run, fake } = await sandbox();
    const pi = await fake("display-target");

    const result = await run(["publish"], { now: "2026-11-21T10:00" });

    expect(result.stderr).toBe("");
    expect(result.code).toBe(0);
    expect(result.stdout).toContain("Kitchen Display updated");
    const [release] = await releases(pi);
    expect(await current(pi)).toBe(`releases/${release}`);
    const bundle = await readJson<DisplayBundle>(path.join(pi, "current/bundle.json"));
    expect(bundle.weekMenus.map((week) => week.weekStart)).toEqual(["2026-11-21"]);
    expect(bundle.publishedAt).toBe(new Date("2026-11-21T10:00").toISOString());
    const version = await readJson<BundleVersion>(path.join(pi, "current/version.json"));
    expect(version.hash).toMatch(/^[0-9a-f]{64}$/);
  });
});
