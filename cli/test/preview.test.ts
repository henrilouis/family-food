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
  test("serves the Kitchen Display page and its script", async () => {
    const { url } = await preview();

    const page = await fetch(url);
    const html = await page.text();
    const script = await fetch(new URL("page.js", url));

    expect(page.status).toBe(200);
    expect(page.headers.get("content-type")).toContain("text/html");
    expect(html).toContain(`<script src="page.js"`);
    expect(script.status).toBe(200);
    expect(script.headers.get("content-type")).toContain("javascript");
    expect(await script.text()).toContain("bundle.json");
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

  test("answers 404 for anything else", async () => {
    const { url } = await preview();

    expect((await fetch(new URL("secrets.txt", url))).status).toBe(404);
  });
});
