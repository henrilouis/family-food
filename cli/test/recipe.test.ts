import { readFile } from "node:fs/promises";
import { createServer, type IncomingHttpHeaders, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import path from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import { sandbox } from "./harness.ts";

const fixtures = path.join(import.meta.dirname, "fixtures/recipe-pages");

type Request = { path: string; headers: IncomingHttpHeaders };
type Route = { status?: number; fixture?: string; body?: string; location?: string };

let server: Server | undefined;
afterEach(() => {
  server?.close();
  server = undefined;
});

/** A local web server standing in for recipe sites: serves fixture pages by path and records each request. */
async function site(routes: Record<string, Route>): Promise<{ url: (p: string) => string; requests: Request[] }> {
  const requests: Request[] = [];
  server = createServer(async (req, res) => {
    requests.push({ path: req.url ?? "", headers: req.headers });
    const route = routes[req.url ?? ""];
    if (!route) {
      res.writeHead(404).end("Not found");
      return;
    }
    const body = route.fixture ? await readFile(path.join(fixtures, route.fixture), "utf8") : (route.body ?? "");
    res.writeHead(route.status ?? 200, { "content-type": "text/html; charset=utf-8", ...(route.location ? { location: route.location } : {}) });
    res.end(body);
  });
  await new Promise<void>((resolve) => server!.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;
  return { url: (p) => `http://127.0.0.1:${port}${p}`, requests };
}

describe("food recipe published", () => {
  test("names the published Week Menus that link the Recipe, as a dinner or a side", async () => {
    const { run } = await sandbox();

    const dinner = await run(["recipe", "published", "Dahl", "--json"], { now: "2026-11-21T10:00" });
    const side = await run(["recipe", "published", "Naan", "--json"], { now: "2026-11-20T10:00" });

    expect(dinner.stderr).toBe("");
    expect(dinner.code).toBe(0);
    expect(JSON.parse(dinner.stdout)).toEqual({ recipe: "Dahl", weekMenus: ["2026-11-21"] });
    expect(JSON.parse(side.stdout)).toEqual({ recipe: "Naan", weekMenus: ["2026-11-14", "2026-11-21"] });
  });

  test("gives none for a Recipe no published Week Menu links", async () => {
    const { run } = await sandbox();

    const json = await run(["recipe", "published", "Lemony Chickpea Stew", "--json"], { now: "2026-11-21T10:00" });
    const text = await run(["recipe", "published", "Lemony Chickpea Stew"], { now: "2026-11-21T10:00" });
    const textPublished = await run(["recipe", "published", "Dahl"], { now: "2026-11-21T10:00" });

    expect(JSON.parse(json.stdout)).toEqual({ recipe: "Lemony Chickpea Stew", weekMenus: [] });
    expect(text.code).toBe(0);
    expect(text.stdout).toMatch(/Lemony Chickpea Stew isn't on a published Week Menu/);
    expect(textPublished.stdout).toMatch(/Dahl is on the published Week Menu of 2026-11-21: run `food publish`/);
  });
});

describe("food recipe fetch", () => {
  test("reads the schema.org Recipe on an open recipe site's page, cleaned up for the skill", async () => {
    const { run } = await sandbox();
    const { url } = await site({ "/lemony-chickpea-stew/": { fixture: "wordpress-graph.html" } });

    const result = await run(["recipe", "fetch", url("/lemony-chickpea-stew/")]);

    expect(result.stderr).toBe("");
    expect(result.code).toBe(0);
    expect(JSON.parse(result.stdout)).toEqual({
      url: url("/lemony-chickpea-stew/"),
      title: "Lemony Chickpea Stew",
      servings: 4,
      yield: ["4", "4 to 6 servings"],
      prepMinutes: 15,
      cookMinutes: 35,
      totalMinutes: 50,
      cuisine: "Mediterranean",
      category: "Main Course",
      diets: ["VegetarianDiet"],
      language: "en-US",
      ingredients: [
        "2 tablespoons extra-virgin olive oil",
        "1 cup diced yellow onion",
        "2 (15-ounce) cans chickpeas, drained & rinsed",
        "¼ teaspoon red pepper flakes",
        "4 cups vegetable broth",
        "Juice of 1 lemon",
      ],
      steps: [
        { section: "For the stew", text: "Heat the olive oil in a large pot over medium heat. Add the onion and cook for 5 minutes." },
        { section: "For the stew", text: "Add the chickpeas, red pepper flakes and broth. Simmer for 20 minutes." },
        { section: "To finish", text: "Stir in the lemon juice and season to taste. It’s best the next day." },
      ],
    });
  });

  test("reads a Recipe whose JSON-LD stands alone, has one instructions string and comes after a broken block", async () => {
    const { run } = await sandbox();
    const { url } = await site({ "/pompoenrisotto/": { fixture: "plain-recipe.html" } });

    const result = await run(["recipe", "fetch", url("/pompoenrisotto/")]);

    expect(result.code).toBe(0);
    expect(JSON.parse(result.stdout)).toEqual({
      url: url("/pompoenrisotto/"),
      title: "Pompoenrisotto met salie",
      servings: 3,
      yield: ["Serves 3"],
      prepMinutes: null,
      cookMinutes: null,
      totalMinutes: 90,
      cuisine: null,
      category: null,
      diets: [],
      language: "nl-NL",
      ingredients: ["1 pompoen", "300 gr risottorijst", "8 blaadjes salie"],
      steps: [
        { section: null, text: "Snijd de pompoen in blokjes." },
        { section: null, text: "Rooster de pompoen 30 minuten op 200°C." },
        { section: null, text: "Kook de risotto en roer de pompoen erdoor." },
      ],
    });
  });

  test("gives no steps when the JSON-LD has none, for the skill to read them from the page", async () => {
    const { run } = await sandbox();
    const { url } = await site({ "/traybake/": { fixture: "no-steps.html" } });

    const result = await run(["recipe", "fetch", url("/traybake/")]);

    expect(result.code).toBe(0);
    expect(JSON.parse(result.stdout)).toMatchObject({ servings: 4, yield: ["4"], prepMinutes: 20, cookMinutes: 40, totalMinutes: null, steps: [] });
  });

  test("says honestly who is fetching", async () => {
    const { run } = await sandbox();
    const { url, requests } = await site({ "/stew/": { fixture: "wordpress-graph.html" } });

    await run(["recipe", "fetch", url("/stew/")]);

    expect(requests).toHaveLength(1);
    expect(requests[0].headers["user-agent"]).toMatch(/^family-food\/[\d.]+ \(.*\+https:\/\/github\.com\/henrilouis\/family-food\)$/);
  });

  test.each([
    ["NYT Cooking", "https://cooking.nytimes.com/recipes/1023456-chana-masala"],
    ["Serious Eats", "https://www.seriouseats.com/vegetable-biryani-5324853"],
    ["The Guardian", "https://www.theguardian.com/food/2026/nov/14/meera-sodha-vegan-recipe"],
  ])("refuses to fetch from %s, whose robots.txt blocks AI agents (exit 2)", async (site, url) => {
    const { run } = await sandbox();

    const result = await run(["recipe", "fetch", url]);

    expect(result.code).toBe(2);
    expect(result.stdout).toBe("");
    expect(result.stderr).toContain(site);
    expect(result.stderr).toMatch(/paste/i);
  });

  test("leaves Allerhande pages alone for now (exit 2): ah.nl blocks automated reads", async () => {
    const { run } = await sandbox();

    const result = await run(["recipe", "fetch", "https://www.ah.nl/allerhande/recept/R-R1302900/witte-kool-orzo"]);

    expect(result.code).toBe(2);
    expect(result.stderr).toContain("Allerhande");
    expect(result.stderr).toMatch(/paste/i);
  });

  test.each([
    ["a page without a schema.org Recipe", { fixture: "no-recipe.html" }, /no schema\.org Recipe/],
    ["a page the site won't serve", { status: 403, body: "Security Verification" }, /HTTP 403/],
  ])("%s exits 3 so the skill reads the page another way", async (_, route, message) => {
    const { run } = await sandbox();
    const { url } = await site({ "/page/": route });

    const result = await run(["recipe", "fetch", url("/page/")]);

    expect(result.code).toBe(3);
    expect(result.stdout).toBe("");
    expect(result.stderr).toMatch(message);
  });

  test("asks for a web address when given something else", async () => {
    const { run } = await sandbox();

    const result = await run(["recipe", "fetch", "Lemony Chickpea Stew"]);

    expect(result.code).toBe(1);
    expect(result.stderr).toMatch(/^Not a web address: "Lemony Chickpea Stew"/);
  });

  test("under test, fetches only from this Mac", async () => {
    const { run } = await sandbox();

    const result = await run(["recipe", "fetch", "https://recipes.invalid/stew/"]);

    expect(result.code).toBe(3);
    expect(result.stderr).toMatch(/only fetch.*this Mac/);
  });

  test("refuses a redirect onto an excluded site without following it", async () => {
    const { run } = await sandbox();
    const { url, requests } = await site({ "/r/": { status: 301, location: "https://cooking.nytimes.com/recipes/1023456-chana-masala" } });

    const result = await run(["recipe", "fetch", url("/r/")]);

    expect(result.code).toBe(2);
    expect(result.stderr).toContain("NYT Cooking");
    expect(requests.map((r) => r.path)).toEqual(["/r/"]);
  });

  test("follows ordinary redirects and reports the page it landed on", async () => {
    const { run } = await sandbox();
    const { url } = await site({ "/old/": { status: 302, location: "/lemony-chickpea-stew/" }, "/lemony-chickpea-stew/": { fixture: "wordpress-graph.html" } });

    const result = await run(["recipe", "fetch", url("/old/")]);

    expect(result.code).toBe(0);
    expect(JSON.parse(result.stdout)).toMatchObject({ url: url("/lemony-chickpea-stew/"), title: "Lemony Chickpea Stew" });
  });
});
