import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import type { ChildProcess } from "node:child_process";
import { sandbox } from "./harness.ts";

let server: ChildProcess | undefined;
afterEach(() => {
  server?.kill();
  server = undefined;
});

async function preview() {
  const box = await sandbox();
  const { process, match } = await box.start(["preview", "--port", "0"], /(http:\/\/localhost:\d+\/)/, { now: "2026-11-23T18:00" });
  server = process;
  return { ...box, url: match[1] };
}

describe("food preview", () => {
  test("serves the Kitchen Display page with the script and stylesheet it links to", async () => {
    const { url } = await preview();

    const page = await fetch(url);
    const html = await page.text();
    const linked = [...html.matchAll(/(?:src|href)="([^"]+)"/g)].map((m) => m[1]);
    const responses = await Promise.all(linked.map((file) => fetch(new URL(file, url))));

    expect(page.status).toBe(200);
    expect(page.headers.get("content-type")).toContain("text/html");
    expect(responses.map((r) => [r.status, r.headers.get("content-type")?.split(";")[0]])).toEqual(
      expect.arrayContaining([
        [200, "text/javascript"],
        [200, "text/css"],
      ]),
    );
  });

  test("serves a bundle built from the Recipe Vault as it is now", async () => {
    const { url, vault } = await preview();

    const before = await (await fetch(new URL("bundle.json", url))).json();
    const dahl = path.join(vault, "Meals/Dahl.md");
    await writeFile(dahl, (await readFile(dahl, "utf8")).replace("# Dahl", "# Red lentil dahl"));
    const after = await (await fetch(new URL("bundle.json", url))).json();

    expect(before.schemaVersion).toBe(1);
    expect(before.recipes["Dahl"].title).toBe("Dahl");
    expect(after.recipes["Dahl"].title).toBe("Red lentil dahl");
  });

  test("serves the bundle's version file, whose hash follows the Recipe Vault", async () => {
    const { url, vault } = await preview();
    const version = async () => (await fetch(new URL("version.json", url))).json();

    const first = await version();
    const again = await version();
    const dahl = path.join(vault, "Meals/Dahl.md");
    await writeFile(dahl, (await readFile(dahl, "utf8")).replace("# Dahl", "# Red lentil dahl"));
    const changed = await version();

    expect(first).toEqual({ hash: expect.any(String) });
    expect(again).toEqual(first);
    expect(changed.hash).not.toBe(first.hash);
  });

  test("answers 404 for anything else", async () => {
    const { url } = await preview();

    expect((await fetch(new URL("secrets.txt", url))).status).toBe(404);
  });
});
