import { readdir, readFile, readlink, writeFile } from "node:fs/promises";
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

  test("keeps only the last 3 releases, current pointing at the newest", async () => {
    const { run, fake } = await sandbox();
    const pi = await fake("display-target");
    const times = ["2026-11-21T10:00", "2026-11-21T11:00", "2026-11-21T12:00", "2026-11-21T13:00", "2026-11-21T14:00"];

    for (const now of times) expect((await run(["publish"], { now })).code).toBe(0);

    const kept = await releases(pi);
    expect(kept).toHaveLength(3);
    expect(await current(pi)).toBe(`releases/${kept[2]}`);
    const published = await Promise.all(
      kept.map(async (release) => (await readJson<DisplayBundle>(path.join(pi, "releases", release, "bundle.json"))).publishedAt),
    );
    expect(published).toEqual(times.slice(2).map((now) => new Date(now).toISOString()));
  });

  test("a vault check error stops the publish and the previous release stays current", async () => {
    const { run, fake, vault } = await sandbox();
    const pi = await fake("display-target");
    await run(["publish"], { now: "2026-11-21T10:00" });
    const before = await current(pi);
    const dahl = path.join(vault, "Meals/Dahl.md");
    await writeFile(dahl, (await readFile(dahl, "utf8")).replace("double: true", "double: false"));

    const result = await run(["publish"], { now: "2026-11-21T11:00" });

    expect(result.code).toBe(1);
    expect(result.stdout).toMatch(/error .*Week menus\/Week 2026-11-21\.md: .*Mon 23 Nov.*double: true/);
    expect(result.stdout).toContain("Not published");
    expect(result.stdout).not.toContain("Kitchen Display updated");
    expect(await releases(pi)).toHaveLength(1);
    expect(await current(pi)).toBe(before);
  });

  test("publishing unchanged content leaves the version hash unchanged", async () => {
    const { run, fake, vault } = await sandbox();
    const pi = await fake("display-target");
    const hash = async () => (await readJson<BundleVersion>(path.join(pi, "current/version.json"))).hash;

    await run(["publish"], { now: "2026-11-21T10:00" });
    const first = await hash();
    await run(["publish"], { now: "2026-11-21T11:00" });
    const unchanged = await hash();
    const dahl = path.join(vault, "Meals/Dahl.md");
    await writeFile(dahl, (await readFile(dahl, "utf8")).replace("Stir in *400g* spinach", "Stir in *500g* spinach"));
    await run(["publish"], { now: "2026-11-21T12:00" });
    const changed = await hash();

    expect(await releases(pi)).toHaveLength(3);
    expect(unchanged).toBe(first);
    expect(changed).not.toBe(first);
  });

  test("an unreachable Kitchen Display prints the run-at-home message and exits cleanly", async () => {
    const { run, fake, vault } = await sandbox();
    const pi = await fake("display-target");
    await writeFile(path.join(pi, "fake.json"), JSON.stringify({ unreachable: true }));
    const dahl = path.join(vault, "Meals/Dahl.md");
    const edited = (await readFile(dahl, "utf8")).replace("Stir in *400g* spinach", "Stir in *500g* spinach");
    await writeFile(dahl, edited);

    const result = await run(["publish"], { now: "2026-11-21T10:00" });

    expect(result.code).toBe(0);
    expect(result.stderr).toBe("");
    expect(result.stdout).toContain("Kitchen Display not updated, run `food publish` at home");
    expect(await readdir(pi)).toEqual(["fake.json"]);
    expect(await readFile(dahl, "utf8")).toBe(edited);
  });
});
