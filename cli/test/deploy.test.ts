import { mkdir, readdir, readFile, readlink, symlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, test } from "vitest";
import { sandbox } from "./harness.ts";

describe("food deploy", () => {
  describe("refuses unless the checkout is a clean main matching origin", () => {
    test("a tracked file with uncommitted changes", async () => {
      const box = await sandbox({ checkout: true });
      const target = await box.fake("display-target");
      await writeFile(path.join(box.checkout, "display/style.css"), "body { color: red }\n");

      const result = await box.run(["deploy"]);

      expect(result.code).toBe(1);
      expect(result.stderr).toMatch(/uncommitted changes/i);
      expect(result.stderr).toContain("display/style.css");
      expect(await readdir(target)).toEqual([]);
    });

    test("a branch other than main", async () => {
      const box = await sandbox({ checkout: true });
      const target = await box.fake("display-target");
      box.git(["switch", "--quiet", "--create", "try-out"]);
      box.git(["push", "--quiet", "--set-upstream", "origin", "try-out"]);

      const result = await box.run(["deploy"]);

      expect(result.code).toBe(1);
      expect(result.stderr).toMatch(/on branch try-out, not main/i);
      expect(await readdir(target)).toEqual([]);
    });

    test("a main with commits that aren't on origin", async () => {
      const box = await sandbox({ checkout: true });
      const target = await box.fake("display-target");
      await writeFile(path.join(box.checkout, "display/style.css"), "body { color: red }\n");
      box.git(["commit", "--quiet", "--all", "--message", "Not pushed"]);

      const result = await box.run(["deploy"]);

      expect(result.code).toBe(1);
      expect(result.stderr).toMatch(/main doesn't match origin/i);
      expect(await readdir(target)).toEqual([]);
    });

    test("a main that is behind origin", async () => {
      const box = await sandbox({ checkout: true });
      const target = await box.fake("display-target");
      const elsewhere = path.join(box.checkout, "../elsewhere");
      box.git(["clone", "--quiet", box.git(["remote", "get-url", "origin"]), elsewhere]);
      await writeFile(path.join(elsewhere, "display/style.css"), "body { color: red }\n");
      box.git(["commit", "--quiet", "--all", "--message", "Pushed from elsewhere"], elsewhere);
      box.git(["push", "--quiet"], elsewhere);

      const result = await box.run(["deploy"]);

      expect(result.code).toBe(1);
      expect(result.stderr).toMatch(/main doesn't match origin/i);
      expect(await readdir(target)).toEqual([]);
    });
  });

  test("on a clean main matching origin, it runs the setup script on the Pi and uploads the page", async () => {
    const box = await sandbox({ checkout: true });
    const target = await box.fake("display-target");

    const result = await box.run(["deploy"]);

    expect(result.stderr).toBe("");
    expect(result.code).toBe(0);
    const fake = JSON.parse(await readFile(path.join(target, "fake.json"), "utf8"));
    const piDir = path.join(box.checkout, "pi");
    const piFiles = (await readdir(piDir)).sort();
    expect(piFiles).toEqual(expect.arrayContaining(["setup.sh", "Caddyfile"]));
    expect(fake.setup).toEqual(
      Object.fromEntries(await Promise.all(piFiles.map(async (f) => [f, await readFile(path.join(piDir, f), "utf8")]))),
    );
    expect((await readdir(path.join(target, "page"))).sort()).toEqual(["index.html", "page.js", "style.css"]);
    expect(await readFile(path.join(target, "page/index.html"), "utf8")).toBe(
      await readFile(path.join(box.checkout, "display/index.html"), "utf8"),
    );
    expect(await readFile(path.join(target, "page/page.js"), "utf8")).toContain("bundle.json");
  });

  test("when the Pi can't be reached, it says so and fails", async () => {
    const box = await sandbox({ checkout: true });
    const target = await box.fake("display-target");
    await writeFile(path.join(target, "fake.json"), JSON.stringify({ unreachable: true }));

    const result = await box.run(["deploy"]);

    expect(result.code).toBe(1);
    expect(result.stderr).toMatch(/^Could not reach the Kitchen Display Pi/);
    expect(await readdir(target)).toEqual(["fake.json"]);
  });

  test("running it again changes nothing on the Pi", async () => {
    const box = await sandbox({ checkout: true });
    const target = await box.fake("display-target");

    await box.run(["deploy"]);
    const first = await snapshot(target);
    const again = await box.run(["deploy"]);

    expect(again.code).toBe(0);
    expect(await snapshot(target)).toEqual(first);
  });

  test("it repairs the page and leaves the published releases alone", async () => {
    const box = await sandbox({ checkout: true });
    const target = await box.fake("display-target");
    await box.run(["deploy"]);
    const deployed = await snapshot(target);
    await writeFile(path.join(target, "page/index.html"), "broken");
    await writeFile(path.join(target, "page/stray.js"), "left over");
    await mkdir(path.join(target, "releases/2026-11-20T18-00-00"), { recursive: true });
    await writeFile(path.join(target, "releases/2026-11-20T18-00-00/bundle.json"), "{}");
    await symlink("releases/2026-11-20T18-00-00", path.join(target, "current"));

    const result = await box.run(["deploy"]);

    expect(result.code).toBe(0);
    expect(await snapshot(target)).toEqual({
      ...deployed,
      "releases/2026-11-20T18-00-00/bundle.json": "{}",
      current: "-> releases/2026-11-20T18-00-00",
    });
  });
});

/** Every file under `dir` by relative path, with its content (or the target of a symlink). */
async function snapshot(dir: string): Promise<Record<string, string>> {
  const files: Record<string, string> = {};
  for (const entry of await readdir(dir, { recursive: true, withFileTypes: true })) {
    const file = path.join(entry.parentPath, entry.name);
    const name = path.relative(dir, file);
    if (entry.isSymbolicLink()) files[name] = `-> ${await readlink(file)}`;
    else if (entry.isFile()) files[name] = await readFile(file, "utf8");
  }
  return files;
}
