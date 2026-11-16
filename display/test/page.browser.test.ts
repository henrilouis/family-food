// Seam 2 in a real browser: the Kitchen Display page served by `food preview` from the sample vault,
// in headless Chrome with a fixed clock.
import type { ChildProcess } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { chromium, type Browser, type Page } from "playwright-core";
import { afterAll, afterEach, beforeAll, describe, expect, test } from "vitest";
import { sandbox } from "../../cli/test/harness.ts";

const MINUTE = 60_000;

let browser: Browser;
let server: ChildProcess | undefined;

beforeAll(async () => {
  browser = await chromium.launch({ channel: "chrome" });
});
afterAll(async () => {
  await browser?.close();
});
afterEach(() => {
  server?.kill();
  server = undefined;
});

/**
 * Opens the page at local time `now` (Europe/Amsterdam), served by `food preview` from a fresh copy of
 * the sample vault, published at that same time. Returns the page, the vault and a count of page loads.
 */
async function openPage(now: string) {
  const box = await sandbox();
  const started = await box.start(["preview", "--port", "0"], /(http:\/\/localhost:\d+\/)/, { now });
  server = started.process;
  const context = await browser.newContext({ timezoneId: "Europe/Amsterdam", viewport: { width: 632, height: 840 } });
  const page = await context.newPage();
  await page.clock.install({ time: new Date(now) });
  const loads = { count: 0 };
  page.on("load", () => loads.count++);
  await page.goto(started.match[1]);
  await shows(page, /\S/);
  return { page, vault: box.vault, loads };
}

const text = (page: Page) => page.locator("#app").innerText();
const shows = (page: Page, expected: RegExp) => expect.poll(() => text(page)).toMatch(expected);

describe("the Kitchen Display page in a browser", { timeout: 30_000 }, () => {
  test("PageDown and PageUp turn the pages", async () => {
    const { page } = await openPage("2026-11-22T18:00");
    await shows(page, /Vegetable Biryani/);
    const ingredients = await text(page);

    await page.keyboard.press("PageDown");
    await shows(page, /Step 1 of 7/);
    await page.keyboard.press("PageDown");
    await shows(page, /Step 2 of 7/);
    await page.keyboard.press("PageUp");
    await page.keyboard.press("PageUp");

    await expect.poll(() => text(page)).toBe(ingredients);
  });

  test("a new version reloads the page within five minutes, on the same step", async () => {
    const { page, vault, loads } = await openPage("2026-11-22T18:00");
    await page.keyboard.press("PageDown");
    await page.keyboard.press("PageDown");
    await shows(page, /Step 2 of 7/);

    const biryani = path.join(vault, "Meals/Vegetable Biryani.md");
    await writeFile(biryani, (await readFile(biryani, "utf8")).replace("until the water runs clear", "three times"));
    const reloaded = page.waitForEvent("load");
    await page.clock.runFor(5 * MINUTE);
    await reloaded;

    expect(loads.count).toBe(2);
    await shows(page, /Step 2 of 7[\s\S]*Rinse 400 g basmati rice three times/);
  });

  test("an unchanged version does not reload the page", async () => {
    const { page, loads } = await openPage("2026-11-22T18:00");
    await page.keyboard.press("PageDown");
    await shows(page, /Step 1 of 7/);

    const polled = page.waitForResponse(/version\.json/);
    await page.clock.runFor(5 * MINUTE);
    await polled;
    await page.waitForTimeout(500);

    expect(loads.count).toBe(1);
    await shows(page, /Step 1 of 7/);
  });

  test("at 03:00 the page moves on to the new day's ingredients", async () => {
    const { page, loads } = await openPage("2026-11-22T23:00");
    await page.keyboard.press("PageDown");
    await page.keyboard.press("PageDown");
    await shows(page, /Step 2 of 7/);

    await page.clock.fastForward(3 * 60 * MINUTE + 59 * MINUTE);
    await page.waitForTimeout(200);
    await shows(page, /Step 2 of 7/);

    await page.clock.fastForward(MINUTE);
    await shows(page, /^Mon 23 Nov · Today\s+Dahl[\s\S]*Naan/);
    expect(loads.count).toBe(1);
  });
});
